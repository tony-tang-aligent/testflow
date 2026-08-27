// apps/web/app/clients/page.tsx
//
// The actual landing page now that a user might belong to an org with several
// Clients (end-customers). Platform-admins see literally every Client across
// every Organization; everyone else sees exactly what getAccessibleClients
// resolves (org-admin: every Client under their org; org-member: only what's
// been explicitly granted).


// Forces this page to render fresh on every request, at runtime, never as a build-time
// static file - without this, Next.js pre-renders it once at BUILD time (when no SSR
// compute role exists yet), bakes in whatever the DB call returned THEN, and serves
// that frozen result forever afterward regardless of runtime fixes.
export const dynamic = 'force-dynamic';
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
  } catch (err) {
    // This was a real bug - a bare catch that always showed the same "SSR
    // compute role" message regardless of what actually failed. Now that the
    // compute role is confirmed working (verified by directly assuming it
    // and querying Aurora), this message could easily have been masking a
    // completely different error the whole time. Logging the real one so
    // CloudWatch shows what's actually happening, instead of guessing again.
    console.error('Failed to load clients:', err);
    return (
      <div className="mx-auto max-w-2xl p-layout-margin">
        <div className="rounded-lg border border-dashed border-tertiary/40 bg-tertiary-container/10 p-8 text-center font-body-sm text-body-sm text-tertiary">
          Can't reach the organization database right now - check server logs for the actual error
          (this message no longer assumes it's the SSR compute role specifically).
        </div>
      </div>
    );
  }

  // A platform-admin with exactly one Client, or an org-member with only one
  // grant, doesn't need to choose - skip straight to it.
  if (accessibleClients.length === 1) {
    redirect(`/clients/${accessibleClients[0].id}/flows`);
  }

  const mostRecent = [...accessibleClients].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];

  return (
    <div className="mx-auto max-w-[1200px] space-y-xl p-layout-margin">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">Clients</h1>
          <p className="mt-xs font-body-sm text-body-sm text-on-surface-variant">
            Pick which client's flows you want to work on.
          </p>
        </div>
      </div>

      {/* Only fields the schema actually tracks - name, tenant ID, created
          date. The reference design's "Environment" / "Active Flows" /
          "Status" / "Last Activity" columns don't correspond to anything
          stored anywhere - fabricating them would look real and not be. */}
      <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
        <div className="rounded-xl border border-outline-variant bg-surface-container p-md">
          <div className="flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Total clients</span>
            <span className="material-symbols-outlined text-[18px] text-outline">corporate_fare</span>
          </div>
          <div className="mt-sm font-headline-md text-headline-md text-on-surface">{accessibleClients.length}</div>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container p-md">
          <div className="flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Most recently added</span>
            <span className="material-symbols-outlined text-[18px] text-outline">rocket_launch</span>
          </div>
          {mostRecent ? (
            <>
              <div className="mt-sm font-headline-md text-headline-md text-on-surface">{mostRecent.name}</div>
              <div className="font-body-sm text-body-sm text-on-surface-variant">
                {new Date(mostRecent.createdAt).toLocaleDateString()}
              </div>
            </>
          ) : (
            <div className="mt-sm font-body-sm text-body-sm text-on-surface-variant">None yet</div>
          )}
        </div>
      </div>

      {accessibleClients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant p-12 text-center">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            You don't have access to any clients yet - ask your org admin to grant you access.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="p-table-cell-padding font-medium">Client name</th>
                <th className="p-table-cell-padding font-medium">Tenant ID</th>
                <th className="p-table-cell-padding font-medium">Created</th>
                <th className="p-table-cell-padding text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-body-base text-body-base text-on-surface">
              {accessibleClients.map((client) => (
                <tr key={client.id} className="group transition-colors hover:bg-surface-container-highest">
                  <td className="p-table-cell-padding">
                    <div className="flex items-center gap-sm">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-outline-variant bg-surface-variant">
                        <span className="font-label-caps text-[10px] text-on-surface-variant">
                          {client.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <span className="font-medium">{client.name}</span>
                    </div>
                  </td>
                  <td className="p-table-cell-padding">
                    <span className="rounded border border-outline-variant bg-background px-1.5 py-0.5 font-code-sm text-code-sm text-on-surface-variant">
                      {client.tenantId}
                    </span>
                  </td>
                  <td className="p-table-cell-padding font-body-sm text-body-sm text-on-surface-variant">
                    {new Date(client.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-table-cell-padding text-right">
                    <Link
                      href={`/clients/${client.id}/flows`}
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

      {authz.isPlatformAdmin && (
        <div className="border-t border-outline-variant pt-lg">
          <Link
            href="/admin/organizations"
            className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface"
          >
            Platform admin: manage organizations →
          </Link>
        </div>
      )}
    </div>
  );
}
