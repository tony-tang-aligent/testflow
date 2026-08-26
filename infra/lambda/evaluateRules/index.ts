// infra/lambda/evaluateRules/index.ts
//
// Runs once per Map/Distributed Map iteration (a batch of items within one scope,
// e.g. 10 line items at a time - see ItemBatcher config in the CDK stack).
// Two-phase per item: run derivation rules first (writing into a scope-local
// context object), then run validation rules, gated by `appliesWhen` reading
// that same context. This is how "only check PO-match rules when documentType
// resolved to PO Invoice" works without any change to the state machine shape.

import { getAdapter } from '../shared/adapterRegistry';
import { getAiAdapter } from '../shared/aiAdapterRegistry';
import { AiAdapter } from '../shared/aiAdapter';
import { evaluateRule, appliesWhenMatches, ResolveContext } from '../shared/ruleEvaluator';
import { Rule, Violation } from '../shared/types';

export interface EvaluateRulesInput {
  // This is Step Functions' ItemBatcher shape, not ours - a batch's item
  // processor input is always exactly { Items, BatchInput }, regardless of
  // custom field names requested elsewhere. batchInput (see CDK stack) is what
  // populates BatchInput; Items is the batch of scope items automatically.
  Items: Array<Record<string, unknown>>;
  BatchInput: {
    tenantId: string;
    adapterId: string;
    scopeId: string;
    derivationRules: Rule[];
    validationRules: Rule[];
    prefetched: Record<string, Record<string, unknown> | null>;
  };
}

export interface EvaluateRulesOutput {
  scopeId: string;
  violations: Violation[];
  rulesEvaluated: Array<{ ruleId: string; version: number }>;
}

/** Defers BYOK credential resolution (which throws if a tenant hasn't
 * configured an AI key) until a rule actually calls .complete() - most
 * executions never use an 'ai' resolver at all and shouldn't pay the
 * Secrets Manager round-trip, let alone fail, just because one exists. */
function createLazyAiAdapter(tenantId: string): AiAdapter {
  let cached: AiAdapter | null = null;
  return {
    async complete(prompt, options) {
      if (!cached) cached = await getAiAdapter(tenantId);
      return cached.complete(prompt, options);
    },
  };
}

export const handler = async (evalInput: EvaluateRulesInput): Promise<EvaluateRulesOutput> => {
  const items = evalInput.Items;
  const { tenantId, adapterId, scopeId, derivationRules, validationRules, prefetched } = evalInput.BatchInput;
  const adapter = await getAdapter(adapterId, tenantId);
  const aiAdapter = createLazyAiAdapter(tenantId);

  const violations: Violation[] = [];
  const rulesEvaluated: Array<{ ruleId: string; version: number }> = [];

  for (const item of items) {
    const scopeContext: Record<string, unknown> = {};
    const ctx: ResolveContext = { item, scopeContext, adapter, aiAdapter, tenantId, prefetched };

    // Phase 1: derivations - populate scopeContext with facts other rules can gate on.
    for (const rule of derivationRules) {
      const { derivedValue } = await evaluateRule(rule, ctx);
      if (rule.writesTo) scopeContext[rule.writesTo] = derivedValue;
      rulesEvaluated.push({ ruleId: rule.ruleId, version: rule.version });
    }

    // Phase 2: validations - gated by appliesWhen against the context just built.
    for (const rule of validationRules) {
      if (!appliesWhenMatches(rule.appliesWhen, scopeContext)) continue;
      const { violation } = await evaluateRule(rule, ctx);
      rulesEvaluated.push({ ruleId: rule.ruleId, version: rule.version });
      if (violation) {
        // Read the identifier resolveScopes already assigned (id/sku, or a
        // stable '#N' index fallback if the item has neither) - not recomputed
        // here, since recomputing id-or-sku independently is exactly what
        // collapsed every id/sku-less item to the same empty itemId before.
        const itemId =
          scopeId === 'order' ? undefined : String((item as Record<string, unknown>).__validatorItemId ?? '');
        violations.push({ ...violation, itemId });
      }
    }
  }

  return { scopeId, violations, rulesEvaluated };
};
