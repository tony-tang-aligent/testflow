// web/app/layout.tsx
//
// Root nav is now flow-agnostic - just the app name linking home to /flows.
// The Canvas/Rules/Executions sub-nav moved to app/flows/[flowId]/layout.tsx,
// since those pages only make sense once a specific flow is selected.

import React from 'react';
import Link from 'next/link';
import './globals.css';

// TODO(auth): wrap children in an auth provider (Amplify Auth / Cognito) and
// redirect to sign-in when unauthenticated. TODO(RDS): show the current user's
// company name in the nav once identity resolution exists.

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex h-screen flex-col bg-gray-50 text-gray-900">
        <nav className="flex shrink-0 items-center gap-6 border-b border-gray-200 bg-white px-6 py-3">
          <Link href="/flows" className="font-medium hover:text-gray-700">
            Order validator
          </Link>
          {/* TODO(auth): user menu / sign-out goes here */}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
