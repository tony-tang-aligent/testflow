// infra/lambda/shared/erpAdapter.ts
//
// The rule engine only ever talks to this interface - it never knows which ERP
// a tenant actually runs. Add a new ERP by implementing this interface once;
// no changes needed anywhere else in the engine.

export interface ErpAdapter {
  /**
   * Fetch a whole reference document (e.g. a Purchase Order, Goods Receipt, Vendor Master record)
   * identified by a business key (PO number, vendor id, etc).
   * Returns null if not found - callers treat that as "reference does not exist".
   */
  getDocument(refType: string, key: string): Promise<Record<string, unknown> | null>;

  /**
   * Fetch a single line within a reference document (e.g. one PO line by SKU).
   * Returns null if the parent document or the specific line isn't found.
   */
  getLineItem(
    refType: string,
    key: string,
    lineKey: string,
  ): Promise<Record<string, unknown> | null>;

  /**
   * Historical/uniqueness query: has anything matching these key fields been seen before?
   * `entity` is the logical record type (e.g. 'invoice', 'order'); `keyValues` is the actual
   * field->value map extracted from the current payload for the configured keyFields.
   */
  queryHistorical(entity: string, keyValues: Record<string, unknown>): Promise<boolean>;

  /**
   * Batch variant of getDocument, used by the pre-fetch step to dedupe reference lookups
   * across all line items in a single execution before the Map state runs.
   * Default implementation may just call getDocument in a loop - adapters with a real
   * batch API (e.g. OData $batch) should override this for efficiency / rate-limit safety.
   */
  getDocumentsBatch(
    refType: string,
    keys: string[],
  ): Promise<Record<string, Record<string, unknown> | null>>;
}

// TODO(RDS): once per-tenant ERP credentials move behind the identity/org control plane,
// this factory should resolve the adapter + its credentials via the API layer's tenant
// lookup (RDS company record -> adapterId -> Secrets Manager secret arn) rather than a
// flat adapterId string read straight off FlowDefinition. For now, FlowDefinition.adapterId
// is the only signal, and credentials are assumed to be resolvable from Secrets Manager
// using a naming convention (see adapters/myobAdapter.ts).
export type AdapterFactory = (tenantId: string) => Promise<ErpAdapter>;
