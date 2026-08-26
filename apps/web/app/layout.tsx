// apps/web/app/layout.tsx
//
// Root nav links to both systems now: /clients (the original scopes-and-rules
// validator, per-client) and /flow-builder (the new canvas/compiler system,
// per document type - see flow-compiler-spec.md). These are genuinely
// separate products sharing one app shell, not two views of the same data.

import React from 'react';
import Link from 'next/link';
import './globals.css';
import { auth, signOut } from '@workspace/auth/server';
import { isDevBypassActive } from '@workspace/auth/devBypass';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Skip real NextAuth entirely in bypass mode - not just to avoid an
  // unnecessary session lookup, but because calling auth() at all here (every
  // page load goes through this layout) risks the same provider-config
  // validation error real sign-in hits, even though nothing on this
  // particular call path is trying to authenticate.
  const session = isDevBypassActive() ? null : await auth();

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
