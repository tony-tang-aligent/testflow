// infra/api/handlers/testExecution.ts
//
// Route: POST /tenants/{tenantId}/flows/{flowId}/test
//
// Starts a real Step Functions execution against the flow's current SAVED
// config - not whatever's unsaved on the canvas. The frontend's "Test now"
// button saves first, then calls this, so what gets tested always matches
// what's actually persisted (see canvas/page.tsx#handleTestNow).
//
// The state machine is STANDARD type (async) - StartExecution returns
// immediately with just the executionId; the frontend polls the executions
// endpoint until the aggregate Lambda has written a result.

import { randomUUID } from 'crypto';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { resolveAuthContext } from '../lib/authContext';
import { withErrorHandling } from '../lib/withErrorHandling';

const sfnClient = new SFNClient({});
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN ?? '';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = withErrorHandling(async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const authCtx = await resolveAuthContext(event);
  const { tenantId } = authCtx;
  const flowId = event.pathParameters?.flowId;
  if (!flowId) return json(400, { message: 'Missing flowId in path' });

  const body = JSON.parse(event.body ?? '{}') as { payload?: Record<string, unknown>; orderId?: string };
  if (!body.payload) return json(400, { message: 'Missing payload in request body' });

  const executionId = randomUUID();
  const orderId = body.orderId || (body.payload.orderId as string | undefined) || `test-${Date.now()}`;

  await sfnClient.send(
    new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: executionId,
      input: JSON.stringify({ tenantId, flowId, executionId, orderId, payload: body.payload }),
    }),
  );

  return json(202, { executionId, orderId });
});
