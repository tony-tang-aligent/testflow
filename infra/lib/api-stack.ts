// infra/lib/api-stack.ts
//
// Thin CRUD API in front of the config tables + S3 detail store. Deployed once per
// client alongside OrderValidatorStack, referencing its tables/bucket by name.
//
// TODO(auth): add a Cognito User Pool + HttpJwtAuthorizer on every route below.
// Currently NO authorizer is attached - do not deploy this to a real AWS account
// as-is; every route is wide open until auth lands.
// TODO(RDS): once the identity/org control plane exists, authContext.ts's stub
// needs real RDS connectivity (VPC config on these Lambdas, or RDS Data API IAM perms).

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface ApiStackProps extends cdk.StackProps {
  clientName: string;
  ruleTable: dynamodb.ITable;
  flowTable: dynamodb.ITable;
  summaryTable: dynamodb.ITable;
  detailBucket: s3.IBucket;
  stateMachine: sfn.IStateMachine;
}

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { clientName, ruleTable, flowTable, summaryTable, detailBucket, stateMachine } = props;

    const sharedEnv = {
      RULE_TABLE_NAME: ruleTable.tableName,
      FLOW_TABLE_NAME: flowTable.tableName,
      SUMMARY_TABLE_NAME: summaryTable.tableName,
      EXECUTION_DETAIL_BUCKET: detailBucket.bucketName,
    };

    const rulesFn = new lambda.NodejsFunction(this, 'RulesHandler', {
      entry: path.join(__dirname, '../api/handlers/rules.ts'),
      environment: sharedEnv,
      runtime: Runtime.NODEJS_20_X,
    });
    const flowFn = new lambda.NodejsFunction(this, 'FlowHandler', {
      entry: path.join(__dirname, '../api/handlers/flows.ts'),
      environment: sharedEnv,
      runtime: Runtime.NODEJS_20_X,
    });
    const executionsFn = new lambda.NodejsFunction(this, 'ExecutionsHandler', {
      entry: path.join(__dirname, '../api/handlers/executions.ts'),
      environment: sharedEnv,
      runtime: Runtime.NODEJS_20_X,
    });
    const testExecutionFn = new lambda.NodejsFunction(this, 'TestExecutionHandler', {
      entry: path.join(__dirname, '../api/handlers/testExecution.ts'),
      environment: { ...sharedEnv, STATE_MACHINE_ARN: stateMachine.stateMachineArn },
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
    });
    const correctionFn = new lambda.NodejsFunction(this, 'CorrectionHandler', {
      entry: path.join(__dirname, '../api/handlers/correction.ts'),
      environment: sharedEnv,
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
    });

    ruleTable.grantReadWriteData(rulesFn);
    ruleTable.grantReadWriteData(flowFn); // flows.ts's DELETE cascades to the flow's rules
    flowTable.grantReadWriteData(flowFn);
    summaryTable.grantReadData(executionsFn);
    detailBucket.grantRead(executionsFn);
    stateMachine.grantStartExecution(testExecutionFn);
    summaryTable.grantReadWriteData(correctionFn); // reads the task token, clears it after use
    stateMachine.grantTaskResponse(correctionFn); // states:SendTaskSuccess/SendTaskFailure only

    const internalAuthorizerFn = new lambda.NodejsFunction(this, 'InternalAuthorizerFn', {
      entry: path.join(__dirname, '../api/handlers/internalAuthorizer.ts'),
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
    });
    internalAuthorizerFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:order-validator/*`],
      }),
    );

    const internalAuthorizer = new apigwv2Authorizers.HttpLambdaAuthorizer(
      'InternalAuthorizer',
      internalAuthorizerFn,
      {
        responseTypes: [apigwv2Authorizers.HttpLambdaResponseType.SIMPLE],
        // Explicit, not relying on the CDK default (which falls back to the
        // Authorization header - never sent here, since this authorizer
        // reads x-internal-api-key instead). Without this, every request's
        // cache key was identical regardless of the actual key sent, so a
        // single stale unauthorized decision got served to every subsequent
        // request - including a freshly-corrected key - for the full 5-minute
        // TTL, no matter what.
        identitySource: ['$request.header.x-internal-api-key'],
        resultsCacheTtl: cdk.Duration.minutes(5),
      },
    );

    const httpApi = new apigwv2.HttpApi(this, 'OrderValidatorApi', {
      apiName: `${clientName}-flexval-api`,
      // Every route requires the shared-secret authorizer above - the browser
      // never calls this API directly; only apps/web's Next.js server does,
      // after it has already resolved real per-user authorization against
      // packages/db (Option 2 from the auth scoping conversation).
      defaultAuthorizer: internalAuthorizer,
      // TODO: tighten allowOrigins to the real Amplify domain(s) once a custom
      // domain is attached - the amplifyapp.com default domain is fine for now
      // since nothing here is authenticated yet anyway.
      corsPreflight: {
        allowOrigins: ['https://main.drud3wq7txj7c.amplifyapp.com', 'http://localhost:3000'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['content-type', 'authorization', 'x-internal-api-key'],
        maxAge: cdk.Duration.days(1),
      },
    });

    const rulesIntegration = new integrations.HttpLambdaIntegration('RulesIntegration', rulesFn);
    const flowIntegration = new integrations.HttpLambdaIntegration('FlowIntegration', flowFn);
    const executionsIntegration = new integrations.HttpLambdaIntegration(
      'ExecutionsIntegration',
      executionsFn,
    );
    const testExecutionIntegration = new integrations.HttpLambdaIntegration(
      'TestExecutionIntegration',
      testExecutionFn,
    );
    const correctionIntegration = new integrations.HttpLambdaIntegration(
      'CorrectionIntegration',
      correctionFn,
    );

    httpApi.addRoutes({
      path: '/tenants/{tenantId}/flows',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: flowIntegration,
    });
    httpApi.addRoutes({
      path: '/tenants/{tenantId}/flows/{flowId}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: flowIntegration,
    });
    httpApi.addRoutes({
      path: '/tenants/{tenantId}/flows/{flowId}/rules',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT],
      integration: rulesIntegration,
    });
    httpApi.addRoutes({
      path: '/tenants/{tenantId}/flows/{flowId}/rules/{ruleId}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.DELETE],
      integration: rulesIntegration,
    });
    httpApi.addRoutes({
      path: '/tenants/{tenantId}/flows/{flowId}/executions',
      methods: [apigwv2.HttpMethod.GET],
      integration: executionsIntegration,
    });
    httpApi.addRoutes({
      path: '/tenants/{tenantId}/flows/{flowId}/executions/{executionId}',
      methods: [apigwv2.HttpMethod.GET],
      integration: executionsIntegration,
    });
    httpApi.addRoutes({
      path: '/tenants/{tenantId}/flows/{flowId}/test',
      methods: [apigwv2.HttpMethod.POST],
      integration: testExecutionIntegration,
    });
    httpApi.addRoutes({
      path: '/tenants/{tenantId}/flows/{flowId}/executions/{executionId}/correct',
      methods: [apigwv2.HttpMethod.POST],
      integration: correctionIntegration,
    });

    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
  }
}
