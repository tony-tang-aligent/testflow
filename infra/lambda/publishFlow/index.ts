// infra/lambda/publishFlow/index.ts
//
// "Publish" = compile the graph, then either create or update the ONE state
// machine for this document type (spec §2). No CDK deploy involved - this is
// a plain SDK call. DocumentTypePublishedFlow is what makes "only one active
// flow per document type" real: publishing overwrites that row, and it's
// what the upstream Portalink pipeline reads to find the right state machine.

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, CreateStateMachineCommand, UpdateStateMachineCommand } from '@aws-sdk/client-sfn';
import { compile, FlowGraph } from '@workspace/flow-compiler';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfnClient = new SFNClient({});

const FLOW_TABLE = process.env.PUBLISHED_FLOW_TABLE_NAME ?? 'DocumentTypePublishedFlow';
const EXECUTOR_ARN = process.env.FLOW_EXECUTOR_ARN ?? '';
const STATE_MACHINE_ROLE_ARN = process.env.FLOW_STATE_MACHINE_ROLE_ARN ?? '';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const graph = JSON.parse(event.body ?? '{}') as FlowGraph;

  const result = compile(graph);
  if (!result.success) {
    return json(422, { message: 'Flow has validation errors', violations: result.violations });
  }

  const definitionJson = JSON.stringify(result.definition).replaceAll('${FlowNodeExecutorArn}', EXECUTOR_ARN);

  const existing = await ddb.send(
    new GetCommand({ TableName: FLOW_TABLE, Key: { documentType: graph.documentType } }),
  );
  const stateMachineName = `order-validator-${graph.documentType.toLowerCase()}`;

  let stateMachineArn: string;
  if (existing.Item?.stateMachineArn) {
    stateMachineArn = existing.Item.stateMachineArn;
    await sfnClient.send(new UpdateStateMachineCommand({ stateMachineArn, definition: definitionJson }));
  } else {
    const created = await sfnClient.send(
      new CreateStateMachineCommand({
        name: stateMachineName,
        definition: definitionJson,
        roleArn: STATE_MACHINE_ROLE_ARN,
      }),
    );
    stateMachineArn = created.stateMachineArn!;
  }

  await ddb.send(
    new PutCommand({
      TableName: FLOW_TABLE,
      Item: {
        documentType: graph.documentType,
        flowId: graph.flowId,
        stateMachineArn,
        publishedAt: new Date().toISOString(),
      },
    }),
  );

  return json(200, { stateMachineArn, message: `Published - ${graph.documentType} now runs this flow.` });
};
