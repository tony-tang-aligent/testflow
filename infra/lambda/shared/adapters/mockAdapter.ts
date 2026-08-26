// infra/lambda/shared/adapters/mockAdapter.ts
//
// In-memory fake ERP, useful for local dev and for unit-testing the rule engine
// without a live MYOB/NetSuite connection. Swap for a real adapter via
// FlowDefinition.adapterId in any real deployment.

import { ErpAdapter } from '../erpAdapter';

const FAKE_PURCHASE_ORDERS: Record<string, Record<string, unknown>> = {
  'PO-1001': {
    poNumber: 'PO-1001',
    status: 'open',
    currency: 'AUD',
    remainingToInvoice: 500.0,
    lines: [
      { sku: 'SKU-A', price: 10.0, quantity: 20 },
      { sku: 'SKU-B', price: 25.5, quantity: 5 },
    ],
  },
};

export class MockAdapter implements ErpAdapter {
  async getDocument(refType: string, key: string) {
    if (refType === 'purchaseOrder') return FAKE_PURCHASE_ORDERS[key] ?? null;
    return null;
  }

  async getLineItem(refType: string, key: string, lineKey: string) {
    const doc = await this.getDocument(refType, key);
    if (!doc) return null;
    const lines = (doc.lines as Array<Record<string, unknown>>) ?? [];
    return lines.find((l) => l.sku === lineKey) ?? null;
  }

  async queryHistorical(_entity: string, _keyValues: Record<string, unknown>) {
    // Always "not seen before" in the mock - override per test case as needed.
    return false;
  }

  async getDocumentsBatch(refType: string, keys: string[]) {
    const out: Record<string, Record<string, unknown> | null> = {};
    for (const key of keys) {
      out[key] = await this.getDocument(refType, key);
    }
    return out;
  }
}
