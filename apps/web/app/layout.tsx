// apps/web/app/layout.tsx
//
// Genuinely new shell, not a restyle - persistent 240px left sidebar
// (Overview/Workflows/Logs/Clients/Settings) replacing the old top-nav
// entirely, matching the provided design spec exactly. Auth/authz logic is
// completely unchanged from before - only the markup around it changed.
//
// Nav mapping, since our two existing systems don't perfectly match the
// spec's five items one-to-one:
//   Overview   -> /overview (new - real flow counts, not fabricated telemetry)
//   Workflows  -> /flow-builder (existing flows list)
//   Logs       -> /clients (closest existing thing - the old validator's
//                 executions view lives under a specific client/flow, no
//                 single cross-flow log view exists yet)
//   Clients    -> /clients
//   Settings   -> /settings (new hub, routes further based on role)

import React from 'react';
import Link from 'next/link';
import './globals.css';
import { auth, signOut, getAuthorizationContext } from '@workspace/auth/server';
import { isDevBypassActive } from '@workspace/auth/devBypass';

const NAV_ITEMS = [
  { href: '/overview', label: 'Overview', icon: 'dashboard' },
  { href: '/flow-builder', label: 'Workflows', icon: 'account_tree' },
  { href: '/clients', label: 'Logs', icon: 'receipt_long' },
  { href: '/clients', label: 'Clients', icon: 'corporate_fare' },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = isDevBypassActive() ? null : await auth();

  let isPlatformAdmin = false;
  let isOrgAdmin = false;
  try {
    const authz = await getAuthorizationContext();
    isPlatformAdmin = authz?.isPlatformAdmin ?? false;
    isOrgAdmin = authz?.organizations.some((o) => o.role === 'admin') ?? false;
  } catch {
    // Aurora/SSR compute role not configured - admin links just don't show.
  }

  return (
    <html className="dark" lang="en">
      <body className="flex h-screen overflow-hidden bg-background text-on-background font-body-base text-body-base antialiased">
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
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-md rounded px-md py-sm font-medium text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-highest"
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
            {(isOrgAdmin || isPlatformAdmin) && (
              <Link
                href="/settings"
                className="flex items-center gap-md rounded px-md py-sm font-medium text-on-surface-variant transition-colors duration-150 hover:bg-surface-container-highest"
              >
                <span className="material-symbols-outlined text-[18px]">settings</span>
                <span>Settings</span>
              </Link>
            )}
          </nav>

          <div className="space-y-base border-t border-outline-variant p-sm">
            {session?.user?.email && (
              <div className="flex items-center justify-between px-md py-sm">
                <span className="truncate font-body-sm text-body-sm text-on-surface-variant">{session.user.email}</span>
                <form
                  action={async () => {
                    'use server';
                    await signOut({ redirectTo: '/auth/signin' });
                  }}
                >
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

        <main className="min-h-0 flex-1 overflow-y-auto bg-background">{children}</main>
      </body>
    </html>
  );
}
