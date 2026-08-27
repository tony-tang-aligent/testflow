// apps/web/app/layout.tsx
//
// Rebuilt with the shadcn/Tailwind foundation - Button for the sign-out
// action, Separator for the vertical dividers, restrained Polaris-style
// spacing and typography instead of ad-hoc gray-500/gray-700 pairs scattered
// through the markup. All the underlying auth/routing logic is unchanged -
// this is a visual pass, not a behavior change.

import React from 'react';
import Link from 'next/link';
import './globals.css';
import { auth, signOut, getAuthorizationContext } from '@workspace/auth/server';
import { isDevBypassActive } from '@workspace/auth/devBypass';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';

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
    <html lang="en">
      <body className="flex h-screen flex-col bg-background text-foreground antialiased">
        <nav className="flex h-14 shrink-0 items-center gap-1 border-b bg-card px-6">
          <Link href="/clients" className="mr-4 text-sm font-semibold tracking-tight">
            Order Validator
          </Link>
          <Link
            href="/flow-builder"
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Flow Builder
          </Link>
          {isOrgAdmin && (
            <Link
              href="/org/clients"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Org settings
            </Link>
          )}
          {isPlatformAdmin && (
            <Link
              href="/admin/organizations"
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Admin
            </Link>
          )}
          <div className="flex-1" />
          {session?.user?.email && (
            <>
              <span className="text-sm text-muted-foreground">{session.user.email}</span>
              <Separator orientation="vertical" className="mx-3 h-5" />
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/auth/signin' });
                }}
              >
                <Button type="submit" variant="ghost" size="sm">
                  Sign out
                </Button>
              </form>
            </>
          )}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
