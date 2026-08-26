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

  // The Aurora/SSR-compute-role dependency below is a real, separate piece of
  // infrastructure that can legitimately not be configured yet (SSR compute
  // functions get ZERO AWS access by default on Amplify - a compute role has
  // to be explicitly created and attached, a step easy to skip entirely).
  // Failing gracefully here instead of letting an unhandled exception crash
  // the whole page - this is "clean" in the sense of not silently pretending
  // the org/client system is broken when it's specifically this one
  // dependency that's unconfigured.
  let accessibleClients;
  try {
    const db = createDb(dbConfigFromEnv());
    accessibleClients = authz.isPlatformAdmin
        ? await db.select().from(clients)
        : await getAccessibleClients(db, authz.userId);
  } catch {
    return (
        <div className="mx-auto max-w-2xl p-6">
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-800">
            Can't reach the organization database right now - this page needs an SSR compute role
            attached to the Amplify app (RDS Data API + Secrets Manager access). See infra/lib/identity-stack.ts.
          </div>
        </div>
    );
  }

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