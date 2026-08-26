// packages/auth/src/config.ts
//
// One identity mechanism for everyone - unlike the reference POC (which ran a
// second, hand-built Credentials/magic-link system for external users), every
// sign-in here goes through the same Cognito<->Azure AD federation. Portalink
// staff already have Azure AD accounts; external agency users get one via a
// Microsoft B2B guest invitation (packages/db/src/invitations.ts) - Azure AD
// itself handles verifying a guest who has no existing account, so we never
// need to issue or validate our own tokens.
//
// Deliberately thin: this file only resolves WHO signed in (Cognito sub +
// email). It does NOT bake org/role/client-access into the JWT, since those
// can change between sign-ins and a long-lived token would go stale - see
// server.ts's getAuthorizationContext, which resolves that fresh from
// packages/db on every request instead.

import Cognito from 'next-auth/providers/cognito';
import type { NextAuthConfig, DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      cognitoSub?: string;
    };
  }
}

export const authConfig: NextAuthConfig = {
  // Explicit, not relying on the AUTH_TRUST_HOST env var being auto-detected -
  // that convention is well-documented for Vercel specifically; Amplify isn't
  // one of the platforms Auth.js auto-recognizes, so without this set directly
  // in code, NextAuth may fall back to constructing redirect_uri from
  // localhost regardless of what AUTH_URL is set to. This is what was
  // actually causing the deployed sign-in flow to hand Cognito a localhost
  // redirect_uri, which Cognito then honored (since localhost is a genuinely
  // registered callback, kept for local dev).
  trustHost: true,
  providers: [
    Cognito({
      clientId: process.env.AUTH_COGNITO_ID!,
      clientSecret: process.env.AUTH_COGNITO_SECRET!,
      issuer: process.env.AUTH_COGNITO_ISSUER!,
      // Inherited from the Portalink reference POC, and needed for the exact
      // same reason there: @auth/core defaults to ["pkce"] and only swaps to
      // ["nonce"] if OIDC discovery metadata (fetched fresh, unreliable on a
      // cold serverless request) says S256 PKCE is unsupported. Cognito's
      // Azure-AD-federated ID tokens always carry a nonce claim regardless,
      // so the default PKCE path fails first-login with "unexpected ID Token
      // nonce claim value." Forcing ["nonce"] makes the working path
      // deterministic instead of racy.
      checks: ['nonce'],
      authorization: {
        params: {
          identity_provider: 'AzureAD',
        },
      },
    }),
  ],
  callbacks: {
    jwt({ token, account }) {
      if (account?.provider === 'cognito') {
        token.cognitoSub = account.providerAccountId;
      }
      return token;
    },
    session({ session, token }) {
      // Just identity - org/role/client-access resolved live, see server.ts.
      session.user.cognitoSub = token.cognitoSub as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};
