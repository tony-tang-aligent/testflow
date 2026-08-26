// infra/api/handlers/rules.ts
//
// CRUD over RuleStore, scoped to one flow. Routes (API Gateway HTTP API):
//   GET    /tenants/{tenantId}/flows/{flowId}/rules
//   GET    /tenants/{tenantId}/flows/{flowId}/rules/{ruleId}
//   PUT    /tenants/{tenantId}/flows/{flowId}/rules/{ruleId}
//   DELETE /tenants/{tenantId}/flows/{flowId}/rules/{ruleId}   (soft delete: active=false)

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { resolveAuthContext } from '../lib/authContext';
import { withErrorHandling } from '../lib/withErrorHandling';
import { Rule } from '../../lambda/shared/types';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const RULE_TABLE = process.env.RULE_TABLE_NAME ?? 'RuleStore';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = withErrorHandling(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  // TODO(auth): reject unauthenticated / unauthorized requests here based on
  // authCtx.roles before touching DynamoDB (e.g. only 'rule-author'/'admin' may PUT/DELETE).
  const authCtx = await resolveAuthContext(event);
  const { tenantId } = authCtx;
  const flowId = event.pathParameters?.flowId;
  const ruleId = event.pathParameters?.ruleId;
  const method = event.requestContext.http.method;

  if (!flowId) return json(400, { message: 'Missing flowId in path' });

  if (method === 'GET' && !ruleId) {
    // Flow-scoped list, via the byFlow GSI - not every rule in the tenant.
    const res = await client.send(
      new QueryCommand({
        TableName: RULE_TABLE,
        IndexName: 'byFlow',
        KeyConditionExpression: 'tenantId = :t AND flowId = :f',
        ExpressionAttributeValues: { ':t': tenantId, ':f': flowId },
      }),
    );
    return json(200, res.Items ?? []);
  }

  if (method === 'GET' && ruleId) {
    const res = await client.send(new GetCommand({ TableName: RULE_TABLE, Key: { tenantId, ruleId } }));
    if (!res.Item || (res.Item as Rule).flowId !== flowId) return json(404, { message: 'Rule not found' });
    return json(200, res.Item);
  }

  if (method === 'PUT' && ruleId) {
    const body = JSON.parse(event.body ?? '{}') as Partial<Rule>;
    // Version bump: read-modify-write. Fine at this scale; add optimistic locking
    // (ConditionExpression on version) if concurrent edits become a real concern.
    const existing = await client.send(
      new GetCommand({ TableName: RULE_TABLE, Key: { tenantId, ruleId } }),
    );
    const nextVersion = ((existing.Item as Rule | undefined)?.version ?? 0) + 1;

    const rule: Rule = {
      ...(existing.Item as Rule | undefined),
      ...body,
      tenantId,
      flowId,
      ruleId,
      version: nextVersion,
      active: body.active ?? true,
    } as Rule;

    await client.send(new PutCommand({ TableName: RULE_TABLE, Item: rule }));
    return json(200, rule);
  }

  if (method === 'DELETE' && ruleId) {
    await client.send(
      new UpdateCommand({
        TableName: RULE_TABLE,
        Key: { tenantId, ruleId },
        UpdateExpression: 'SET active = :f',
        ExpressionAttributeValues: { ':f': false },
      }),
    );
    return json(204, null);
  }

  return json(400, { message: 'Unsupported route' });
});
