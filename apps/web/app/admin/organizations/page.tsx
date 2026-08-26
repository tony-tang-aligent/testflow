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
import { getAuthorizationContext } from '@workspace/auth/server';
import { createDb, dbConfigFromEnv, createOrganization, organizations } from '@workspace/db';
import { isDevBypassActive, warnBypass } from '@workspace/auth/devBypass';

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
            <div className="mx-auto max-w-2xl p-6">
                <h1 className="mb-4 text-lg font-medium">Organizations</h1>
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">
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
    }

    return (
        <div className="mx-auto max-w-2xl p-6">
            <h1 className="mb-4 text-lg font-medium">Organizations</h1>

            <form action={handleCreate} className="mb-6 flex gap-2">
                <input
                    name="name"
                    placeholder="Organization name (e.g. Aligent)"
                    className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
                />
                <button type="submit" className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white">
                    Create
                </button>
            </form>

            <div className="space-y-2">
                {orgs.map((org) => (
                    <div key={org.id} className="rounded border border-gray-200 bg-white px-4 py-3">
                        <div className="text-sm font-medium">{org.name}</div>
                        <div className="text-xs text-gray-400">{org.id}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}