// infra/lambda/shared/adapterRegistry.ts

import { ErpAdapter } from './erpAdapter';
import { MockAdapter } from './adapters/mockAdapter';
import { MyobAdvancedAdapter } from './adapters/myobAdapter';

/**
 * Resolves an ErpAdapter instance from FlowDefinition.adapterId.
 *
 * TODO(RDS): once tenant/company records live in RDS, this should also resolve
 * per-tenant adapter config (base URL, secret ARN) from there rather than the
 * placeholder env-var lookup below.
 */
export async function getAdapter(adapterId: string | undefined, tenantId: string): Promise<ErpAdapter> {
  // Missing adapterId means a config gap (a FlowDefinition item somehow saved
  // without one), not necessarily an unrecoverable error - defaulting to the
  // always-available mock adapter keeps a manual test runnable rather than
  // hard-failing on what's usually a stale/partial save. An explicit, unknown,
  // *non-empty* adapterId still throws below, since that's a real misconfiguration.
  const resolvedAdapterId = adapterId || 'mock';
  if (!adapterId) {
    console.warn(`No adapterId set for tenant ${tenantId} - defaulting to 'mock'.`);
  }

  switch (resolvedAdapterId) {
    case 'mock':
      return new MockAdapter();
    case 'myob-advanced':
      return new MyobAdvancedAdapter({
        baseUrl: process.env.MYOB_BASE_URL ?? '',
        // TODO(RDS): replace with a per-tenant secret ARN lookup
        secretArn: process.env.MYOB_SECRET_ARN ?? '',
      });
    default:
      throw new Error(`Unknown adapterId: ${resolvedAdapterId}`);
  }
}
