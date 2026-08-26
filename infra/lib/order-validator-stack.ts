// infra/lib/order-validator-stack.ts
//
// One instance of this stack is deployed per client (per the confirmed per-client
// deployment model), all sharing the same code/construct - only stack parameters
// (client name, adapterId, ERP secret) differ between deployments.
//
// TODO(RDS): this stack currently has no dependency on the identity/org control
// plane. Once built, the API layer Lambdas (see api/) will need permission to read
// RDS (via a VPC-attached Lambda or RDS Data API) - not modeled here yet.

import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface OrderValidatorStackProps extends cdk.StackProps {
  clientName: string; // e.g. 'modelflight' - used for resource naming per-client
  adapterId: string; // e.g. 'myob-advanced' | 'mock'
}

export class OrderValidatorStack extends cdk.Stack {
  // Exposed so ApiStack (deployed alongside this one, per client) can reference the
  // same tables/bucket without duplicating them.
  public readonly ruleTable: dynamodb.Table;
  public readonly flowTable: dynamodb.Table;
  public readonly summaryTable: dynamodb.Table;
  public readonly internalTable: dynamodb.Table;
  public readonly detailBucket: s3.Bucket;
  public readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: OrderValidatorStackProps) {
    super(scope, id, props);

    const { clientName, adapterId } = props;

    // ---------- Data layer ----------

    // TODO: these tables/bucket default to RemovalPolicy.DESTROY for now since
    // this is pre-production dev infra and destroy/recreate cycles are common
    // while iterating on the schema. Switch to RemovalPolicy.RETAIN (and
    // autoDeleteObjects: false on the bucket) before any real client data lands
    // here - DESTROY means `cdk destroy` silently deletes everything, no prompt.
    const ruleTable = new dynamodb.Table(this, 'RuleStore', {
      tableName: `${clientName}-RuleStore`,
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'ruleId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    // Rules are scoped per-flow, not tenant-wide - this GSI is what
    // getAllActiveRulesForScope queries. Active/scopeId filtering still happens
    // client-side after the query (see ddb.ts) since per-flow rule counts are
    // expected to stay small.
    ruleTable.addGlobalSecondaryIndex({
      indexName: 'byFlow',
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'flowId', type: dynamodb.AttributeType.STRING },
    });

    // One tenant can now have multiple flows (e.g. "AP invoice validation",
    // "PO order validation") - flowId is the sort key, so listing all of a
    // tenant's flows is a single plain Query on the partition key.
    const flowTable = new dynamodb.Table(this, 'FlowDefinition', {
      tableName: `${clientName}-FlowDefinition`,
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'flowId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const summaryTable = new dynamodb.Table(this, 'ValidationExecutionSummary', {
      tableName: `${clientName}-ValidationExecutionSummary`,
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'executionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Data the flow system itself owns - a running total, a cache, a lookup
    // table WE maintain - as opposed to an external ERP. The 'internal'
    // resolver source queries this directly, same table regardless of which
    // ERP adapter a flow is configured with. Write path isn't part of rule
    // evaluation - populated by some other process (sync job, future API route).
    const internalTable = new dynamodb.Table(this, 'InternalLookup', {
      tableName: `${clientName}-InternalLookup`,
      partitionKey: { name: 'tenantId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lookupKey', type: dynamodb.AttributeType.STRING }, // `${internalTable}:${key}`
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecovery: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const detailBucket = new s3.Bucket(this, 'ExecutionDetailBucket', {
      bucketName: `${clientName}-order-validation-detail`,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true, // required alongside DESTROY - CFN can't delete a non-empty bucket otherwise
      lifecycleRules: [{ noncurrentVersionExpiration: cdk.Duration.days(90) }],
    });

    this.ruleTable = ruleTable;
    this.flowTable = flowTable;
    this.summaryTable = summaryTable;
    this.internalTable = internalTable;
    this.detailBucket = detailBucket;

    // TODO: multi-region DR - if "global" turns out to mean failover rather than
    // latency, add DynamoDB Global Tables here (replicationRegions on each table)
    // and deploy this stack a second time into the DR region.

    const sharedEnv = {
      RULE_TABLE_NAME: ruleTable.tableName,
      FLOW_TABLE_NAME: flowTable.tableName,
      SUMMARY_TABLE_NAME: summaryTable.tableName,
      INTERNAL_TABLE_NAME: internalTable.tableName,
      EXECUTION_DETAIL_BUCKET: detailBucket.bucketName,
      ADAPTER_ID: adapterId,
    };

    // ---------- Lambdas ----------

    const loadFlowDefinitionFn = new lambda.NodejsFunction(this, 'LoadFlowDefinitionFn', {
      entry: path.join(__dirname, '../lambda/loadFlowDefinition/index.ts'),
      environment: sharedEnv,
      timeout: cdk.Duration.seconds(30),
      runtime: Runtime.NODEJS_20_X,
    });

    const resolveScopesFn = new lambda.NodejsFunction(this, 'ResolveScopesFn', {
      entry: path.join(__dirname, '../lambda/resolveScopes/index.ts'),
      environment: sharedEnv,
      timeout: cdk.Duration.seconds(60),
      runtime: Runtime.NODEJS_20_X,
    });

    const evaluateRulesFn = new lambda.NodejsFunction(this, 'EvaluateRulesFn', {
      entry: path.join(__dirname, '../lambda/evaluateRules/index.ts'),
      environment: sharedEnv,
      timeout: cdk.Duration.seconds(60),
      runtime: Runtime.NODEJS_20_X,
    });

    const aggregateFn = new lambda.NodejsFunction(this, 'AggregateFn', {
      entry: path.join(__dirname, '../lambda/aggregate/index.ts'),
      environment: sharedEnv,
      timeout: cdk.Duration.seconds(30),
      runtime: Runtime.NODEJS_20_X,
    });

    const awaitCorrectionFn = new lambda.NodejsFunction(this, 'AwaitCorrectionFn', {
      entry: path.join(__dirname, '../lambda/awaitCorrection/index.ts'),
      environment: sharedEnv,
      timeout: cdk.Duration.seconds(15),
      runtime: Runtime.NODEJS_20_X,
    });

    const applyCorrectionFn = new lambda.NodejsFunction(this, 'ApplyCorrectionFn', {
      entry: path.join(__dirname, '../lambda/applyCorrection/index.ts'),
      environment: sharedEnv,
      timeout: cdk.Duration.seconds(15),
      runtime: Runtime.NODEJS_20_X,
    });

    ruleTable.grantReadData(loadFlowDefinitionFn);
    flowTable.grantReadData(loadFlowDefinitionFn);
    summaryTable.grantWriteData(aggregateFn);
    detailBucket.grantWrite(aggregateFn);
    summaryTable.grantWriteData(awaitCorrectionFn);
    detailBucket.grantReadWrite(awaitCorrectionFn); // reads + re-writes the detail object's status
    internalTable.grantReadData(evaluateRulesFn); // 'internal' resolver source - see ruleEvaluator.ts

    // Secrets Manager access for the AI ('ai' resolver, BYOK) and generic HTTP
    // ('httpCall' resolver) escape hatches - both read a secret named
    // `order-validator/{tenantId}/{secretName}` (see secrets.ts). Scoped to that
    // naming prefix rather than granted broadly; no other secrets are readable.
    evaluateRulesFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:order-validator/*`,
        ],
      }),
    );
    // resolveScopesFn only needs ERP adapter network access (and Secrets Manager
    // read once the real MYOB adapter is wired up) - no direct DynamoDB/S3
    // permissions required.

    // ---------- State machine (static shape - see scoping notes on why this never
    // needs per-tenant compilation: variability lives in DynamoDB data, not topology) ----------

    const loadFlowDefinition = new tasks.LambdaInvoke(this, 'LoadFlowDefinition', {
      lambdaFunction: loadFlowDefinitionFn,
      outputPath: '$.Payload',
    });

    const resolveScopes = new tasks.LambdaInvoke(this, 'ResolveScopes', {
      lambdaFunction: resolveScopesFn,
      outputPath: '$.Payload',
    });

    // Outer Map: one branch per active scope (order, lineItem, shipment, ...).
    // Inner Distributed Map: batches of items within that scope (see ItemBatcher).
    const evaluateItemBatch = new tasks.LambdaInvoke(this, 'EvaluateItemBatch', {
      lambdaFunction: evaluateRulesFn,
      outputPath: '$.Payload',
    });

    const innerDistributedMap = new sfn.DistributedMap(this, 'ItemsMap', {
      itemsPath: '$.items',
      resultPath: '$.batchResults',
      // Once ItemBatcher produces batches, the item processor's own output for
      // this iteration is merged into $.batchResults alongside everything else
      // threaded in below - outputPath strips that back down to just the batch
      // results themselves, so the outer Map collects a clean EvaluateRulesOutput[][]
      // (one array per scope) instead of a pile of carried-through context.
      outputPath: '$.batchResults',
      itemBatcher: new sfn.ItemBatcher({
        maxItemsPerBatch: 10,
        // ItemBatcher's item processor input is a FIXED shape - { Items, BatchInput } -
        // not our own field names. batchInput is what actually lands in "BatchInput";
        // it's how tenantId/adapterId/scopeId/rules/prefetched (constant per scope,
        // not part of the item array itself) reach evaluateRules at all. Previously
        // missing entirely - the Lambda was receiving { Items, BatchInput: {} } and
        // destructuring a field that was never sent, hence "items is not iterable".
        batchInput: {
          'tenantId.$': '$.tenantId',
          'adapterId.$': '$.adapterId',
          'scopeId.$': '$.scopeId',
          'derivationRules.$': '$.derivationRules',
          'validationRules.$': '$.validationRules',
          'prefetched.$': '$.prefetched',
        },
      }),
    });
    innerDistributedMap.itemProcessor(evaluateItemBatch);

    const outerScopeMap = new sfn.Map(this, 'ScopesMap', {
      // itemScopes, not scopes - resolveScopes deliberately keeps `scopes`
      // (the original itemsPath-shaped config) untouched and puts the
      // items-populated version here instead, specifically so a correction
      // loop can feed the untouched `scopes` back into resolveScopes again
      // without a field-name collision (see resolveScopes/index.ts).
      itemsPath: '$.itemScopes',
      resultPath: '$.scopeResults',
      maxConcurrency: 4,
      // Without this, each scope-iteration's input is JUST that scope element
      // ($$.Map.Item.Value) - tenantId/adapterId/prefetched, which are siblings
      // of `itemScopes` in resolveScopes' output (not children of each scope
      // entry), would be silently lost before they ever reach innerDistributedMap.
      itemSelector: {
        'scopeId.$': '$$.Map.Item.Value.scopeId',
        'items.$': '$$.Map.Item.Value.items',
        'derivationRules.$': '$$.Map.Item.Value.derivationRules',
        'validationRules.$': '$$.Map.Item.Value.validationRules',
        'tenantId.$': '$.input.tenantId',
        'adapterId.$': '$.flowDefinition.adapterId',
        'prefetched.$': '$.prefetched',
      },
    });
    outerScopeMap.itemProcessor(innerDistributedMap);

    const aggregate = new tasks.LambdaInvoke(this, 'Aggregate', {
      lambdaFunction: aggregateFn,
      // resultPath (not outputPath) - preserves flowDefinition/scopes/dismissedWarnings
      // from earlier in the state, since a loop back to resolveScopes needs them.
      // resultSelector narrows the merged-in field to just the Lambda's actual
      // return value, not the full LambdaInvoke response envelope.
      resultSelector: { 'result.$': '$.Payload' },
      resultPath: '$.aggregateResult',
    });

    const awaitCorrection = new tasks.LambdaInvoke(this, 'AwaitCorrection', {
      lambdaFunction: awaitCorrectionFn,
      // The execution genuinely pauses here - no polling, no cost while idle -
      // until /correct calls SendTaskSuccess with this token. That call's
      // `output` becomes this state's result (see resultPath below), not
      // whatever awaitCorrectionFn itself returns.
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        // No manual '.$' here - JsonPath.taskToken returns an already-marked
        // JsonPath value; CDK's own renderer detects that and appends '.$' to
        // the key itself when synthesizing ASL. Adding it manually (as before)
        // produced a malformed/empty token field, which is exactly why
        // awaitCorrectionFn's `input.token` came through undefined at runtime.
        token: sfn.JsonPath.taskToken,
        'tenantId.$': '$.input.tenantId',
        'flowId.$': '$.input.flowId',
        'executionId.$': '$.input.executionId',
      }),
      resultPath: '$.correction',
      // "As long as it takes" - bounded only by AWS Standard workflows' own
      // 1-year execution cap, not by anything we're choosing here.
      timeout: cdk.Duration.days(365),
    });

    const applyCorrection = new tasks.LambdaInvoke(this, 'ApplyCorrection', {
      lambdaFunction: applyCorrectionFn,
      // Safe to fully replace state here (outputPath, not resultPath) - this
      // Lambda's own return value already IS the complete shape resolveScopes
      // expects (flowDefinition/scopes passed through, payload/dismissals updated).
      outputPath: '$.Payload',
    });

    // Loop: correcting and reapplying always lands back at resolveScopes, never
    // loadFlowDefinition - rules stay pinned to whatever was active when the
    // review started, not re-fetched mid-review.
    awaitCorrection.next(applyCorrection).next(resolveScopes);

    const validationComplete = new sfn.Succeed(this, 'ValidationComplete');

    const reviewChoice = new sfn.Choice(this, 'HasBlockingViolations')
      .when(sfn.Condition.stringEquals('$.aggregateResult.result.status', 'failed'), awaitCorrection)
      .otherwise(validationComplete);

    const definition = loadFlowDefinition
      .next(resolveScopes)
      .next(outerScopeMap)
      .next(aggregate)
      .next(reviewChoice);

    this.stateMachine = new sfn.StateMachine(this, 'ValidationStateMachine', {
      stateMachineName: `${clientName}-order-validation`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      // No overall timeout - a paused-for-review execution could legitimately
      // sit for a long time. The old 5-minute default here would have force-failed
      // any execution still waiting on a human past that mark. Bounded only by
      // AWS Standard workflows' own 1-year execution cap.
      logs: {
        destination: new logs.LogGroup(this, 'ValidationStateMachineLogs', {
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: sfn.LogLevel.ERROR,
      },
    });

    // ---------- TODOs deliberately not modeled in this stack ----------
    // TODO(auth): API Gateway + Cognito authorizer for the FE (see api/ for handler
    //   stubs) - not part of this core-execution stack; wire up separately.
    // TODO(RDS): tenant/company/user identity plane - separate stack, VPC-attached
    //   Aurora Serverless v2, referenced by tenantId from this stack's tables.
  }
}
