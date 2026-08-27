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
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';

export default async function OrgUsersPage() {
  const authz = await getAuthorizationContext();
  if (!authz) redirect('/auth/signin');

  const adminOrg = authz.organizations.find((o) => o.role === 'admin');
  if (!authz.isPlatformAdmin && !adminOrg) redirect('/');

  if (isDevBypassActive()) {
    warnBypass('app/org/users/page.tsx');
    return (
      <div className="mx-auto max-w-2xl p-layout-margin">
        <h1 className="mb-4 font-display-lg text-display-lg text-on-surface">Users</h1>
        <div className="rounded-lg border border-dashed border-tertiary/40 bg-tertiary-container/10 p-6 font-body-sm text-body-sm text-tertiary">
          DEV_BYPASS_AUTH is on - this page needs the real Aurora database, which bypass mode
          deliberately doesn't fake.
        </div>
      </div>
    );
  }

  if (!adminOrg) {
    return (
      <div className="mx-auto max-w-2xl p-layout-margin">
        <h1 className="mb-1 font-display-lg text-display-lg text-on-surface">Users</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">You don't administer a specific organization.</p>
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
    <div className="mx-auto max-w-3xl space-y-xl p-layout-margin">
      <div>
        <h1 className="font-display-lg text-display-lg text-on-surface">Users</h1>
        <p className="mt-xs font-body-sm text-body-sm text-on-surface-variant">{adminOrg.organizationName}</p>
      </div>

      <div className="rounded-lg border border-outline-variant bg-surface-container p-lg">
        <form action={handleAddMember} className="flex gap-2">
          <Input name="email" type="email" placeholder="Existing user's email" className="flex-1" />
          <select name="role" className="rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit">Add</Button>
        </form>
      </div>

      <div className="space-y-sm">
        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-outline-variant p-12 text-center">
            <p className="font-body-sm text-body-sm text-on-surface-variant">No members yet.</p>
          </div>
        ) : (
          members.map((member) => (
            <div key={member.userId} className="rounded-lg border border-outline-variant bg-surface-container p-lg">
              <div className="flex items-center justify-between">
                <span className="font-medium text-on-surface">{member.email}</span>
                <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>{member.role}</Badge>
              </div>

              {member.role === 'member' && orgClients.length > 0 && (
                <div className="mt-3 border-t border-outline-variant pt-3">
                  <p className="mb-2 font-label-caps text-label-caps uppercase tracking-wide text-on-surface-variant">
                    Client access
                  </p>
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
                            className={`rounded-full px-2.5 py-1 font-body-sm text-body-sm font-medium ${
                              granted
                                ? 'border border-secondary/30 bg-secondary-container/20 text-secondary'
                                : 'border border-outline-variant bg-surface-variant text-on-surface-variant hover:bg-surface-container-highest'
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
