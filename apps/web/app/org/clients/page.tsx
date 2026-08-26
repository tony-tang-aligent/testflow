// apps/web/app/org/clients/page.tsx
//
// Org-admin surface, deferred from the original identity-layer build and
// genuinely missing until now - not drift, an actual gap. Mirrors
// /admin/organizations' pattern exactly, but scoped to the one org this
// person administers, rather than platform-admin's every-org view.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthorizationContext } from '@workspace/auth/server';
import { createDb, dbConfigFromEnv, createClient, clients } from '@workspace/db';
import { eq } from 'drizzle-orm';
import { isDevBypassActive, warnBypass } from '@workspace/auth/devBypass';

export default async function OrgClientsPage() {
    const authz = await getAuthorizationContext();
    if (!authz) redirect('/auth/signin');

    const adminOrg = authz.organizations.find((o) => o.role === 'admin');
    if (!authz.isPlatformAdmin && !adminOrg) redirect('/');

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

    if (!adminOrg) {
        return (
            <div className="mx-auto max-w-2xl p-6">
                <h1 className="mb-1 text-lg font-medium">Clients</h1>
                <p className="text-sm text-gray-500">
                    You're a platform admin but don't administer a specific organization - see{' '}
                    <Link href="/admin/organizations" className="underline">
                        Admin
                    </Link>{' '}
                    for the full cross-org view instead.
                </p>
            </div>
        );
    }

    const db = createDb(dbConfigFromEnv());
    const orgClients = await db.select().from(clients).where(eq(clients.organizationId, adminOrg.organizationId));

    async function handleCreate(formData: FormData) {
        'use server';
        const name = String(formData.get('name') ?? '').trim();
        const tenantId = String(formData.get('tenantId') ?? '').trim();
        if (!name || !tenantId) return;
        const db = createDb(dbConfigFromEnv());
        await createClient(db, adminOrg!.organizationId, name, tenantId);
    }

    return (
        <div className="mx-auto max-w-2xl p-6">
            <h1 className="mb-1 text-lg font-medium">Clients</h1>
            <p className="mb-6 text-sm text-gray-500">{adminOrg.organizationName}</p>

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