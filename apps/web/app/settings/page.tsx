// apps/web/app/settings/page.tsx
//
// A real hub, not a placeholder - routes into the org-admin/platform-admin
// pages that already exist (org/clients, org/users, admin/organizations)
// rather than duplicating their logic. Visibility mirrors the sidebar's own
// checks in layout.tsx.

export const dynamic = 'force-dynamic';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthorizationContext } from '@workspace/auth/server';

const LINKS = [
  { href: '/org/clients', label: 'Clients', description: 'Create and manage clients in your organization', icon: 'corporate_fare', requires: 'org-admin' as const },
  { href: '/org/users', label: 'Users', description: 'Manage member roles and per-client access', icon: 'group', requires: 'org-admin' as const },
  { href: '/admin/organizations', label: 'Organizations', description: 'Platform-wide organization management', icon: 'admin_panel_settings', requires: 'platform-admin' as const },
];

export default async function SettingsPage() {
  const authz = await getAuthorizationContext();
  if (!authz) redirect('/auth/signin');

  const isOrgAdmin = authz.organizations.some((o) => o.role === 'admin');
  const visibleLinks = LINKS.filter((l) =>
    l.requires === 'platform-admin' ? authz.isPlatformAdmin : authz.isPlatformAdmin || isOrgAdmin,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-lg p-layout-margin">
      <div>
        <h1 className="font-display-lg text-display-lg text-on-surface">Settings</h1>
        <p className="mt-xs font-body-sm text-body-sm text-on-surface-variant">Organization and access management</p>
      </div>

      {visibleLinks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant p-12 text-center">
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Nothing to manage here - ask your org admin if you need access to something.
          </p>
        </div>
      ) : (
        <div className="space-y-sm">
          {visibleLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-md rounded-lg border border-outline-variant bg-surface-container p-lg transition-colors hover:bg-surface-container-highest"
            >
              <span className="material-symbols-outlined text-[22px] text-on-surface-variant">{link.icon}</span>
              <div className="flex-1">
                <div className="font-medium text-on-surface">{link.label}</div>
                <div className="font-body-sm text-body-sm text-on-surface-variant">{link.description}</div>
              </div>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
