// infra/lambda/shared/aiAdapterRegistry.ts
//
// BYOK - a tenant's rules can call AI, but only using a key that tenant
// provided and pays for themselves. There is no platform-wide fallback key by
// design; if a tenant hasn't configured one, an 'ai' resolver fails clearly
// rather than silently running on someone else's bill.
//
// TODO(RDS): once tenant/company records exist, whether AI is enabled at all
// for a tenant should be a real flag there, not just "did the secret get set."
// TODO: no UI to let a tenant paste in their own API key yet - for now this
// secret has to be created manually (see DEPLOYMENT.md) via:
//   aws secretsmanager create-secret --name order-validator/<tenantId>/ai-api-key --secret-string <key>

import { getSecretValue } from './secrets';
import { AiAdapter, AnthropicAiAdapter } from './aiAdapter';

export async function getAiAdapter(tenantId: string): Promise<AiAdapter> {
  const apiKey = await getSecretValue('ai-api-key', tenantId);
  if (!apiKey) {
    throw new Error(
      `No AI API key configured for tenant ${tenantId} - AI resolvers are BYOK and won't run without one.`,
    );
  }
  return new AnthropicAiAdapter({ apiKey });
}
