// apps/web/lib/requireClientAccess.ts
//
// Every proxy route needs the exact same check: is someone signed in, and can
// they actually access this Client? Centralized here so it's enforced
// identically everywhere, rather than each route re-implementing it slightly
// differently.

import { NextResponse } from 'next/server';
import { getAuthorizationContext } from '@workspace/auth/server';
import { createDb, dbConfigFromEnv, canAccessClient } from '@workspace/db';

export async function requireClientAccess(
  clientId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const authz = await getAuthorizationContext();
  if (!authz) {
    return { ok: false, response: NextResponse.json({ message: 'Not signed in' }, { status: 401 }) };
  }

  if (authz.isPlatformAdmin) return { ok: true };

  const db = createDb(dbConfigFromEnv());
  const allowed = await canAccessClient(db, authz.userId, clientId);
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true };
}
