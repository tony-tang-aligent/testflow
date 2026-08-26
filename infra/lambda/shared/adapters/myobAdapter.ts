// infra/lambda/shared/adapters/myobAdapter.ts
//
// First real ErpAdapter implementation. Wraps MYOB Advanced's OData API.
//
// TODO: wire this up to the existing OData client / auth handling already built for the
// MYOB Advanced <-> BigCommerce sync services (Oct-Dec 2025) - don't rewrite the OData
// plumbing from scratch here, import/port the existing client module.

import { ErpAdapter } from '../erpAdapter';

interface MyobAdapterConfig {
  baseUrl: string;
  // TODO(RDS): credentials should be resolved per-tenant via Secrets Manager, keyed by
  // tenantId once the identity/org control plane (RDS) is in place. For now this takes
  // a secretArn directly - the caller (adapter factory) is responsible for resolving it.
  secretArn: string;
}

export class MyobAdvancedAdapter implements ErpAdapter {
  constructor(private readonly config: MyobAdapterConfig) {}

  private async getCredentials(): Promise<{ username: string; password: string; tenant: string }> {
    // TODO: fetch + cache from Secrets Manager (reuse SSM/Secrets Manager credential
    // pattern from the existing MYOB sync services).
    throw new Error('Not implemented: MyobAdvancedAdapter.getCredentials');
  }

  async getDocument(refType: string, key: string): Promise<Record<string, unknown> | null> {
    // TODO: map refType -> the correct MYOB Advanced OData entity
    //   'purchaseOrder'   -> PurchaseOrder
    //   'goodsReceipt'    -> POReceipt
    //   'vendorMaster'    -> Vendor
    //   'customerMaster'  -> Customer
    //   'materialMaster'  -> StockItem
    // and perform the actual $filter query by business key. Return null on 404.
    throw new Error(`Not implemented: MyobAdvancedAdapter.getDocument(${refType}, ${key})`);
  }

  async getLineItem(
    refType: string,
    key: string,
    lineKey: string,
  ): Promise<Record<string, unknown> | null> {
    // TODO: most MYOB Advanced entities expose lines as a nested collection ($expand=Details) -
    // fetch the parent document with $expand and find the line by lineKey (e.g. InventoryID/SKU).
    throw new Error(
      `Not implemented: MyobAdvancedAdapter.getLineItem(${refType}, ${key}, ${lineKey})`,
    );
  }

  async queryHistorical(entity: string, keyValues: Record<string, unknown>): Promise<boolean> {
    // TODO: uniqueness checks against MYOB Advanced (e.g. duplicate PO number) map to an
    // OData $filter existence query against the relevant entity using keyValues.
    throw new Error(`Not implemented: MyobAdvancedAdapter.queryHistorical(${entity})`);
  }

  async getDocumentsBatch(
    refType: string,
    keys: string[],
  ): Promise<Record<string, Record<string, unknown> | null>> {
    // TODO: MYOB Advanced OData supports $batch - use it here to fetch all distinct
    // reference keys for an execution in one round trip instead of N getDocument calls.
    // Fallback (current): sequential calls, mirroring the rate-limit mitigation patterns
    // (batch sizes, delays) already built for the MYOB sync services.
    const out: Record<string, Record<string, unknown> | null> = {};
    for (const key of keys) {
      out[key] = await this.getDocument(refType, key);
    }
    return out;
  }
}
