// infra/api/handlers/publishedFlow.ts
//
// Small, dedicated lookup - the dashboard needs to know which draft (if any)
// matches what's actually LIVE for a document type, not just list drafts with
// no indication of which one is real. Reads the same DocumentTypePublishedFlow
// row publishFlow.ts writes; no new table needed.

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const FLOW_TABLE = process.env.PUBLISHED_FLOW_TABLE_NAME ?? 'DocumentTypePublishedFlow';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
    return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const documentType = event.pathParameters?.documentType;
    if (!documentType) return json(400, { message: 'documentType required' });

    const result = await ddb.send(new GetCommand({ TableName: FLOW_TABLE, Key: { documentType } }));
    if (!result.Item) return json(200, { published: null });

    return json(200, {
        published: { flowId: result.Item.flowId, publishedAt: result.Item.publishedAt },
    });
};