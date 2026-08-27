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
import { ArrowRight } from 'lucide-react';
import { Card } from '../../components/ui/card';

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
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-8 text-center text-sm text-amber-800">
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

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Clients</h1>
      <p className="mb-6 text-sm text-muted-foreground">Pick which client's flows you want to work on.</p>

      {accessibleClients.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            You don't have access to any clients yet - ask your org admin to grant you access.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {accessibleClients.map((client) => (
            <Link key={client.id} href={`/clients/${client.id}/flows`}>
              <Card className="flex items-center justify-between px-4 py-3 transition-shadow hover:shadow-md">
                <span className="text-sm font-medium">{client.name}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      {authz.isPlatformAdmin && (
        <div className="mt-8 border-t pt-4">
          <Link href="/admin/organizations" className="text-sm text-muted-foreground hover:text-foreground">
            Platform admin: manage organizations →
          </Link>
        </div>
      )}
    </div>
  );
}
