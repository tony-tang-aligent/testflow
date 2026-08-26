// packages/auth/src/devBypass.ts
//
// TEMPORARY - a way to exercise the UI before real Azure AD credentials and
// Aurora are deployed. Deliberately double-gated so it can't end up live
// anywhere real: requires an explicit opt-in env var AND a non-production
// NODE_ENV. Every place that checks this also logs loudly when it fires, so
// it's never silently in effect - if you see pages working without ever
// hitting a sign-in flow, this is why, and the console will say so.
//
// Remove this file (and its three call sites in server.ts, requireClientAccess.ts,
// and app/clients/page.tsx) once real credentials are in place - it's not
// meant to be a permanent code path.

export function isDevBypassActive(): boolean {
  return process.env.DEV_BYPASS_AUTH === 'true' && process.env.NODE_ENV !== 'production';
}

export function warnBypass(where: string): void {
  console.warn(`[DEV_BYPASS_AUTH] Skipping real auth check in ${where} - remove before any real deployment.`);
}

// A stable fake identity so every bypassed page shows consistent data,
// rather than a different random fake user per request.
export const DEV_BYPASS_USER_ID = 'dev-bypass-user';
export const DEV_BYPASS_CLIENT_ID = process.env.DEV_BYPASS_CLIENT_ID ?? 'TODO-current-tenant';
