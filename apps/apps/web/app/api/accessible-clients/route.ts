// apps/web/app/api/accessible-clients/route.ts
//
// The one gap this exposed: apps/web/lib/api.ts's request() uses relative
// fetch paths, which only resolve in a browser (client component) - but
// "which clients can I see" only existed as a server-side Drizzle query (see
// app/clients/page.tsx). The new Logs page needs this from a client
// component to then fan out into api.listFlows/listExecutions per client -
// this route is what actually exposes it, reusing the exact same
// authorization logic, not a new/different one.

import { NextResponse } from 'next/server';
import { getAuthorizationContext } from '@workspace/auth/server';
import { createDb, dbConfigFromEnv, getAccessibleClients, clients } from '@workspace/db';

export async function GET() {
  const authz = await getAuthorizationContext();
  if (!authz) return NextResponse.json({ message: 'Not signed in' }, { status: 401 });

  try {
    const db = createDb(dbConfigFromEnv());
    const accessibleClients = authz.isPlatformAdmin
      ? await db.select().from(clients)
      : await getAccessibleClients(db, authz.userId);
    return NextResponse.json(accessibleClients.map((c) => ({ id: c.id, name: c.name })));
  } catch (err) {
    console.error('Failed to load accessible clients:', err);
    return NextResponse.json({ message: 'Could not reach the organization database' }, { status: 500 });
  }
}
