// infra/api/handlers/flows.ts
//
// Routes:
//   GET    /tenants/{tenantId}/flows            -> list all flows for a tenant
//   POST   /tenants/{tenantId}/flows            -> create a new flow (blank, name only)
//   GET    /tenants/{tenantId}/flows/{flowId}   -> get one flow
//   PUT    /tenants/{tenantId}/flows/{flowId}   -> update a flow
//   DELETE /tenants/{tenantId}/flows/{flowId}   -> delete a flow + its rules
//
// Deleting a flow never touches the state machine - there's exactly one static
// state machine per client stack, shared across every flow for that tenant.
// Deleting a flow is purely a DynamoDB operation (FlowDefinition item + its
// rules); the state machine keeps running for every other flow untouched.

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { resolveAuthContext } from '../lib/authContext';
import { withErrorHandling } from '../lib/withErrorHandling';
import { FlowDefinition, Rule } from '../../lambda/shared/types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const FLOW_TABLE = process.env.FLOW_TABLE_NAME ?? 'FlowDefinition';
const RULE_TABLE = process.env.RULE_TABLE_NAME ?? 'RuleStore';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = withErrorHandling(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  // TODO(auth): only 'admin' role should be able to PUT/DELETE a flow definition -
  // a bad scope/rule-id list here can break every future execution for the tenant,
  // and deletion is obviously irreversible.
  const authCtx = await resolveAuthContext(event);
  const { tenantId } = authCtx;
  const flowId = event.pathParameters?.flowId;
  const method = event.requestContext.http.method;

  // ---------- Collection routes: /tenants/{tenantId}/flows ----------

  if (!flowId && method === 'GET') {
    const res = await client.send(
      new QueryCommand({
        TableName: FLOW_TABLE,
        KeyConditionExpression: 'tenantId = :t',
        ExpressionAttributeValues: { ':t': tenantId },
      }),
    );
    return json(200, res.Items ?? []);
  }

  if (!flowId && method === 'POST') {
    const body = JSON.parse(event.body ?? '{}') as { name?: string };
    const newFlow: FlowDefinition = {
      tenantId,
      flowId: randomUUID(),
      name: body.name?.trim() || 'Untitled flow',
      version: 1,
      adapterId: 'mock',
      scopes: [],
      executionMode: 'collectAll',
    };
    await client.send(new PutCommand({ TableName: FLOW_TABLE, Item: newFlow }));
    return json(201, newFlow);
  }

  // ---------- Item routes: /tenants/{tenantId}/flows/{flowId} ----------

  if (flowId && method === 'GET') {
    const res = await client.send(new GetCommand({ TableName: FLOW_TABLE, Key: { tenantId, flowId } }));
    if (!res.Item) return json(404, { message: 'Flow not found' });
    return json(200, res.Item);
  }

  if (flowId && method === 'PUT') {
    const body = JSON.parse(event.body ?? '{}') as Partial<FlowDefinition>;
    const existing = await client.send(new GetCommand({ TableName: FLOW_TABLE, Key: { tenantId, flowId } }));
    const existingItem = existing.Item as FlowDefinition | undefined;
    const nextVersion = (existingItem?.version ?? 0) + 1;

    const flowDefinition: FlowDefinition = {
      ...existingItem,
      ...body,
      tenantId,
      flowId,
      version: nextVersion,
      // Defensive default - a partial save (e.g. the "edit sample payload" panel,
      // which only sends { samplePayload }) should never be able to strip this
      // field even if the existing item was somehow missing it.
      adapterId: body.adapterId ?? existingItem?.adapterId ?? 'mock',
    } as FlowDefinition;

    await client.send(new PutCommand({ TableName: FLOW_TABLE, Item: flowDefinition }));
    return json(200, flowDefinition);
  }

  if (flowId && method === 'DELETE') {
    // Cascade: a rule left pointing at a deleted flow would be orphaned and
    // silently never run - same reasoning as the canvas's "delete group"
    // cascade. Execution history (ValidationExecutionSummary + S3 detail) is
    // deliberately left alone - that's audit trail, not live config, and
    // deleting a flow shouldn't erase the record that it once ran.
    const rulesRes = await client.send(
      new QueryCommand({
        TableName: RULE_TABLE,
        IndexName: 'byFlow',
        KeyConditionExpression: 'tenantId = :t AND flowId = :f',
        ExpressionAttributeValues: { ':t': tenantId, ':f': flowId },
      }),
    );
    const rules = (rulesRes.Items as Rule[]) ?? [];
    await Promise.all(
      rules.map((rule) =>
        client.send(new DeleteCommand({ TableName: RULE_TABLE, Key: { tenantId, ruleId: rule.ruleId } })),
      ),
    );

    await client.send(new DeleteCommand({ TableName: FLOW_TABLE, Key: { tenantId, flowId } }));
    return json(204, null);
  }

  return json(400, { message: 'Unsupported route' });
});
