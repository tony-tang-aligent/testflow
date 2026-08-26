// infra/lambda/shared/secrets.ts
//
// Thin cached wrapper over Secrets Manager. Used by both the AI adapter (BYOK
// provider key) and the generic HTTP resolver (arbitrary bearer token/API key).
//
// TODO(RDS): secret naming is currently a flat convention
// (`order-validator/{tenantId}/{secretName}`) since there's no company/tenant
// record in RDS yet to hold a proper secret ARN reference. Once that exists,
// resolve the actual ARN from there instead of guessing the name.

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});
const cache = new Map<string, { value: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getSecretValue(secretName: string, tenantId?: string): Promise<string> {
  const fullName = tenantId ? `order-validator/${tenantId}/${secretName}` : secretName;

  const cached = cache.get(fullName);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const res = await client.send(new GetSecretValueCommand({ SecretId: fullName }));
  const value = res.SecretString ?? '';
  cache.set(fullName, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}
