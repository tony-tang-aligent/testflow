// infra/lambda/flowBuilderShared/httpActionResolver.ts
//
// Shared by flowExecutor (the real, live path) and testHttpAction (the
// Postman-style "send test request" button) - built once here so testing a
// request and actually sending one for real can never silently diverge into
// two different behaviors. Both Lambdas import this same module; each gets
// their own bundled copy at build time (esbuild bundles per-Lambda), but the
// LOGIC itself only exists in one place.

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const secretsClient = new SecretsManagerClient({});

export interface KeyValueRow {
    id: string;
    key: string;
    value: string;
}

export interface HttpActionConfig {
    method?: string;
    url?: string;
    authType?: string;
    authHeaderName?: string;
    authSecretName?: string;
    headers?: KeyValueRow[];
    body?: KeyValueRow[];
}

function getPath(obj: unknown, path: string): unknown {
    if (!path) return obj;
    return path
        .split(/[.[\]]/)
        .filter(Boolean)
        .reduce<unknown>((acc, key) => {
            if (acc == null) return undefined;
            return (acc as Record<string, unknown>)[key];
        }, obj);
}

export function interpolate(template: string, item: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
        const value = getPath(item, path);
        return value == null ? '' : String(value);
    });
}

export function resolveKeyValueRows(
    rows: KeyValueRow[] | undefined,
    item: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const row of rows ?? []) {
        if (!row.key) continue;
        const resolvedValue = interpolate(row.value ?? '', item);
        const segments = row.key.split('.').filter(Boolean);
        let cursor = result;
        for (let i = 0; i < segments.length - 1; i++) {
            const seg = segments[i];
            if (typeof cursor[seg] !== 'object' || cursor[seg] === null) cursor[seg] = {};
            cursor = cursor[seg] as Record<string, unknown>;
        }
        cursor[segments[segments.length - 1]] = resolvedValue;
    }
    return result;
}

export async function resolveAuthHeader(
    config: HttpActionConfig,
): Promise<{ name: string; value: string } | null> {
    if (!config.authType || config.authType === 'None' || !config.authSecretName) return null;

    const secret = await secretsClient.send(
        new GetSecretValueCommand({ SecretId: `flow-builder-secrets/${config.authSecretName}` }),
    );
    const secretValue = secret.SecretString ?? '';

    switch (config.authType) {
        case 'API Key Header':
            return { name: config.authHeaderName || 'X-API-Key', value: secretValue };
        case 'Bearer Token':
            return { name: 'Authorization', value: `Bearer ${secretValue}` };
        case 'Basic Auth':
            return { name: 'Authorization', value: `Basic ${Buffer.from(secretValue).toString('base64')}` };
        default:
            return null;
    }
}

export interface ResolvedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
}

export async function resolveHttpRequest(
    config: HttpActionConfig,
    item: Record<string, unknown>,
): Promise<ResolvedRequest> {
    const method = (config.method ?? 'GET').toUpperCase();
    const url = interpolate(config.url ?? '', item);

    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const resolvedHeaders = resolveKeyValueRows(config.headers, item);
    for (const [k, v] of Object.entries(resolvedHeaders)) headers[k] = String(v);

    const authHeader = await resolveAuthHeader(config);
    if (authHeader) headers[authHeader.name] = authHeader.value;

    const hasBody = method !== 'GET' && method !== 'DELETE';
    const resolvedBody = hasBody ? resolveKeyValueRows(config.body, item) : undefined;

    return {
        url,
        method,
        headers,
        body: resolvedBody ? JSON.stringify(resolvedBody) : undefined,
    };
}

// SECURITY NOTE - deliberately not hardened, by explicit decision, given this
// system is internal-only now and expected to extend to trusted partners at
// most, not arbitrary/untrusted users. resolveHttpRequest's `url` is built
// from node config + interpolated payload data with NO validation against
// SSRF (e.g. a URL pointing at 169.254.169.254 or an internal-only address
// would be sent exactly like any other). If this system's trust boundary
// ever changes - genuinely public-facing, or configurable by users outside
// the org - this needs real hardening (private-IP blocking, an allowlist, or
// routing through a proxy with egress controls) before that happens, not
// after.