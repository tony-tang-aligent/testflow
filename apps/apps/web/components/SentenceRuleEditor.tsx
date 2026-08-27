// web/components/SentenceRuleEditor.tsx
//
// Primary rule-authoring UI. A rule reads as a sentence built from pickers:
// "Get [field] ... is at most ... [PO price, looked up by PO number]"
// "Only run this if [Document type] is [PO Invoice]"
// Falls back to the raw RuleForm (JSON Logic + typed paths) via "Advanced" for
// cases this sentence builder doesn't cover yet (historical/uniqueness resolvers,
// hand-written appliesWhen).

import React, { useState } from 'react';
import { FieldNode } from '../lib/fieldTree';
import { Comparator, Rule, Severity } from '../lib/types';
import { ResolverSentencePicker } from './ResolverSentencePicker';
import { RuleForm } from './RuleForm';

const COMPARATOR_LABELS: Record<Comparator, string> = {
  equals: 'is exactly',
  notEquals: 'is not',
  lte: 'is at most',
  gte: 'is at least',
  lt: 'is less than',
  gt: 'is more than',
  withinTolerancePct: 'is within (%) of',
  withinToleranceAbs: 'is within (amount) of',
  inSet: 'is one of',
  exists: 'has a value',
  notExists: 'is empty',
};

const NO_RIGHT_VALUE: Comparator[] = ['exists', 'notExists'];
const NEEDS_TOLERANCE: Comparator[] = ['withinTolerancePct', 'withinToleranceAbs'];

function simpleGateFromRule(rule: Rule): { key: string; comparator: 'equals' | 'notEquals'; value: string } | null {
  const gate = rule.appliesWhen as Record<string, unknown> | undefined;
  if (!gate) return null;
  for (const [op, comparator] of [['==', 'equals'], ['!=', 'notEquals']] as const) {
    const args = gate[op] as unknown[] | undefined;
    if (Array.isArray(args) && args.length === 2) {
      const varArg = args[0] as { var?: string } | undefined;
      if (varArg?.var) return { key: varArg.var, comparator, value: String(args[1]) };
    }
  }
  return null;
}

