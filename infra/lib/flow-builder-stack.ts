// infra/lib/flow-builder-stack.ts
//
// The new canvas/compiler system (flow-compiler-spec.md) - separate from
// OrderValidatorStack/ApiStack (the old scopes-and-rules engine), since this
// is a genuinely different execution model (arbitrary-node graphs compiled
// to ASL, not one fixed topology driven by DynamoDB rows).

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export class FlowBuilderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const flowDraftTable = new dynamodb.Table(this, 'FlowDraft', {
      partitionKey: { name: 'flowId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    flowDraftTable.addGlobalSecondaryIndex({
      indexName: 'byDocumentType',
      partitionKey: { name: 'documentType', type: dynamodb.AttributeType.STRING },
    });

    const publishedFlowTable = new dynamodb.Table(this, 'DocumentTypePublishedFlow', {
      partitionKey: { name: 'documentType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    const flowExecutorFn = new lambda.NodejsFunction(this, 'FlowExecutorFn', {
      entry: path.join(__dirname, '../lambda/flowExecutor/index.ts'),
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
    });

    const flowStateMachineRole = new iam.Role(this, 'FlowStateMachineRole', {
      assumedBy: new iam.ServicePrincipal('states.amazonaws.com'),
    });
    flowExecutorFn.grantInvoke(flowStateMachineRole);

    const publishFlowFn = new lambda.NodejsFunction(this, 'PublishFlowFn', {
      entry: path.join(__dirname, '../lambda/publishFlow/index.ts'),
      runtime: Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        PUBLISHED_FLOW_TABLE_NAME: publishedFlowTable.tableName,
        FLOW_EXECUTOR_ARN: flowExecutorFn.functionArn,
        FLOW_STATE_MACHINE_ROLE_ARN: flowStateMachineRole.roleArn,
      },
    });
    publishedFlowTable.grantReadWriteData(publishFlowFn);
    publishFlowFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['states:CreateStateMachine', 'states:UpdateStateMachine', 'states:DescribeStateMachine'],
          resources: ['*'],
        }),
    );
    publishFlowFn.addToRolePolicy(
        new iam.PolicyStatement({ actions: ['iam:PassRole'], resources: [flowStateMachineRole.roleArn] }),
    );

    const draftFn = new lambda.NodejsFunction(this, 'FlowDraftFn', {
      entry: path.join(__dirname, '../api/handlers/flowDrafts.ts'),
      runtime: Runtime.NODEJS_20_X,
      environment: { FLOW_DRAFT_TABLE_NAME: flowDraftTable.tableName },
    });
    flowDraftTable.grantReadWriteData(draftFn);

    // Deliberately public, unlike the old validator's API - the flow-builder
    // canvas (apps/web/app/flow-builder/**) calls this directly from the
    // browser, with no server-side proxy layer built for it. A shared-secret
    // authorizer here would need that secret sent from client-side code,
    // which would mean exposing it via a NEXT_PUBLIC_ env var - defeating the
    // whole point of it being a secret. Real per-org/per-client authorization
    // for this API is a known, documented gap (see the flow-builder build
    // summary) - not fixed here, just not silently pretending to be secure
    // with a broken mechanism instead.
    const httpApi = new apigwv2.HttpApi(this, 'FlowBuilderApi', {
      corsPreflight: {
        // Matches api-stack.ts's CORS config - was never updated to include
        // the real deployed domain when this stack was first built, still
        // testing against localhost only at the time.
        allowOrigins: ['https://main.drud3wq7txj7c.amplifyapp.com', 'http://localhost:3000'],
        allowMethods: [apigwv2.CorsHttpMethod.GET, apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['content-type'],
      },
    });

    httpApi.addRoutes({
      path: '/flow-drafts',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('DraftIntegration', draftFn),
    });
    httpApi.addRoutes({
      path: '/flow-drafts/{flowId}',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.PUT],
      integration: new integrations.HttpLambdaIntegration('DraftItemIntegration', draftFn),
    });
    httpApi.addRoutes({
      path: '/flow-drafts/{flowId}/publish',
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration('PublishIntegration', publishFlowFn),
    });

    new cdk.CfnOutput(this, 'FlowBuilderApiUrl', { value: httpApi.apiEndpoint });
  }
}