// infra/api/handlers/correction.ts
//
// Route: POST /tenants/{tenantId}/flows/{flowId}/executions/{executionId}/correct
//
// The only place a human's correction actually resumes a paused execution.
// Looks up the task token AwaitCorrection stored, calls SendTaskSuccess with
// the correction, and clears the token immediately afterward so a second
// submission against the same (now-consumed) token fails clearly rather than
// silently double-processing.

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { resolveAuthContext } from '../lib/authContext';
import { withErrorHandling } from '../lib/withErrorHandling';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfnClient = new SFNClient({});
const SUMMARY_TABLE = process.env.SUMMARY_TABLE_NAME ?? 'ValidationExecutionSummary';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = withErrorHandling(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  // TODO(auth): only an authorized reviewer should be able to submit a
  // correction - currently anyone who can reach this API can resume any
  // paused execution for the (single, placeholder) tenant.
  const authCtx = await resolveAuthContext(event);
  const { tenantId } = authCtx;
  const executionId = event.pathParameters?.executionId;
  if (!executionId) return json(400, { message: 'Missing executionId in path' });

  const body = JSON.parse(event.body ?? '{}') as {
    correctedPayload?: Record<string, unknown>;
    dismissedWarnings?: Array<{ ruleId: string; itemId?: string }>;
  };

  const existing = await ddb.send(new GetCommand({ TableName: SUMMARY_TABLE, Key: { tenantId, executionId } }));
  const taskToken = existing.Item?.taskToken as string | undefined;

  if (!existing.Item || existing.Item.status !== 'needs_review' || !taskToken) {
    return json(409, { message: 'This execution is not currently waiting for a correction.' });
  }

  await sfnClient.send(
    new SendTaskSuccessCommand({
      taskToken,
      output: JSON.stringify({
        correctedPayload: body.correctedPayload,
        dismissedWarnings: body.dismissedWarnings,
      }),
    }),
  );

  // Clear the token immediately - it's single-use on Step Functions' side
  // anyway, but this makes a stale/duplicate submission fail fast and clearly
  // (see the check above) instead of erroring deep inside the SFN SDK call.
  await ddb.send(
    new UpdateCommand({
      TableName: SUMMARY_TABLE,
      Key: { tenantId, executionId },
      UpdateExpression: 'REMOVE taskToken',
    }),
  );

  return json(202, { message: 'Correction submitted - re-validating.' });
});
