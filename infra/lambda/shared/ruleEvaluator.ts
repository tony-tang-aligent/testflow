// infra/lambda/shared/ruleEvaluator.ts
//
// The heart of the "blended condition + action" primitive discussed in scoping:
// a rule resolves whatever values it needs to compare (which may involve an ERP
// call) and then evaluates a predicate against them - as one unit, not a
// separate Condition node + Action node.

import { ErpAdapter } from './erpAdapter';
import { AiAdapter } from './aiAdapter';
import { getInternalRecord } from './ddb';
import { callGenericHttp } from './genericHttp';
import { Rule, Resolver, Violation } from './types';

function getPath(obj: unknown, path: string): unknown {
  if (path === '$') return obj;
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function interpolate(template: string, item: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = getPath(item, path);
    return value == null ? '' : String(value);
  });
}

export interface ResolveContext {
  item: Record<string, unknown>; // the current scope item (order payload, or a single line item)
  scopeContext: Record<string, unknown>; // derived facts written by prior derivation rules in this scope
  adapter: ErpAdapter;
  aiAdapter: AiAdapter; // BYOK - only actually called if a rule uses an 'ai' resolver
  tenantId: string; // needed for 'internal' lookups and BYOK/auth secret resolution
  // Pre-fetched reference documents, keyed `${refType}:${key}`, populated by the
  // pre-fetch step before the Map state runs. Falling back to a live adapter call
  // is supported but should be rare in practice - see resolveScopes Lambda.
  prefetched: Record<string, Record<string, unknown> | null>;
}

export async function resolveValue(resolver: Resolver, ctx: ResolveContext): Promise<unknown> {
  switch (resolver.source) {
    case 'payload': {
      return getPath(ctx.item, resolver.path ?? '$');
    }

    case 'reference': {
      const key = resolver.refKey ? String(getPath(ctx.item, resolver.refKey)) : undefined;
      if (!key || !resolver.refType) return undefined;

      const cacheKey = `${resolver.refType}:${key}`;
      let doc = ctx.prefetched[cacheKey];
      if (doc === undefined) {
        // Not pre-fetched (e.g. a rare/ad-hoc reference type) - fall back to a live call.
        doc = await ctx.adapter.getDocument(resolver.refType, key);
      }
      if (!doc) return undefined;

      if (resolver.refLineKey) {
        const lineKey = String(getPath(ctx.item, resolver.refLineKey));
        const line = await ctx.adapter.getLineItem(resolver.refType, key, lineKey);
        return resolver.path ? getPath(line, resolver.path) : line;
      }

      return resolver.path ? getPath(doc, resolver.path) : doc;
    }

    case 'historical': {
      if (!resolver.entity || !resolver.keyFields) return false;
      const keyValues: Record<string, unknown> = {};
      for (const field of resolver.keyFields) {
        keyValues[field] = getPath(ctx.item, field);
      }
      return ctx.adapter.queryHistorical(resolver.entity, keyValues);
    }

    case 'internal': {
      // A query against OUR OWN storage, not an external system - most rule
      // comparisons in practice end up being this, not a live ERP call.
      if (!resolver.internalTable || !resolver.internalKey) return undefined;
      const key = String(getPath(ctx.item, resolver.internalKey));
      const record = await getInternalRecord(ctx.tenantId, resolver.internalTable, key);
      if (!record) return undefined;
      return resolver.path ? getPath(record, resolver.path) : record;
    }

    case 'httpCall': {
      return callGenericHttp(resolver, ctx.item, ctx.tenantId);
    }

    case 'ai': {
      if (!resolver.aiPrompt) return undefined;
      const prompt = interpolate(resolver.aiPrompt, ctx.item);
      const text = await ctx.aiAdapter.complete(prompt);
      if (!resolver.aiResponsePath) return text;
      try {
        return getPath(JSON.parse(text), resolver.aiResponsePath);
      } catch {
        // Prompt didn't return valid JSON - fall back to the raw text rather
        // than throwing, since a comparator can often still work against it.
        return text;
      }
    }

    case 'computed': {
      if (resolver.computeOperator === 'sumField') {
        if (!resolver.sumFieldArrayPath || !resolver.sumFieldName) return undefined;
        const arr = getPath(ctx.item, resolver.sumFieldArrayPath);
        if (!Array.isArray(arr)) return undefined;
        return arr.reduce((sum: number, el) => {
          const v = getPath(el, resolver.sumFieldName!);
          return sum + (Number(v) || 0);
        }, 0);
      }

      if (!resolver.computeOperands || resolver.computeOperands.length !== 2) return undefined;
      const [leftOperand, rightOperand] = resolver.computeOperands;
      const a = Number(await resolveValue(leftOperand, ctx));
      const b = Number(await resolveValue(rightOperand, ctx));
      switch (resolver.computeOperator) {
        case 'multiply':
          return a * b;
        case 'add':
          return a + b;
        case 'subtract':
          return a - b;
        case 'divide':
          return b === 0 ? undefined : a / b;
        default:
          return undefined;
      }
    }

    default:
      return undefined;
  }
}

