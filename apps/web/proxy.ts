// apps/web/proxy.ts
//
// Renamed from middleware.ts - as of Next.js 16, the middleware.ts file
// convention is deprecated in favor of proxy.ts (the exported function
// renamed the same way: middleware -> proxy). Behavior is unchanged.
//
// The actual bug this fixes: relying on each individual page to remember to
// call getAuthorizationContext() and redirect itself meant some did
// (clients, settings, admin/organizations, org/users, org/clients) and some
// simply never did (overview, flow-builder and every one of its sub-routes,
// logs) - not because those pages are less important, just because nobody
// added the check when they were built. Centralizing this in proxy means
// every route is protected by default, regardless of whether its own
// page.tsx remembers to check.
//
// Per Next.js's own current guidance, this should never be the ONLY
// enforcement layer (see CVE-2025-29927 and the later prefetch-bypass
// issue) - the five pages that already call getAuthorizationContext()
// directly are the more fundamentally correct pattern. This proxy is a
// fast, coarse first line of defense, not a substitute for per-page checks.
//
// Still uses a SEPARATE, lightweight NextAuth instance built from
// authConfig directly, not @workspace/auth/server's own `auth` export - not
// for Edge-compatibility anymore (Proxy defaults to the Node.js runtime as
// of v16, so that specific constraint no longer applies), but to avoid a
// real DB query (getAuthorizationContext) running on EVERY matched request
// regardless of whether that page needs role-based access at all. This
// checks identity only; role/org checks stay where they already correctly
// are, in the pages that actually need them.

import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from '@workspace/auth/config';
import { isDevBypassActive, warnBypass } from '@workspace/auth/devBypass';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (isDevBypassActive()) {
    warnBypass('proxy');
    return NextResponse.next();
  }
  if (!req.auth) {
    return NextResponse.redirect(new URL('/auth/signin', req.url));
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except: NextAuth's own API routes (must stay reachable or
    // the sign-in flow itself can never complete - protecting them would be
    // a redirect loop), the sign-in page itself, and Next.js's own static
    // assets.
    '/((?!api/auth|auth/signin|auth/error|_next/static|_next/image|favicon.ico).*)',
  ],
};
