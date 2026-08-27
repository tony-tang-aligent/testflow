// apps/web/app/org/clients/page.tsx
//
// Org-admin surface, deferred from the original identity-layer build and
// genuinely missing until now - not drift, an actual gap. Mirrors
// /admin/organizations' pattern exactly, but scoped to one org, rather than
// platform-admin's every-org view. A platform-admin can now ALSO reach this
// page for any specific org via ?orgId=... (that's what makes the org rows
// on /admin/organizations actually clickable, rather than dead <div>s).

// Forces this page to render fresh on every request, at runtime, never as a build-time
// static file - without this, Next.js pre-renders it once at BUILD time (when no SSR
// compute role exists yet), bakes in whatever the DB call returned THEN, and serves
// that frozen result forever afterward regardless of runtime fixes.
export const dynamic = 'force-dynamic';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getAuthorizationContext } from '@workspace/auth/server';
import { createDb, dbConfigFromEnv, createClient, clients, organizations } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { isDevBypassActive, warnBypass } from '@workspace/auth/devBypass';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

export default async function OrgClientsPage({
  searchParams,
}: {
  searchParams?: { orgId?: string };
}) {
  const authz = await getAuthorizationContext();
  if (!authz) redirect('/auth/signin');

  const ownAdminOrg = authz.organizations.find((o) => o.role === 'admin');
  if (!authz.isPlatformAdmin && !ownAdminOrg) redirect('/');

  if (isDevBypassActive()) {
    warnBypass('app/org/clients/page.tsx');
    return (
      <div className="mx-auto max-w-2xl p-layout-margin">
        <h1 className="mb-4 font-display-lg text-display-lg text-on-surface">Clients</h1>
        <div className="rounded-lg border border-dashed border-tertiary/40 bg-tertiary-container/10 p-6 font-body-sm text-body-sm text-tertiary">
          DEV_BYPASS_AUTH is on - this page needs the real Aurora database, which bypass mode
          deliberately doesn't fake.
        </div>
      </div>
    );
  }

  const db = createDb(dbConfigFromEnv());

  // Platform-admins can view ANY org via ?orgId=... (from clicking a row on
  // /admin/organizations); everyone else only ever sees their own admin org.
  let targetOrg: { organizationId: string; organizationName: string } | undefined = ownAdminOrg;
  if (authz.isPlatformAdmin && searchParams?.orgId) {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.id, searchParams.orgId) });
    if (org) targetOrg = { organizationId: org.id, organizationName: org.name };
  }

  if (!targetOrg) {
    return (
      <div className="mx-auto max-w-2xl p-layout-margin">
        <h1 className="mb-1 font-display-lg text-display-lg text-on-surface">Clients</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          You're a platform admin but don't administer a specific organization - see{' '}
          <Link href="/admin/organizations" className="underline">
            Admin
          </Link>{' '}
          and click an organization to view its clients instead.
        </p>
      </div>
    );
  }

  const orgClients = await db.select().from(clients).where(eq(clients.organizationId, targetOrg.organizationId));

  async function handleCreate(formData: FormData) {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    const tenantId = String(formData.get('tenantId') ?? '').trim();
    if (!name || !tenantId || !targetOrg) return;
    const db = createDb(dbConfigFromEnv());
    await createClient(db, targetOrg.organizationId, name, tenantId);
    // Same missing-revalidation bug as /admin/organizations had - without
    // this, the new client existed in the DB but never showed up until some
    // unrelated navigation happened to bust the page's cached render.
    revalidatePath('/org/clients');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-xl p-layout-margin">
      <div>
        <h1 className="font-display-lg text-display-lg text-on-surface">Clients</h1>
        <p className="mt-xs font-body-sm text-body-sm text-on-surface-variant">{targetOrg.organizationName}</p>
      </div>

      <div className="rounded-lg border border-outline-variant bg-surface-container p-lg">
        <form action={handleCreate} className="space-y-sm">
          <div className="flex gap-2">
            <Input name="name" placeholder="Client name (e.g. Modelflight)" className="flex-1" />
            <Input name="tenantId" placeholder="tenantId (must match a deployed flow-engine stack)" className="flex-1 font-code-sm text-code-sm" />
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            This only creates the metadata row - the actual flow-engine CDK stack for this tenantId still needs
            deploying separately (auto-provisioning is a deferred, not-yet-built piece).
          </p>
          <Button type="submit">Create</Button>
        </form>
      </div>

      {orgClients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant p-12 text-center">
          <p className="font-body-sm text-body-sm text-on-surface-variant">No clients yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="p-table-cell-padding font-medium">Client name</th>
                <th className="p-table-cell-padding font-medium">Tenant ID</th>
                <th className="p-table-cell-padding text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-body-base text-body-base text-on-surface">
              {orgClients.map((client) => (
                <tr key={client.id} className="group transition-colors hover:bg-surface-container-highest">
                  <td className="p-table-cell-padding font-medium">{client.name}</td>
                  <td className="p-table-cell-padding">
                    <span className="rounded border border-outline-variant bg-background px-1.5 py-0.5 font-code-sm text-code-sm text-on-surface-variant">
                      {client.tenantId}
                    </span>
                  </td>
                  <td className="p-table-cell-padding text-right">
                    <Link
                      href={`/clients/${client.tenantId}/flows`}
                      className="inline-flex items-center gap-xs font-body-sm text-body-sm text-primary opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Open <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
