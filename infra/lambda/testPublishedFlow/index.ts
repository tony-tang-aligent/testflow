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
                input: JSON.stringify({ payload: body.payload ?? {} }),
            }),
        );
        return json(200, { executionArn: result.executionArn });
    }

    if (method === 'GET') {
        const executionArn = event.queryStringParameters?.executionArn;
        if (!executionArn) return json(400, { message: 'executionArn query param required' });

        const result = await sfnClient.send(new DescribeExecutionCommand({ executionArn }));
        return json(200, {
            status: result.status,
            output: result.output ? JSON.parse(result.output) : undefined,
            error: result.error,
            cause: result.cause,
        });
    }

    return json(400, { message: 'Unsupported method' });
};