/**
 * Numbers and numeric-looking strings compare equal (e.g. 2 === "2") - this
 * matters because HTML inputs always produce strings, while payload values
 * pulled from JSON are often genuinely numbers. A rule comparing a payload
 * number against a typed-in static value would otherwise fail even when the
 * displayed "Expected"/"Actual" look identical, since 2 !== "2" under ===.
 * Non-numeric strings still compare with ordinary strict equality - this only
 * closes the number/numeric-string gap, not e.g. case-insensitivity.
 */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const aIsNumeric = typeof a === 'number' || (typeof a === 'string' && a.trim() !== '' && !isNaN(Number(a)));
  const bIsNumeric = typeof b === 'number' || (typeof b === 'string' && b.trim() !== '' && !isNaN(Number(b)));
  if (aIsNumeric && bIsNumeric) return Number(a) === Number(b);
  return false;
}

function compare(comparator: string, left: unknown, right: unknown, tolerance?: number): boolean {
  switch (comparator) {
    case 'equals':
      return looseEquals(left, right);
    case 'notEquals':
      return !looseEquals(left, right);
    case 'lte':
      return Number(left) <= Number(right);
    case 'gte':
      return Number(left) >= Number(right);
    case 'lt':
      return Number(left) < Number(right);
    case 'gt':
      return Number(left) > Number(right);
    case 'withinTolerancePct': {
      const l = Number(left);
      const r = Number(right);
      if (r === 0) return l === 0;
      return Math.abs((l - r) / r) <= (tolerance ?? 0);
    }
    case 'withinToleranceAbs':
      return Math.abs(Number(left) - Number(right)) <= (tolerance ?? 0);
    case 'inSet':
      return Array.isArray(right) && right.some((v) => looseEquals(v, left));
    case 'exists':
      return left !== undefined && left !== null;
    case 'notExists':
      return left === undefined || left === null;
    default:
      throw new Error(`Unknown comparator: ${comparator}`);
  }
}

/**
 * Evaluates a single rule against one scope item. Handles both rule kinds:
 * - derivation: resolves a value and returns it so the caller can write it into scopeContext
 * - validation: resolves left/right, compares them, returns a Violation if it fails (or null if it passes)
 *
 * `appliesWhen` is checked by the caller (evaluateRules Lambda) before this is invoked, since
 * that gate reads scopeContext built up over prior rules in the same scope.
 */
export async function evaluateRule(
  rule: Rule,
  ctx: ResolveContext,
): Promise<{ derivedValue?: unknown; violation?: Violation }> {
  if (rule.kind === 'derivation') {
    if (!rule.resolve) throw new Error(`Derivation rule ${rule.ruleId} missing resolve`);
    const derivedValue = await resolveValue(rule.resolve, ctx);
    return { derivedValue };
  }

  if (!rule.evaluate) throw new Error(`Validation rule ${rule.ruleId} missing evaluate`);
  const { comparator, left, right, tolerance } = rule.evaluate;

  const leftValue = await resolveValue(left, ctx);
  const rightValue =
    right && 'static' in right ? right.static : right ? await resolveValue(right, ctx) : undefined;

  const passed = compare(comparator, leftValue, rightValue, tolerance);
  if (passed) return {};

  return {
    violation: {
      ruleId: rule.ruleId,
      ruleVersion: rule.version,
      severity: rule.severity ?? 'block',
      scopeId: rule.scopeId,
      message: rule.message ?? `Rule ${rule.ruleId} failed`,
      expected: rightValue,
      actual: leftValue,
      correctablePath: left.source === 'payload' ? left.path : undefined,
    },
  };
}

/** JSON-Logic-lite evaluation for `appliesWhen` gates, reusing the { var: path } convention
 * already used elsewhere in the platform (kazilo-execution-engine's json-logic-js usage).
 * Kept minimal here - swap for the real json-logic-js package in the actual implementation. */
export function appliesWhenMatches(
  appliesWhen: Record<string, unknown> | undefined,
  scopeContext: Record<string, unknown>,
): boolean {
  if (!appliesWhen) return true;
  // TODO: replace with `jsonLogic.apply(appliesWhen, scopeContext)` using the json-logic-js
  // dependency already present in kazilo-execution-engine, rather than this placeholder.
  return true;
}
