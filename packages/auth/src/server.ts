// packages/auth/src/server.ts
import NextAuth from 'next-auth';
import { authConfig } from './config';
import { createDb, dbConfigFromEnv, resolveAuthorizationContext, findOrCreateUser } from '@workspace/db';
import type { AuthorizationContext } from '@workspace/db';
import { isDevBypassActive, warnBypass, DEV_BYPASS_USER_ID } from './devBypass';

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

/**
 * The actual authorization resolution point for every server-side request in
 * apps/web. Ensures a users row exists (first sign-in creates it), then
 * resolves org membership/role fresh from Postgres - never cached in the JWT,
 * so a role change takes effect on the very next request, not next login.
 */
export async function getAuthorizationContext(): Promise<AuthorizationContext | null> {
  if (isDevBypassActive()) {
    warnBypass('getAuthorizationContext');
    return { userId: DEV_BYPASS_USER_ID, isPlatformAdmin: true, organizations: [] };
  }

  const session = await auth();
  const cognitoSub = session?.user?.cognitoSub;
  if (!cognitoSub || !session?.user?.email) return null;

  const db = createDb(dbConfigFromEnv());
  await findOrCreateUser(db, cognitoSub, session.user.email);
  return resolveAuthorizationContext(db, cognitoSub);
}

