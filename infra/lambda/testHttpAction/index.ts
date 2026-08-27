// infra/lambda/testHttpAction/index.ts
//
// The "Send test request" button's backend - resolves the node's config
// against the flow's sample payload using the EXACT same resolveHttpRequest
// used by the real executor, actually sends it, and returns enough to render
// a Postman-style response view (status, headers, body, timing).

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { resolveHttpRequest, HttpActionConfig } from '../flowBuilderShared/httpActionResolver';

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
    return { statusCode, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } };
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    const body = JSON.parse(event.body ?? '{}') as {
        config?: HttpActionConfig;
        samplePayload?: Record<string, unknown>;
    };
    if (!body.config?.url) return json(400, { message: 'A URL is required to test this action.' });

    const request = await resolveHttpRequest(body.config, { payload: body.samplePayload ?? {} });

    const startedAt = Date.now();
    try {
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal: AbortSignal.timeout(15000),
        });
        const timeMs = Date.now() - startedAt;
        const responseText = await response.text();
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => (responseHeaders[key] = value));

        return json(200, {
            request: { url: request.url, method: request.method, headers: request.headers, body: request.body },
            response: {
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseText,
                timeMs,
            },
        });
    } catch (err) {
        return json(200, {
            request: { url: request.url, method: request.method, headers: request.headers, body: request.body },
            error: (err as Error).message,
            timeMs: Date.now() - startedAt,
        });
    }
};