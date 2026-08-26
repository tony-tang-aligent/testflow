// infra/api/handlers/internalAuthorizer.ts
//
// Enforces "Option 2" from the auth scoping conversation: the browser never
// talks to this API directly - only apps/web's own Next.js server does,
// after it has already resolved the request's real authorization (which
// Client, what role) against packages/db. This authorizer only answers "is
// this Next.js, or is this literally anyone else" - it has no concept of
// which end-user is behind the request, by design.
//
// TODO: upgrade to native IAM SigV4 auth once verified against the exact
// aws-cdk-lib version in use - functionally stronger (no shared secret to
// leak/rotate), deliberately not implemented now since I couldn't verify the
// current CDK construct API with full confidence and didn't want to ship
// unverified code for something security-sensitive.

import { APIGatewayRequestSimpleAuthorizerHandler } from 'aws-lambda';
import { getSecretValue } from '../../lambda/shared/secrets';

const SHARED_SECRET_NAME = 'order-validator/internal-api-key';

export const handler: APIGatewayRequestSimpleAuthorizerHandler = async (event) => {
  const provided = event.headers?.['x-internal-api-key'];
  if (!provided) return { isAuthorized: false };

  const expected = await getSecretValue(SHARED_SECRET_NAME);
  return { isAuthorized: provided === expected };
};
