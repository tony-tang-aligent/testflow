// apps/web/app/clients/page.tsx
//
// The actual landing page now that a user might belong to an org with several
// Clients (end-customers). Platform-admins see literally every Client across
// every Organization; everyone else sees exactly what getAccessibleClients
// resolves (org-admin: every Client under their org; org-member: only what's
// been explicitly granted).

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthorizationContext } from '@workspace/auth/server';
import { createDb, dbConfigFromEnv, getAccessibleClients, clients } from '@workspace/db';
import { isDevBypassActive, warnBypass, DEV_BYPASS_CLIENT_ID } from '@workspace/auth/devBypass';

export default async function ClientsPage() {
  const authz = await getAuthorizationContext();
  if (!authz) redirect('/auth/signin');

  // Bypass mode: skip the real Postgres query entirely (not just the auth
  // check) - this page is the one other spot besides getAuthorizationContext
  // that talks to the database directly. Redirects straight through to
  // whatever tenantId is already deployed in the original flow-engine stack.
  if (isDevBypassActive()) {
    warnBypass('app/clients/page.tsx');
    redirect(`/clients/${DEV_BYPASS_CLIENT_ID}/flows`);
  }

  const db = createDb(dbConfigFromEnv());
  const accessibleClients = authz.isPlatformAdmin
    ? await db.select().from(clients)
    : await getAccessibleClients(db, authz.userId);

  // A platform-admin with exactly one Client, or an org-member with only one
  // grant, doesn't need to choose - skip straight to it.
  if (accessibleClients.length === 1) {
    redirect(`/clients/${accessibleClients[0].id}/flows`);
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-lg font-medium">Clients</h1>
      <p className="mb-6 text-sm text-gray-600">Pick which client's flows you want to work on.</p>

      {accessibleClients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          You don't have access to any clients yet - ask your org admin to grant you access.
        </div>
      ) : (
        <div className="space-y-2">
          {accessibleClients.map((client) => (
            <Link
              key={client.id}
              href={`/clients/${client.id}/flows`}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-gray-300 hover:shadow"
            >
              <span className="text-sm font-medium text-gray-900">{client.name}</span>
              <span className="text-sm text-gray-400">Open →</span>
            </Link>
          ))}
        </div>
      )}

      {authz.isPlatformAdmin && (
        <div className="mt-8 border-t border-gray-100 pt-4">
          <Link href="/admin/organizations" className="text-sm text-gray-500 hover:text-gray-900">
            Platform admin: manage organizations →
          </Link>
        </div>
      )}
    </div>
  );
}
