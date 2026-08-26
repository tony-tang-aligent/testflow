// infra/api/handlers/flowDrafts.ts
import { randomUUID } from 'crypto';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { FlowGraph } from '@workspace/flow-compiler';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.FLOW_DRAFT_TABLE_NAME ?? 'FlowDraft';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const flowId = event.pathParameters?.flowId;
  const method = event.requestContext.http.method;

  if (!flowId && method === 'GET') {
    const documentType = event.queryStringParameters?.documentType;
    if (documentType) {
      const res = await client.send(
        new QueryCommand({
          TableName: TABLE,
          IndexName: 'byDocumentType',
          KeyConditionExpression: 'documentType = :d',
          ExpressionAttributeValues: { ':d': documentType },
        }),
      );
      return json(200, res.Items ?? []);
    }
    return json(400, { message: 'documentType query param required' });
  }

  if (!flowId && method === 'POST') {
    const body = JSON.parse(event.body ?? '{}') as Partial<FlowGraph>;
    const newFlowId = randomUUID();
    const draft: FlowGraph = {
      flowId: newFlowId,
      documentType: body.documentType ?? 'Order',
      // Every flow needs exactly one starting point - documentInput is a
      // singleton, deliberately excluded from the palette (nothing to drag
      // twice), which previously meant nothing ever added it at all. Auto-add
      // it here so a brand-new draft is never a genuinely empty, unusable canvas.
      nodes: body.nodes ?? [{ id: 'start', type: 'documentInput', position: { x: 250, y: 60 }, config: {} }],
      edges: body.edges ?? [],
    };
    await client.send(new PutCommand({ TableName: TABLE, Item: draft }));
    return json(201, draft);
  }

  if (flowId && method === 'GET') {
    const res = await client.send(new GetCommand({ TableName: TABLE, Key: { flowId } }));
    if (!res.Item) return json(404, { message: 'Draft not found' });
    return json(200, res.Item);
  }

  if (flowId && method === 'PUT') {
    const body = JSON.parse(event.body ?? '{}') as Partial<FlowGraph>;
    const draft: FlowGraph = {
      flowId,
      documentType: body.documentType ?? 'Order',
      nodes: body.nodes ?? [],
      edges: body.edges ?? [],
    };
    await client.send(new PutCommand({ TableName: TABLE, Item: draft }));
    return json(200, draft);
  }

  return json(400, { message: 'Unsupported route' });
};