export function SentenceRuleEditor({
  initial,
  itemTree,
  availableContextKeys,
  onSave,
}: {
  initial: Rule;
  itemTree: FieldNode;
  /** writesTo keys from other derivation rules already in this scope, for the gate builder */
  availableContextKeys: string[];
  onSave: (rule: Rule) => Promise<void>;
}) {
  const [rule, setRule] = useState<Rule>(initial);
  const [advanced, setAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gateEnabled, setGateEnabled] = useState(!!initial.appliesWhen);
  const [gate, setGate] = useState(
    simpleGateFromRule(initial) ?? { key: availableContextKeys[0] ?? '', comparator: 'equals' as const, value: '' },
  );

  if (advanced) {
    return (
      <div className="space-y-3">
        <button onClick={() => setAdvanced(false)} className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
          ← Back to simple editor
        </button>
        <RuleForm initial={rule} onSave={onSave} itemTree={itemTree} scopeLabel={itemTree.label} />
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const finalRule: Rule = { ...rule };
      if (gateEnabled && gate.key) {
        finalRule.appliesWhen = { [gate.comparator === 'equals' ? '==' : '!=']: [{ var: gate.key }, gate.value] };
      } else {
        finalRule.appliesWhen = undefined;
      }
      await onSave(finalRule);
    } finally {
      setSaving(false);
    }
  }

  const comparator = rule.evaluate?.comparator ?? 'equals';
  const showRight = !NO_RIGHT_VALUE.includes(comparator);
  const showTolerance = NEEDS_TOLERANCE.includes(comparator);

  return (
    <div className="space-y-5">
      {/* Kind toggle */}
      <div className="inline-flex rounded-md border border-outline-variant p-0.5 font-body-sm text-body-sm">
        {(
          [
            { id: 'validation', label: 'Compare two values' },
            { id: 'derivation', label: 'Save a value for later' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            onClick={() => setRule({ ...rule, kind: opt.id })}
            className={`rounded px-2.5 py-1 font-medium ${
              rule.kind === opt.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-variant'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {rule.kind === 'derivation' ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Get</label>
            <ResolverSentencePicker
              itemTree={itemTree}
              value={rule.resolve ?? { source: 'payload', path: '' }}
              allowStatic={false}
              onChange={(resolve) => setRule({ ...rule, resolve: resolve as NonNullable<Rule['resolve']> })}
            />
          </div>
          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Remember this as</label>
            <input
              className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
              placeholder="e.g. documentType"
              value={rule.writesTo ?? ''}
              onChange={(e) => setRule({ ...rule, writesTo: e.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Get</label>
            <ResolverSentencePicker
              itemTree={itemTree}
              value={rule.evaluate?.left ?? { source: 'payload', path: '' }}
              allowStatic={false}
              onChange={(left) =>
                setRule({
                  ...rule,
                  evaluate: {
                    comparator,
                    ...rule.evaluate,
                    left: left as NonNullable<Rule['evaluate']>['left'],
                  },
                })
              }
            />
          </div>

          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Compare</label>
            <select
              className="rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
              value={comparator}
              onChange={(e) =>
                setRule({
                  ...rule,
                  evaluate: {
                    left: rule.evaluate?.left ?? { source: 'payload', path: '' },
                    ...rule.evaluate,
                    comparator: e.target.value as Comparator,
                  },
                })
              }
            >
              {(Object.keys(COMPARATOR_LABELS) as Comparator[]).map((c) => (
                <option key={c} value={c}>
                  {COMPARATOR_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          {showTolerance && (
            <div>
              <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">
                {comparator === 'withinTolerancePct' ? 'Tolerance (%)' : 'Tolerance (amount)'}
              </label>
              <input
                type="number"
                step="0.01"
                className="w-32 rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
                value={rule.evaluate?.tolerance ?? 0}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    evaluate: {
                      left: rule.evaluate?.left ?? { source: 'payload', path: '' },
                      comparator,
                      ...rule.evaluate,
                      tolerance: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          )}

          {showRight && (
            <div>
              <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">To</label>
              <ResolverSentencePicker
                itemTree={itemTree}
                value={rule.evaluate?.right ?? { source: 'payload', path: '' }}
                allowStatic
                onChange={(right) =>
                  setRule({
                    ...rule,
                    evaluate: {
                      left: rule.evaluate?.left ?? { source: 'payload', path: '' },
                      comparator,
                      ...rule.evaluate,
                      right: right as NonNullable<Rule['evaluate']>['right'],
                    },
                  })
                }
              />
            </div>
          )}

          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">If this fails</label>
            <div className="inline-flex rounded-md border border-outline-variant p-0.5 font-body-sm text-body-sm">
              {(
                [
                  { id: 'block' as Severity, label: 'Stop the order' },
                  { id: 'warn' as Severity, label: 'Just flag it' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setRule({ ...rule, severity: opt.id })}
                  className={`rounded px-2.5 py-1 font-medium ${
                    (rule.severity ?? 'block') === opt.id ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-variant'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Show this message on the report</label>
            <input
              className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
              placeholder="e.g. Line price doesn't match the PO"
              value={rule.message ?? ''}
              onChange={(e) => setRule({ ...rule, message: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Gate builder - "only run this if" */}
      <div className="border-t border-outline-variant pt-3">
        <label className="mb-1 flex items-center gap-2 font-label-caps text-label-caps uppercase text-on-surface-variant">
          <input type="checkbox" checked={gateEnabled} onChange={(e) => setGateEnabled(e.target.checked)} />
          Only run this if…
        </label>
        {gateEnabled &&
          (availableContextKeys.length === 0 ? (
            <p className="font-body-sm text-body-sm text-tertiary">
              No saved values yet in this group — add a "Save a value" step first, then come back to gate on it.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <select
                className="rounded border border-outline-variant bg-background px-2 py-1 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
                value={gate.key}
                onChange={(e) => setGate({ ...gate, key: e.target.value })}
              >
                {availableContextKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-outline-variant bg-background px-2 py-1 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
                value={gate.comparator}
                onChange={(e) => setGate({ ...gate, comparator: e.target.value as 'equals' | 'notEquals' })}
              >
                <option value="equals">is</option>
                <option value="notEquals">is not</option>
              </select>
              <input
                className="flex-1 rounded border border-outline-variant bg-background px-2 py-1 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
                placeholder="value"
                value={gate.value}
                onChange={(e) => setGate({ ...gate, value: e.target.value })}
              />
            </div>
          ))}
      </div>

      <div className="flex items-center justify-between border-t border-outline-variant pt-3">
        <button onClick={() => setAdvanced(true)} className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
          Advanced (JSON) editor
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-primary px-4 py-2 font-body-sm text-body-sm font-medium text-on-primary disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </div>
  );
}
