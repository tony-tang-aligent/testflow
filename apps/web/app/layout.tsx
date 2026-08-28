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
//   Logs       -> /logs (new - real cross-client execution log, not a
//                 placeholder anymore)
//   Clients    -> /clients
//   Settings   -> /settings (new hub, routes further based on role)

import React from 'react';
import './globals.css';
import { auth, signOut, getAuthorizationContext } from '@workspace/auth/server';
import { isDevBypassActive } from '@workspace/auth/devBypass';
import { Sidebar } from '../components/Sidebar';

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

  async function handleSignOut() {
    'use server';
    await signOut({ redirectTo: '/auth/signin' });
  }

  return (
    <html className="dark" lang="en">
      <head>
        {/* Explicit <link> tags, not a CSS @import in globals.css - that
            worked fine under webpack, but broke silently under Turbopack
            (stable-by-default as of Next.js 16), rendering every Material
            Symbols icon as its literal ligature text ("account_tree",
            "verified", etc.) instead of the actual glyph. This is pure
            HTML, resolved by the browser directly, independent of whatever
            Turbopack's CSS @import handling is doing - matches how the
            original design mockups this whole UI was built from loaded
            fonts in the first place. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
      </head>
      <body className="flex h-screen overflow-hidden bg-background text-on-background font-body-base text-body-base antialiased">
        <Sidebar
          isOrgAdmin={isOrgAdmin}
          isPlatformAdmin={isPlatformAdmin}
          userEmail={session?.user?.email}
          onSignOut={handleSignOut}
        />

        <main className="min-h-0 flex-1 overflow-y-auto bg-background">{children}</main>
      </body>
    </html>
  );
}
