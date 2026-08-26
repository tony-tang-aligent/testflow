// infra/api/handlers/executions.ts
//
// Routes:
//   GET /tenants/{tenantId}/flows/{flowId}/executions?status=failed  -> DynamoDB summary query (fast list)
//   GET /tenants/{tenantId}/flows/{flowId}/executions/{executionId}  -> S3 detail fetch (lazy, on click)

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { resolveAuthContext } from '../lib/authContext';
import { withErrorHandling } from '../lib/withErrorHandling';
import { getExecutionDetail } from '../../lambda/shared/s3';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SUMMARY_TABLE = process.env.SUMMARY_TABLE_NAME ?? 'ValidationExecutionSummary';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = withErrorHandling(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const authCtx = await resolveAuthContext(event);
  const { tenantId } = authCtx;
  const flowId = event.pathParameters?.flowId;
  const executionId = event.pathParameters?.executionId;

  if (!flowId) return json(400, { message: 'Missing flowId in path' });

  if (!executionId) {
    // List view - DynamoDB summary only, no S3 reads. Optional status filter.
    // TODO: filtered client-side by flowId for now (summary table isn't GSI'd by
    // flow yet) - fine while execution volume per tenant stays small; add a
    // byFlow GSI here too if that stops being true (mirrors RuleStore's GSI).
    const status = event.queryStringParameters?.status;
    const res = await client.send(
      new QueryCommand({
        TableName: SUMMARY_TABLE,
        KeyConditionExpression: 'tenantId = :t',
        ExpressionAttributeValues: { ':t': tenantId },
        ScanIndexForward: false, // most recent first (executionId is time-ordered, e.g. ULID)
      }),
    );
    let items = (res.Items ?? []).filter((i) => i.flowId === flowId);
    if (status) items = items.filter((i) => i.status === status);
    return json(200, items);
  }

  // Detail view - only fetched when a user opens a specific execution.
  const detail = await getExecutionDetail(tenantId, flowId, executionId);
  if (!detail) return json(404, { message: 'Execution detail not found' });
  return json(200, detail);
});
