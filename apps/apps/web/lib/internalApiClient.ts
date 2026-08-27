// apps/web/lib/internalApiClient.ts
//
// Server-only - never import this from a 'use client' component. The secret
// this attaches must never reach the browser. This is what every existing
// client-side call in lib/api.ts needs to be proxied through, one Next.js
// route/Server Action at a time - see app/api/flows/route.ts for the pattern.

const FLOW_ENGINE_API_URL = process.env.FLOW_ENGINE_API_URL!;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY!;

export async function callFlowEngine<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${FLOW_ENGINE_API_URL}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-internal-api-key': INTERNAL_API_KEY,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Flow engine API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
