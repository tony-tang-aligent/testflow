// infra/lambda/awaitCorrection/index.ts
//
// Runs when Aggregate found a blocking violation. This Lambda does NOT resume
// the execution itself - it just records that this execution is now waiting,
// alongside the token that whoever calls the /correct API route will need to
// resume it (see api/handlers/correction.ts). The state machine genuinely
// pauses here (Step Functions' waitForTaskToken pattern) until that happens -
// no polling, no cost while idle, no arbitrary timeout forcing a decision.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getExecutionDetail, putExecutionDetail } from '../shared/s3';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SUMMARY_TABLE = process.env.SUMMARY_TABLE_NAME ?? 'ValidationExecutionSummary';

export interface AwaitCorrectionInput {
  tenantId: string;
  flowId: string;
  executionId: string;
  token: string; // injected via $$.Task.Token - see CDK stack's TaskInput
}

export const handler = async (input: AwaitCorrectionInput): Promise<void> => {
  if (!input.token) {
    // Fail loudly and clearly here rather than let DynamoDB reject the update
    // with an opaque "expression attribute value not defined" error - this is
    // exactly the failure mode a malformed CDK payload mapping produces.
    throw new Error('awaitCorrection received no task token - check the CDK stack\'s AwaitCorrection payload.');
  }

  await client.send(
    new UpdateCommand({
      TableName: SUMMARY_TABLE,
      Key: { tenantId: input.tenantId, executionId: input.executionId },
      UpdateExpression: 'SET #status = :status, taskToken = :token',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'needs_review', ':token': input.token },
    }),
  );

  // Keep the S3 detail's status in sync with the summary - without this, the
  // detail object still shows whatever Aggregate originally wrote (e.g.
  // 'failed'), which is what anything reading detail (like the canvas's
  // "Test now" polling) would see instead of 'needs_review', even though the
  // execution really is paused waiting for a human.
  const detail = await getExecutionDetail(input.tenantId, input.flowId, input.executionId);
  if (detail) {
    await putExecutionDetail({ ...detail, status: 'needs_review' });
  }

  // Deliberately does not call SendTaskSuccess/SendTaskFailure - that only
  // happens from the /correct API route, whenever a human actually acts.
};
