// apps/web/components/Sidebar.tsx
//
// Split out of layout.tsx specifically to add active-route highlighting -
// that needs usePathname(), a client-only hook, but layout.tsx itself does
// real server-side auth/DB checks (session, authz) that don't belong in a
// client component. Auth-derived flags come in as plain props instead; the
// sign-out server action is passed in as a prop too (Next.js explicitly
// supports Server Actions as props into Client Components), so nothing
// server-only actually moves here - only the nav's own rendering does.

'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview', icon: 'dashboard' },
  { href: '/flow-builder', label: 'Workflows', icon: 'account_tree' },
  { href: '/logs', label: 'Logs', icon: 'receipt_long' },
  { href: '/clients', label: 'Clients', icon: 'corporate_fare' },
];

function isActive(pathname: string, href: string): boolean {
  // Prefix match, not exact - /flow-builder/[flowId]/executions should still
  // highlight "Workflows", /clients/[clientId]/flows should still highlight
  // "Clients". /overview and /logs have no sub-routes today, but this stays
  // consistent for all four rather than special-casing two of them.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({
  isOrgAdmin,
  isPlatformAdmin,
  userEmail,
  onSignOut,
}: {
  isOrgAdmin: boolean;
  isPlatformAdmin: boolean;
  userEmail?: string | null;
  onSignOut: () => Promise<void>;
}) {
  const pathname = usePathname();

  return (
    <aside className="hidden h-screen w-[240px] shrink-0 flex-col border-r border-outline-variant bg-surface-container md:flex">
      <div className="flex items-center gap-md border-b border-outline-variant p-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-primary-container text-on-primary-container">
          <span className="material-symbols-outlined text-[18px]">verified</span>
        </div>
        <div className="overflow-hidden">
          <div className="truncate font-headline-md text-headline-md font-bold text-on-surface">FlexVal</div>
          <div className="truncate font-body-sm text-body-sm text-on-surface-variant">Order Validation Platform</div>
        </div>
      </div>

      <nav className="flex-1 space-y-base overflow-y-auto px-sm py-lg">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-md rounded px-md py-sm font-medium transition-colors duration-150 ${
                active
                  ? 'bg-surface-container-high text-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-highest'
              }`}
            >
              <span
                className="material-symbols-outlined text-[18px]"
                style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
        {(isOrgAdmin || isPlatformAdmin) && (
          <Link
            href="/settings"
            className={`flex items-center gap-md rounded px-md py-sm font-medium transition-colors duration-150 ${
              isActive(pathname, '/settings')
                ? 'bg-surface-container-high text-primary'
                : 'text-on-surface-variant hover:bg-surface-container-highest'
            }`}
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={isActive(pathname, '/settings') ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              settings
            </span>
            <span>Settings</span>
          </Link>
        )}
      </nav>

      <div className="space-y-base border-t border-outline-variant p-sm">
        {userEmail && (
          <div className="flex items-center justify-between px-md py-sm">
            <span className="truncate font-body-sm text-body-sm text-on-surface-variant">{userEmail}</span>
            <form action={onSignOut}>
              <button
                type="submit"
                className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container-highest hover:text-on-surface"
                aria-label="Sign out"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  );
}
