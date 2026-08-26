// infra/api/lib/authContext.ts
//
// Every API handler is supposed to call resolveAuthContext(event) first, to turn
// a Cognito-authenticated request into a tenantId + permission check. None of that
// exists yet - this stub always returns a hardcoded tenant so the CRUD handlers
// below can be built/tested against real DynamoDB tables in the meantime.

import { APIGatewayProxyEventV2 } from 'aws-lambda';

export interface AuthContext {
  tenantId: string;
  userId: string;
  roles: string[];
}

// TODO(auth): extract and verify the Cognito JWT from the request (API Gateway JWT
// authorizer should do most of this before the Lambda even runs - event.requestContext.authorizer.jwt.claims).
// TODO(RDS): look up the authenticated user's company/role in RDS (user_company_roles)
// to resolve which tenantId(s) this user may act on, and what they're allowed to do
// (read-only vs rule-author vs admin). Reject with 403 if the requested tenantId in
// the path doesn't match an authorized company for this user.
export async function resolveAuthContext(event: APIGatewayProxyEventV2): Promise<AuthContext> {
  const tenantId = event.pathParameters?.tenantId ?? 'unknown-tenant';
  return {
    tenantId,
    userId: 'TODO-unresolved-user',
    roles: ['TODO-unresolved-role'],
  };
}
