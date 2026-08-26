// infra/api/lib/withErrorHandling.ts
//
// Every handler was throwing unhandled exceptions straight through to API
// Gateway, which replaces them with a generic {"message":"Internal Server
// Error"} - impossible to debug from the browser. This wrapper catches
// anything a handler throws and returns the real error message and name
// instead, so the actual cause (bad table name, permission error, whatever)
// shows up directly in the network tab instead of requiring a CloudWatch trip.
//
// TODO(auth): once this API is no longer wide open, stop returning raw error
// messages/stacks to the client - that's an information-disclosure risk against
// a real attacker. Fine for now since nothing here is authenticated yet anyway.

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

type Handler = (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>;

export function withErrorHandling(handler: Handler): Handler {
  return async (event) => {
    try {
      return await handler(event);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Unhandled error in handler:', error);
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: error.message ?? 'Unknown error',
          name: error.name,
          // TODO: remove stack from the response once auth is in place.
          stack: error.stack,
        }),
      };
    }
  };
}
