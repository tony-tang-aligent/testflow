// infra/lambda/testPublishedFlow/index.ts
//
// The manual-trigger gap flagged after the whole publish/compile pipeline was
// built - Publish gets a flow live, but there was never a way to actually RUN
// it against a payload afterward. Uses Step Functions' own StartExecution/
// DescribeExecution directly - no new DynamoDB table needed, unlike the
// original validator's ExecutionSummary approach, since a state machine
// already tracks its own execution history and status natively.

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SFNClient, StartExecutionCommand, DescribeExecutionCommand } from '@aws-sdk/client-sfn';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfnClient = new SFNClient({});
const FLOW_TABLE = process.env.PUBLISHED_FLOW_TABLE_NAME ?? 'DocumentTypePublishedFlow';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

interface CheckResult {
  passed: boolean;
  violation?: { fieldPath?: string; rule?: string; expected?: unknown; actual?: unknown };
}

/** Real verdict, not the execution's own SUCCEEDED/FAILED status. Checks
 * three places, in order of how directly they answer the question:
 *   1. errorAggregator's own output, if it ran (the most complete answer -
 *      it already merged top-level + per-item violations, see compiler.ts)
 *   2. Raw top-level checkResults, if errorAggregator never ran (the
 *      all-checks-passed path skips it entirely, per the compiled Choice)
 *   3. undefined if neither exists - not every flow necessarily has checks
 *      wired to produce either shape, and guessing "passed" in that case
 *      would be worse than admitting we don't know. */
function deriveValidationStatus(output: unknown): 'passed' | 'failed' | undefined {
  if (!output || typeof output !== 'object') return undefined;
  const o = output as {
    aggregatedResult?: { status?: string };
    checkResults?: Record<string, CheckResult>;
  };

  if (o.aggregatedResult?.status) {
    return o.aggregatedResult.status === 'failed' ? 'failed' : 'passed';
  }
  if (o.checkResults) {
    const anyFailed = Object.values(o.checkResults).some((r) => r.passed === false);
    return anyFailed ? 'failed' : 'passed';
  }
  return undefined;
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const method = event.requestContext.http.method;

  if (method === 'POST') {
    const body = JSON.parse(event.body ?? '{}') as { documentType?: string; payload?: unknown };
    if (!body.documentType) return json(400, { message: 'documentType required' });

    const published = await ddb.send(
      new GetCommand({ TableName: FLOW_TABLE, Key: { documentType: body.documentType } }),
    );
    if (!published.Item?.stateMachineArn) {
      return json(404, { message: `No published flow for document type "${body.documentType}" yet - publish it first.` });
    }

    const result = await sfnClient.send(
      new StartExecutionCommand({
        stateMachineArn: published.Item.stateMachineArn,
        // documentType included now, not just payload - errorAggregator
        // needs it to know which document type's history table row to
        // write (see flowExecutor's errorAggregator case).
        input: JSON.stringify({ documentType: body.documentType, payload: body.payload ?? {} }),
      }),
    );
    return json(200, { executionArn: result.executionArn });
  }

  if (method === 'GET') {
    const executionArn = event.queryStringParameters?.executionArn;
    if (!executionArn) return json(400, { message: 'executionArn query param required' });

    const result = await sfnClient.send(new DescribeExecutionCommand({ executionArn }));
    const output = result.output ? JSON.parse(result.output) : undefined;

    return json(200, {
      status: result.status,
      output,
      // A real, distinct verdict - "SUCCEEDED" only ever means the state
      // machine ran without an unhandled error. It says NOTHING about
      // whether the document actually passed validation - a check that
      // correctly finds a violation and routes to errorAggregator still
      // completes as a perfectly normal, error-free SUCCEEDED execution.
      // checkResults is populated by every top-level check regardless of
      // which branch it took afterward (the Task sets it before the Choice
      // state ever reads it), so this is reliable on both the pass and fail
      // paths, not just when errorAggregator happened to run.
      validationStatus: deriveValidationStatus(output),
      error: result.error,
      cause: result.cause,
    });
  }

  return json(400, { message: 'Unsupported method' });
};
