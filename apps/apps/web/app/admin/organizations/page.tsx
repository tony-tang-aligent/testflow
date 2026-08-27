// apps/web/app/admin/organizations/page.tsx
//
// Platform-admin only. Note this talks to packages/db DIRECTLY, not through
// the flow-engine HttpApi at all - Organizations/Clients/Users are control-
// plane data (Postgres), a completely separate concern from the flow engine's
// own DynamoDB data. No new infra Lambda needed for this page.


// Forces this page to render fresh on every request, at runtime, never as a build-time
// static file - without this, Next.js pre-renders it once at BUILD time (when no SSR
// compute role exists yet), bakes in whatever the DB call returned THEN, and serves
// that frozen result forever afterward regardless of runtime fixes.
export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import Link from 'next/link';
import { getAuthorizationContext } from '@workspace/auth/server';
import { createDb, dbConfigFromEnv, createOrganization, organizations } from '@workspace/db';
import { isDevBypassActive, warnBypass } from '@workspace/auth/devBypass';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

export default async function OrganizationsPage() {
  const authz = await getAuthorizationContext();
  if (!authz) redirect('/auth/signin');
  if (!authz.isPlatformAdmin) redirect('/');

  // This page is inherently "create real rows in Postgres" - not worth fully
  // mocking. Just avoid crashing when Aurora doesn't exist yet; the actual
  // create/list functionality still needs the real database deployed.
  if (isDevBypassActive()) {
    warnBypass('app/admin/organizations/page.tsx');
    return (
      <div className="mx-auto max-w-2xl p-layout-margin">
        <h1 className="mb-4 font-display-lg text-display-lg text-on-surface">Organizations</h1>
        <div className="rounded-lg border border-dashed border-tertiary/40 bg-tertiary-container/10 p-6 font-body-sm text-body-sm text-tertiary">
          DEV_BYPASS_AUTH is on - this page needs the real Aurora database, which bypass mode
          deliberately doesn't fake. Deploy IdentityStack and unset DEV_BYPASS_AUTH to use this page.
        </div>
      </div>
    );
  }

  const db = createDb(dbConfigFromEnv());
  const orgs = await db.select().from(organizations);

  async function handleCreate(formData: FormData) {
    'use server';
    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;
    const db = createDb(dbConfigFromEnv());
    await createOrganization(db, name);
    // Missing before - the org WAS being created, but this page's cached
    // render never knew to refetch, so it looked like nothing happened until
    // some unrelated navigation happened to bust the cache. This is what
    // actually makes the new org show up immediately.
    revalidatePath('/admin/organizations');
  }

  return (
    <div className="mx-auto max-w-2xl space-y-xl p-layout-margin">
      <h1 className="font-display-lg text-display-lg text-on-surface">Organizations</h1>

      <form action={handleCreate} className="flex gap-2">
        <Input name="name" placeholder="Organization name (e.g. Aligent)" className="flex-1" />
        <Button type="submit">Create</Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="p-table-cell-padding font-medium">Organization</th>
              <th className="p-table-cell-padding font-medium">ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant font-body-base text-body-base text-on-surface">
            {orgs.map((org) => (
              <tr key={org.id} className="transition-colors hover:bg-surface-container-highest">
                <td className="p-table-cell-padding">
                  <Link href={`/org/clients?orgId=${org.id}`} className="font-medium text-primary hover:underline">
                    {org.name}
                  </Link>
                </td>
                <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">{org.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
