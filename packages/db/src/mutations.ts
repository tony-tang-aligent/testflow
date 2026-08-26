// packages/db/src/mutations.ts

import { eq, and } from 'drizzle-orm';
import type { createDb } from './client';
import { organizations, clients, users, userOrganizationRoles, userClientAccess, platformAdmins } from './schema';

type Db = ReturnType<typeof createDb>;

export async function createOrganization(db: Db, name: string) {
  const [org] = await db.insert(organizations).values({ name }).returning();
  return org;
}

/** Creates the Client's metadata row only - does NOT provision the actual
 * flow-engine CDK stack for this tenantId. That's a deliberate, currently
 * manual step (see the scoping conversation on deferred auto-provisioning). */
export async function createClient(db: Db, organizationId: string, name: string, tenantId: string) {
  const [client] = await db.insert(clients).values({ organizationId, name, tenantId }).returning();
  return client;
}

/** Finds or creates our own user record for a given Cognito subject - called
 * on first sign-in, since Azure AD/Cognito is the identity source of truth
 * and this table only exists to attach authorization data to that identity. */
export async function findOrCreateUser(db: Db, cognitoSub: string, email: string) {
  const existing = await db.query.users.findFirst({ where: eq(users.cognitoSub, cognitoSub) });
  if (existing) return existing;
  const [user] = await db.insert(users).values({ cognitoSub, email }).returning();
  return user;
}

export async function addUserToOrganization(
  db: Db,
  userId: string,
  organizationId: string,
  role: 'admin' | 'member',
) {
  await db
    .insert(userOrganizationRoles)
    .values({ userId, organizationId, role })
    .onConflictDoUpdate({
      target: [userOrganizationRoles.userId, userOrganizationRoles.organizationId],
      set: { role },
    });
}

/** Only meaningful for 'member' role users - an org-admin's access is implicit
 * (every Client under their org), so granting them a row here is a harmless
 * no-op rather than something that needs guarding against. */
export async function grantClientAccess(db: Db, userId: string, clientId: string) {
  await db.insert(userClientAccess).values({ userId, clientId }).onConflictDoNothing();
}

export async function revokeClientAccess(db: Db, userId: string, clientId: string) {
  await db
    .delete(userClientAccess)
    .where(and(eq(userClientAccess.userId, userId), eq(userClientAccess.clientId, clientId)));
}

export async function grantPlatformAdmin(db: Db, userId: string) {
  await db.insert(platformAdmins).values({ userId }).onConflictDoNothing();
}
