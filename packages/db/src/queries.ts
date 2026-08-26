// packages/db/src/queries.ts
//
// The functions that answer "what can this authenticated user actually do" -
// called from apps/web's server-side session resolution AND from infra's
// Lambda handlers (both trust the caller has already verified identity via
// Cognito; these functions only resolve authorization, not authentication).

import { eq, and, sql } from 'drizzle-orm';
import type { createDb } from './client';
import { users, platformAdmins, userOrganizationRoles, organizations, clients, userClientAccess } from './schema';

type Db = ReturnType<typeof createDb>;

export interface AuthorizationContext {
  userId: string;
  isPlatformAdmin: boolean;
  organizations: Array<{ organizationId: string; organizationName: string; role: 'admin' | 'member' }>;
}

/** Resolves everything needed to make an authorization decision, from a Cognito subject alone. */
export async function resolveAuthorizationContext(
    db: Db,
    cognitoSub: string,
): Promise<AuthorizationContext | null> {
  const user = await db.query.users.findFirst({ where: eq(users.cognitoSub, cognitoSub) });
  if (!user) return null;

  const [platformAdminRow, orgRows] = await Promise.all([
    db.query.platformAdmins.findFirst({ where: eq(platformAdmins.userId, user.id) }),
    db
        .select({
          organizationId: userOrganizationRoles.organizationId,
          organizationName: organizations.name,
          role: userOrganizationRoles.role,
        })
        .from(userOrganizationRoles)
        .innerJoin(organizations, eq(organizations.id, userOrganizationRoles.organizationId))
        .where(eq(userOrganizationRoles.userId, user.id)),
  ]);

  return {
    userId: user.id,
    isPlatformAdmin: !!platformAdminRow,
    organizations: orgRows,
  };
}

/** Every Client this user can access - org-admins get every Client under their
 * org (access is implicit); org-members only get Clients explicitly granted
 * via userClientAccess. This is the function that actually enforces the
 * "wall off different end-customers within the same org" requirement. */
export async function getAccessibleClients(db: Db, userId: string) {
  const adminOrgs = await db
      .select({ organizationId: userOrganizationRoles.organizationId })
      .from(userOrganizationRoles)
      .where(
          and(
              eq(userOrganizationRoles.userId, userId),
              // Explicit cast, not eq(userOrganizationRoles.role, 'admin') - the
              // RDS Data API driver (what this whole project uses, for VPC-free
              // Lambda/Next.js access to Aurora) doesn't reliably bind a plain
              // string against a real Postgres ENUM column, producing "operator
              // does not exist: org_role = text" at query time despite looking
              // completely correct in TypeScript. Casting explicitly sidesteps
              // the driver's enum-inference gap rather than depending on it.
              sql`${userOrganizationRoles.role} = 'admin'::org_role`,
          ),
      );

  const adminOrgIds = adminOrgs.map((r) => r.organizationId);

  const viaAdmin = adminOrgIds.length
      ? await db.query.clients.findMany({ where: (c, { inArray }) => inArray(c.organizationId, adminOrgIds) })
      : [];

  const viaGrant = await db
      .select({ client: clients })
      .from(userClientAccess)
      .innerJoin(clients, eq(clients.id, userClientAccess.clientId))
      .where(eq(userClientAccess.userId, userId));

  const byId = new Map(viaAdmin.map((c) => [c.id, c]));
  for (const { client } of viaGrant) byId.set(client.id, client);
  return [...byId.values()];
}

export async function canAccessClient(db: Db, userId: string, clientId: string): Promise<boolean> {
  const accessible = await getAccessibleClients(db, userId);
  return accessible.some((c) => c.id === clientId);
}