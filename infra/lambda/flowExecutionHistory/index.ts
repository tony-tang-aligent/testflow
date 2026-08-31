// infra/lambda/flowExecutionHistory/index.ts
//
// GET /document-types/{documentType}/executions            - list (DynamoDB summary, cheap)
// GET /document-types/{documentType}/executions/{executionId} - detail (lazy S3 fetch)
//
// documentType is required on BOTH routes, not just list - avoids needing a
// second GSI keyed purely on executionId, since the frontend always already
// knows which document type it's looking at when it opens one.

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const SUMMARY_TABLE = process.env.EXECUTION_SUMMARY_TABLE_NAME!;
const DETAIL_BUCKET = process.env.EXECUTION_DETAIL_BUCKET_NAME!;

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

async function streamToString(stream: unknown): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const documentType = event.pathParameters?.documentType;
  const executionId = event.pathParameters?.executionId;
  if (!documentType) return json(400, { message: 'documentType required' });

  if (executionId) {
    const summary = await ddb.send(
      new QueryCommand({
        TableName: SUMMARY_TABLE,
        KeyConditionExpression: 'documentType = :dt',
        FilterExpression: 'executionId = :eid',
        ExpressionAttributeValues: { ':dt': documentType, ':eid': executionId },
      }),
    );
    const row = summary.Items?.[0];
    if (!row) return json(404, { message: 'Execution not found.' });

    const obj = await s3.send(new GetObjectCommand({ Bucket: DETAIL_BUCKET, Key: row.s3Key }));
    const detail = JSON.parse(await streamToString(obj.Body));
    return json(200, { ...row, detail });
  }

  const limit = Number(event.queryStringParameters?.limit ?? 50);
  const flowId = event.queryStringParameters?.flowId;
  // Querying the flowId-index directly, not documentType + a
  // FilterExpression - the previous approach could under-return results,
  // since DynamoDB applies Limit BEFORE filtering, not after. If a
  // different flow (same document type) had been tested more recently,
  // this flow's own older executions could get scanned past entirely. This
  // index makes Limit apply to exactly the rows that matter.
  const result = flowId
    ? await ddb.send(
        new QueryCommand({
          TableName: SUMMARY_TABLE,
          IndexName: 'flowId-index',
          KeyConditionExpression: 'flowId = :fid',
          ExpressionAttributeValues: { ':fid': flowId },
          ScanIndexForward: false,
          Limit: limit,
        }),
      )
    : await ddb.send(
        new QueryCommand({
          TableName: SUMMARY_TABLE,
          KeyConditionExpression: 'documentType = :dt',
          ExpressionAttributeValues: { ':dt': documentType },
          ScanIndexForward: false, // most recent evaluatedAt first
          Limit: limit,
        }),
      );
  return json(200, result.Items ?? []);
};
