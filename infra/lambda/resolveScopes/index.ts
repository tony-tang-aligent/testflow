// infra/lambda/resolveScopes/index.ts
//
// Second state. Two jobs:
// 1. Normalize the order payload into a flat list of scope items per active scope
//    (order scope = the whole payload as one item; lineItem scope = payload.lineItems; etc).
// 2. Pre-fetch every distinct reference (PO, vendor, material...) that any rule in any
//    scope will need, once, before the Map state runs - this is what avoids N duplicate
//    ERP calls when the same SKU/PO appears across multiple line items, and keeps ERP
//    calls within a predictable, rate-limit-friendly batch rather than firing per-item.

import { getAdapter } from '../shared/adapterRegistry';
import { LoadFlowDefinitionOutput } from '../loadFlowDefinition';
import { Rule } from '../shared/types';

function getPath(obj: unknown, path: string): unknown {
  if (path === '$') return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function collectReferenceKeys(items: Array<Record<string, unknown>>, rules: Rule[]) {
  // Map refType -> set of distinct keys needed across all items and all rules in this scope.
  const byRefType = new Map<string, Set<string>>();
  for (const rule of rules) {
    const resolver = rule.kind === 'derivation' ? rule.resolve : rule.evaluate?.left;
    const rightResolver =
      rule.kind === 'validation' && rule.evaluate?.right && 'source' in (rule.evaluate.right as object)
        ? (rule.evaluate.right as { source: string })
        : undefined;

    for (const r of [resolver, rightResolver]) {
      if (!r || (r as { source?: string }).source !== 'reference') continue;
      const typed = r as { refType?: string; refKey?: string };
      if (!typed.refType || !typed.refKey) continue;
      const set = byRefType.get(typed.refType) ?? new Set<string>();
      for (const item of items) {
        const key = getPath(item, typed.refKey);
        if (key != null) set.add(String(key));
      }
      byRefType.set(typed.refType, set);
    }
  }
  return byRefType;
}

export const handler = async (loadOutput: LoadFlowDefinitionOutput) => {
  const { input, flowDefinition, scopes, dismissedWarnings } = loadOutput;
  const adapter = await getAdapter(flowDefinition.adapterId, input.tenantId);

  const itemScopes = [];
  const prefetched: Record<string, Record<string, unknown> | null> = {};

  for (const scope of scopes) {
    const rawRawItems =
      scope.itemsPath === '$'
        ? [input.payload]
        : ((getPath(input.payload, scope.itemsPath) as Array<Record<string, unknown>>) ?? []);

    // Give every item a stable identifier for this execution, even when it has
    // neither an id nor a sku field - without this, every item lacking both
    // collapses to the same empty itemId on its violations, making them
    // indistinguishable in the correction UI and (worse) causing a submitted
    // correction to be misapplied to the payload root instead of the actual
    // item. This spreads a NEW object per item (doesn't mutate input.payload
    // itself), so the clean, unpolluted payload is still what gets persisted
    // as ValidationResult.payload downstream.
    const rawItems =
      scope.itemsPath === '$'
        ? rawRawItems // order scope - single synthetic item, itemId stays undefined for it
        : rawRawItems.map((item, idx) => ({
            ...item,
            __validatorItemId: String(
              (item as Record<string, unknown>).id ?? (item as Record<string, unknown>).sku ?? `#${idx}`,
            ),
          }));

    const allRules = [...scope.derivationRules, ...scope.validationRules];
    const refKeysByType = collectReferenceKeys(rawItems, allRules);

    for (const [refType, keys] of refKeysByType.entries()) {
      const docs = await adapter.getDocumentsBatch(refType, [...keys]);
      for (const [key, doc] of Object.entries(docs)) {
        prefetched[`${refType}:${key}`] = doc;
      }
    }

    itemScopes.push({
      scopeId: scope.scopeId,
      items: rawItems,
      derivationRules: scope.derivationRules,
      validationRules: scope.validationRules,
    });
  }

  return {
    input,
    flowDefinition,
    // Unchanged, original itemsPath-shaped config - NOT the items-populated
    // version. This has to survive intact: on a correction loop, applyCorrection
    // passes this straight through back into resolveScopes again, which needs
    // to re-extract items from the CORRECTED payload using itemsPath - reusing
    // stale pre-correction items (or a shape with no itemsPath at all) is
    // exactly the bug that crashed here (`scope.itemsPath` was undefined
    // because a previous version of this file overwrote `scopes` with the
    // items-shaped version below, under the same field name).
    scopes,
    // The items-populated shape the Map/evaluateRules actually needs - a
    // separate field, specifically so it never collides with `scopes` above.
    itemScopes,
    prefetched,
    // Passed straight through unmodified - resolveScopes itself never touches
    // dismissals, but since this Lambda's return value replaces the whole
    // state (outputPath: '$.Payload' in the CDK stack), anything not
    // explicitly returned here would be silently dropped before Aggregate
    // (and, on a loop, before ApplyCorrection) ever sees it.
    dismissedWarnings,
  };
};
