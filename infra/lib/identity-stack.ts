// infra/lib/identity-stack.ts
//
// The control plane: WHO can sign in (Cognito, federated to Azure AD) and
// WHAT they can do (Aurora Serverless v2 Postgres, via packages/db). Entirely
// separate from OrderValidatorStack/ApiStack (the per-client flow engine) -
// this stack exists once for the whole platform, not once per client.
//
// TODO: the exact aws-cdk-lib API surface for Aurora Serverless v2 + Data API
// has moved around release-to-release - verify enableDataApi and the
// ServerlessV2 capacity props against whatever aws-cdk-lib version is
// actually installed before deploying; this is written against the shape
// current as of early-2026 CDK, flagged here rather than asserted with false
// confidence.

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface IdentityStackProps extends cdk.StackProps {
  // Azure AD app registration details - real values come from Secrets
  // Manager/SSM at deploy time, never hardcoded. Placeholder context values
  // here just document what's needed.
  azureAdClientId: string;
  azureAdClientSecret: string;
  azureAdIssuerUrl: string; // e.g. https://login.microsoftonline.com/{tenantId}/v2.0
  // The real deployed apps/web URL (e.g. https://main.xxxxx.amplifyapp.com) -
  // read from DEPLOYED_APP_URL in infra/.env. Always adds localhost:3000
  // alongside it, so local dev keeps working without needing a separate
  // deploy every time you switch between testing locally and on Amplify.
  deployedAppUrl?: string;
}

export class IdentityStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly dbCluster: rds.DatabaseCluster;
  public readonly dbSecret: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props: IdentityStackProps) {
    super(scope, id, props);

    // ---------- Cognito, federated to Azure AD ----------

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'flexval-users',
      selfSignUpEnabled: false, // every user arrives via Azure AD federation or a B2B guest invite, never a public sign-up form
      removalPolicy: cdk.RemovalPolicy.DESTROY, // TODO: switch back to RETAIN once real users exist - RETAIN during iterative setup just leaves orphaned pools behind on every failed deploy (see the three "order-validator-users" pools from this exact issue)
    });

    const azureAdProvider = new cognito.UserPoolIdentityProviderOidc(this, 'AzureAd', {
      userPool: this.userPool,
      name: 'AzureAD',
      clientId: props.azureAdClientId,
      clientSecret: props.azureAdClientSecret,
      issuerUrl: props.azureAdIssuerUrl,
      scopes: ['openid', 'email', 'profile'],
      attributeMapping: {
        email: cognito.ProviderAttribute.other('email'),
      },
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      generateSecret: true, // NextAuth's server-side Cognito provider needs a client secret
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        // Both localhost (local dev) and the real deployed URL are allowed at
        // once, so switching between the two doesn't need a redeploy each
        // time - see IdentityStackProps.deployedAppUrl.
        callbackUrls: [
          'http://localhost:3000/api/auth/callback/cognito',
          ...(props.deployedAppUrl ? [`${props.deployedAppUrl}/api/auth/callback/cognito`] : []),
        ],
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.custom('AzureAD')],
    });
    this.userPoolClient.node.addDependency(azureAdProvider);

    new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        // Globally unique across all of Cognito - flexval-auth chosen over the
        // earlier generic placeholder specifically to avoid collision risk.
        domainPrefix: 'flexval-auth',
      },
    });

    // What actually needs to go in apps/web/.env.local - AUTH_COGNITO_ISSUER
    // is COGNITO's own issuer, NOT Azure AD's (a common mix-up: NextAuth's
    // Cognito provider only ever talks to Cognito's endpoints; Azure AD is
    // wired in as an upstream IdP inside Cognito, above, and NextAuth never
    // sees it directly). AUTH_COGNITO_SECRET isn't output here on purpose -
    // CDK can't safely print a real secret value into CloudFormation outputs;
    // retrieve it with:
    //   aws cognito-idp describe-user-pool-client --user-pool-id <UserPoolId> \
    //     --client-id <UserPoolClientId> --query 'UserPoolClient.ClientSecret'
    new cdk.CfnOutput(this, 'AuthCognitoIssuer', {
      value: `https://cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
      description: 'AUTH_COGNITO_ISSUER',
    });
    new cdk.CfnOutput(this, 'AuthCognitoId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'AUTH_COGNITO_ID',
    });
    new cdk.CfnOutput(this, 'UserPoolIdForSecretLookup', { value: this.userPool.userPoolId });

    // ---------- Aurora Serverless v2 (PostgreSQL) + Data API ----------
    // Data API means no VPC networking needed from Lambda/Next.js - confirmed
    // during scoping that Aurora Serverless v2 + PostgreSQL fully supports it
    // (redesigned Dec 2023, no rate limit). Still need a VPC for the cluster
    // itself, just not for anything that talks to it.

    const vpc = new ec2.Vpc(this, 'DbVpc', {
      maxAzs: 2,
      natGateways: 0, // nothing in this VPC needs outbound internet access
    });

    this.dbCluster = new rds.DatabaseCluster(this, 'ControlPlaneDb', {
      // Using .of() rather than a named VER_15_x constant deliberately - this
      // is the second time a hardcoded Aurora minor version has gone stale
      // (was VER_15_4, no longer supported by RDS at all). AWS retires old
      // minor versions as new ones ship; .of() takes a plain version string,
      // so bumping this later doesn't depend on whichever aws-cdk-lib release
      // happens to be installed having already added a named constant for it.
      // 15.17 confirmed current as of AWS's April 2026 Aurora PostgreSQL
      // release notes - worth rechecking if this fails again down the line.
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.of('15.17', '15'),
      }),
      vpc,
      // Explicit, not just a workaround for the natGateways:0 error - Isolated
      // is the actually-correct subnet type here. Data API traffic reaches
      // the cluster via the AWS control plane, not through the VPC's own
      // routing, so it never needed a NAT/egress path in the first place.
      // Without this, DatabaseCluster defaults to expecting "Private" (with
      // egress) subnets, which don't exist once natGateways is 0 - CDK
      // silently reclassifies them as Isolated instead, hence the error.
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      writer: rds.ClusterInstance.serverlessV2('Writer'),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 4,
      defaultDatabaseName: 'order_validator',
      enableDataApi: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // TODO: switch back to RETAIN once this holds real data - same RETAIN-orphaning issue as the user pool above, and an orphaned Aurora cluster costs real money sitting idle, unlike an empty Cognito pool
    });
    this.dbSecret = this.dbCluster.secret!;

    new cdk.CfnOutput(this, 'DbClusterArn', { value: this.dbCluster.clusterArn, description: 'DB_CLUSTER_ARN' });
    new cdk.CfnOutput(this, 'DbSecretArn', { value: this.dbSecret.secretArn, description: 'DB_SECRET_ARN' });

    // ---------- First-run bootstrap: platform-admin seeding ----------
    // TODO: no self-service way to create the very FIRST platform-admin yet
    // (chicken-and-egg - someone has to exist before anyone can use the admin
    // UI to grant that role). For now this is a manual step: run a one-off
    // script against packages/db's grantPlatformAdmin() after your own first
    // sign-in. A proper bootstrap Lambda (e.g. seeded from a CDK context
    // parameter with your own email) is a reasonable fast-follow, not built
    // here to avoid a footgun (an env-var-configured "give this email
    // platform-admin" running on every deploy indefinitely).
  }
}
