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
            <div className="mx-auto max-w-2xl p-6">
                <h1 className="mb-4 text-lg font-medium">Clients</h1>
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-6 text-sm text-amber-800">
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
            <div className="mx-auto max-w-2xl p-6">
                <h1 className="mb-1 text-lg font-medium">Clients</h1>
                <p className="text-sm text-gray-500">
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
        <div className="mx-auto max-w-2xl p-6">
            <h1 className="mb-1 text-lg font-medium">Clients</h1>
            <p className="mb-6 text-sm text-gray-500">{targetOrg.organizationName}</p>

            <form action={handleCreate} className="mb-6 space-y-2 rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex gap-2">
                    <input
                        name="name"
                        placeholder="Client name (e.g. Modelflight)"
                        className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
                    />
                    <input
                        name="tenantId"
                        placeholder="tenantId (must match a deployed flow-engine stack)"
                        className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm font-mono"
                    />
                </div>
                <p className="text-xs text-gray-400">
                    This only creates the metadata row - the actual flow-engine CDK stack for this tenantId still needs
                    deploying separately (auto-provisioning is a deferred, not-yet-built piece).
                </p>
                <button type="submit" className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white">
                    Create
                </button>
            </form>

            <div className="space-y-2">
                {orgClients.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
                        No clients yet.
                    </div>
                ) : (
                    orgClients.map((client) => (
                        <div key={client.id} className="flex items-center justify-between rounded border border-gray-200 bg-white px-4 py-3">
                            <div>
                                <div className="text-sm font-medium">{client.name}</div>
                                <div className="text-xs text-gray-400">{client.tenantId}</div>
                            </div>
                            <Link href={`/clients/${client.tenantId}/flows`} className="text-sm text-gray-400 hover:text-gray-900">
                                Open →
                            </Link>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}