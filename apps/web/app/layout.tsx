// apps/web/app/layout.tsx
//
// Root nav links to both systems now: /clients (the original scopes-and-rules
// validator, per-client) and /flow-builder (the new canvas/compiler system,
// per document type - see flow-compiler-spec.md). These are genuinely
// separate products sharing one app shell, not two views of the same data.

import React from 'react';
import Link from 'next/link';
import './globals.css';
import { auth, signOut, getAuthorizationContext } from '@workspace/auth/server';
import { isDevBypassActive } from '@workspace/auth/devBypass';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Skip real NextAuth entirely in bypass mode - not just to avoid an
  // unnecessary session lookup, but because calling auth() at all here (every
  // page load goes through this layout) risks the same provider-config
  // validation error real sign-in hits, even though nothing on this
  // particular call path is trying to authenticate.
  const session = isDevBypassActive() ? null : await auth();

  // Previously the ONLY way to reach /admin/organizations was a link buried
  // inside /clients - which nothing points to as the default landing page
  // anymore (root redirects to /flow-builder instead, to avoid the Aurora
  // crash if the SSR compute role isn't configured yet). That made the whole
  // admin/org system undiscoverable even though it worked fine. Wrapped in
  // try/catch for the same reason /clients is - this nav renders on every
  // single page, so it can't be allowed to crash the whole app if Aurora
  // isn't reachable; it just silently doesn't show these links instead.
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
      <html lang="en">
      <body className="flex h-screen flex-col bg-gray-50 text-gray-900">
      <nav className="flex shrink-0 items-center gap-6 border-b border-gray-200 bg-white px-6 py-3">
        <Link href="/clients" className="font-medium hover:text-gray-700">
          Order validator
        </Link>
        <Link href="/flow-builder" className="text-sm text-gray-500 hover:text-gray-900">
          Flow Builder
        </Link>
        {isOrgAdmin && (
            <Link href="/org/clients" className="text-sm text-gray-500 hover:text-gray-900">
              Org settings
            </Link>
        )}
        {isPlatformAdmin && (
            <Link href="/admin/organizations" className="text-sm text-gray-500 hover:text-gray-900">
              Admin
            </Link>
        )}
        <div className="flex-1" />
        {session?.user?.email && (
            <>
              <span className="text-sm text-gray-500">{session.user.email}</span>
              <form
                  action={async () => {
                    'use server';
                    await signOut();
                  }}
              >
                <button type="submit" className="text-sm text-gray-500 hover:text-gray-900">
                  Sign out
                </button>
              </form>
            </>
        )}
      </nav>
      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </body>
      </html>
  );
}