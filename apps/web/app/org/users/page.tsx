// apps/web/app/org/users/page.tsx
//
// Org-admin surface for role/client-access management - the other genuinely
// missing piece alongside /org/clients. Adding an existing user (one who's
// already signed in at least once, so a users row exists) is a direct role
// assignment; a brand-new external user needs a B2B guest invite first
// (invitations.ts's inviteExternalUserViaGraph, still stubbed pending the
// User.Invite.All admin consent - this page surfaces that honestly rather
// than pretending it works).


// Forces this page to render fresh on every request, at runtime, never as a build-time
// static file - without this, Next.js pre-renders it once at BUILD time (when no SSR
// compute role exists yet), bakes in whatever the DB call returned THEN, and serves
// that frozen result forever afterward regardless of runtime fixes.
export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getAuthorizationContext } from '@workspace/auth/server';
import {
  createDb,
  dbConfigFromEnv,
  addUserToOrganization,
  grantClientAccess,
  revokeClientAccess,
  users,
  userOrganizationRoles,
  userClientAccess,
  clients,
} from '@workspace/db';
import { isDevBypassActive, warnBypass } from '@workspace/auth/devBypass';

export default async function OrgUsersPage() {
  const authz = await getAuthorizationContext();
  if (!authz) redirect('/auth/signin');

  const adminOrg = authz.organizations.find((o) => o.role === 'admin');
  if (!authz.isPlatformAdmin && !adminOrg) redirect('/');

  if (isDevBypassActive()) {
    warnBypass('app/org/users/page.tsx');
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-4 text-lg font-medium">Users</h1>
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">
          DEV_BYPASS_AUTH is on - this page needs the real Aurora database, which bypass mode
          deliberately doesn't fake.
        </div>
      </div>
    );
  }

  if (!adminOrg) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="mb-1 text-lg font-medium">Users</h1>
        <p className="text-sm text-gray-500">You don't administer a specific organization.</p>
      </div>
    );
  }

  const db = createDb(dbConfigFromEnv());
  const orgId = adminOrg.organizationId;

  const members = await db
    .select({ userId: users.id, email: users.email, role: userOrganizationRoles.role })
    .from(userOrganizationRoles)
    .innerJoin(users, eq(users.id, userOrganizationRoles.userId))
    .where(eq(userOrganizationRoles.organizationId, orgId));

  const orgClients = await db.select().from(clients).where(eq(clients.organizationId, orgId));

  const accessRows = await db
    .select({ userId: userClientAccess.userId, clientId: userClientAccess.clientId })
    .from(userClientAccess)
    .innerJoin(clients, eq(clients.id, userClientAccess.clientId))
    .where(eq(clients.organizationId, orgId));
  const accessByUser = new Map<string, Set<string>>();
  for (const row of accessRows) {
    if (!accessByUser.has(row.userId)) accessByUser.set(row.userId, new Set());
    accessByUser.get(row.userId)!.add(row.clientId);
  }

  async function handleAddMember(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    const role = formData.get('role') === 'admin' ? 'admin' : 'member';
    if (!email) return;
    const db = createDb(dbConfigFromEnv());
    const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!existing) {
      throw new Error(
        `No user found for ${email} - they need to sign in once first (internal staff), or B2B guest ` +
          `invites need to be wired up (invitations.ts is currently a stub, pending Graph API consent).`,
      );
    }
    await addUserToOrganization(db, existing.id, orgId, role);
  }

  async function handleToggleAccess(formData: FormData) {
    'use server';
    const userId = String(formData.get('userId'));
    const clientId = String(formData.get('clientId'));
    const currentlyGranted = formData.get('currentlyGranted') === 'true';
    const db = createDb(dbConfigFromEnv());
    if (currentlyGranted) {
      await revokeClientAccess(db, userId, clientId);
    } else {
      await grantClientAccess(db, userId, clientId);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-1 text-lg font-medium">Users</h1>
      <p className="mb-6 text-sm text-gray-500">{adminOrg.organizationName}</p>

      <form action={handleAddMember} className="mb-6 flex gap-2 rounded-lg border border-gray-200 bg-white p-4">
        <input
          name="email"
          type="email"
          placeholder="Existing user's email"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <select name="role" className="rounded border border-gray-300 px-2 py-1.5 text-sm">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit" className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white">
          Add
        </button>
      </form>

      <div className="space-y-3">
        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No members yet.
          </div>
        ) : (
          members.map((member) => (
            <div key={member.userId} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{member.email}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    member.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {member.role}
                </span>
              </div>

              {member.role === 'member' && orgClients.length > 0 && (
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Client access</p>
                  <div className="flex flex-wrap gap-2">
                    {orgClients.map((client) => {
                      const granted = accessByUser.get(member.userId)?.has(client.id) ?? false;
                      return (
                        <form key={client.id} action={handleToggleAccess}>
                          <input type="hidden" name="userId" value={member.userId} />
                          <input type="hidden" name="clientId" value={client.id} />
                          <input type="hidden" name="currentlyGranted" value={String(granted)} />
                          <button
                            type="submit"
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              granted ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                          >
                            {client.name} {granted ? '✓' : '+'}
                          </button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
