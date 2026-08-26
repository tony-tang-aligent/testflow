// infra/lambda/shared/genericHttp.ts
//
// This is deliberately NOT mediated through ErpAdapter/adapterRegistry - a
// curated system (MYOB, NetSuite, whatever) should get a real adapter that
// encapsulates its auth/pagination/rate-limit/shape quirks once. This exists
// for the long tail: a one-off system that doesn't warrant building a whole
// adapter for yet. Same role as n8n's "HTTP Request" node sitting next to its
// ~400 app-specific nodes - the escape hatch, not the default.

import { getSecretValue } from './secrets';
import { Resolver } from './types';

function interpolate(template: string, item: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc == null) return undefined;
      return (acc as Record<string, unknown>)[key];
    }, item);
    return value == null ? '' : String(value);
  });
}

function getPath(obj: unknown, path: string): unknown {
  if (!path || path === '$') return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

export async function callGenericHttp(
  resolver: Resolver,
  item: Record<string, unknown>,
  tenantId: string,
): Promise<unknown> {
  if (!resolver.httpUrl) throw new Error('httpCall resolver missing httpUrl');

  const url = interpolate(resolver.httpUrl, item);
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(resolver.httpHeaders ?? {}) };

  if (resolver.httpAuthSecretName) {
    const token = await getSecretValue(resolver.httpAuthSecretName, tenantId);
    headers.authorization = `Bearer ${token}`;
  }

  const body = resolver.httpBodyTemplate ? interpolate(resolver.httpBodyTemplate, item) : undefined;

  const res = await fetch(url, {
    method: resolver.httpMethod ?? 'GET',
    headers,
    body,
  });

  if (!res.ok) {
    throw new Error(`httpCall resolver: ${resolver.httpMethod ?? 'GET'} ${url} returned ${res.status}`);
  }

  const json = await res.json();
  return resolver.httpResponsePath ? getPath(json, resolver.httpResponsePath) : json;
}
