// web/components/RuleForm.tsx
//
// "Advanced" editor - full manual control (raw JSON Logic gate, exact comparator
// list) for cases the sentence editor doesn't cover yet. When called from the
// canvas (itemTree/scopeLabel provided), resolver fields still use the same
// field picker as the sentence editor - "advanced" means more raw control over
// severity/gate/comparator, not "type paths from memory" for basic fields.
// When called standalone (no itemTree - see /rules/[ruleId]/page.tsx), falls
// back to the original raw path/refType/refKey text inputs, since that page
// doesn't have a specific scope's sample item to browse.

import React, { useState } from 'react';
import { Rule, Comparator, Severity, Resolver } from '../lib/types';
import { ResolverEditor } from './ResolverEditor';
import { ResolverSentencePicker } from './ResolverSentencePicker';
import { FieldNode } from '../lib/fieldTree';

const COMPARATORS: Comparator[] = [
  'equals',
  'notEquals',
  'lte',
  'gte',
  'lt',
  'gt',
  'withinTolerancePct',
  'withinToleranceAbs',
  'inSet',
  'exists',
  'notExists',
];

export function RuleForm({
  initial,
  onSave,
  itemTree,
  scopeLabel,
}: {
  initial: Rule;
  onSave: (rule: Rule) => Promise<void>;
  /** When provided, resolver fields use the field picker instead of raw path inputs. */
  itemTree?: FieldNode;
  /** When provided (alongside itemTree), Scope is shown read-only instead of a free-text input -
   * scope assignment is managed on the canvas via edges, not retyped here. */
  scopeLabel?: string;
}) {
  const [rule, setRule] = useState<Rule>(initial);
  const [saving, setSaving] = useState(false);

  const isValidation = rule.kind === 'validation';
  const usePicker = !!itemTree;

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(rule);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Rule ID</label>
          <input
            className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
            value={rule.ruleId}
            onChange={(e) => setRule({ ...rule, ruleId: e.target.value })}
          />
        </div>
        <div>
          <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Scope</label>
          {usePicker ? (
            <div className="rounded border border-outline-variant bg-surface-container-low px-2 py-1.5 font-body-sm text-body-sm text-on-surface-variant">
              {scopeLabel || rule.scopeId || 'Not attached to a group yet'}
            </div>
          ) : (
            <input
              className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
              placeholder="order / lineItem / shipment / ..."
              value={rule.scopeId}
              onChange={(e) => setRule({ ...rule, scopeId: e.target.value })}
            />
          )}
        </div>
      </div>

      <div>
        <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Kind</label>
        <div className="flex gap-3 mt-1">
          {(['validation', 'derivation'] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface">
              <input
                type="radio"
                checked={rule.kind === k}
                onChange={() => setRule({ ...rule, kind: k })}
              />
              {k}
            </label>
          ))}
        </div>
      </div>

      {rule.kind === 'derivation' && (
        <>
          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Resolve</label>
            {usePicker ? (
              <ResolverSentencePicker
                itemTree={itemTree!}
                value={rule.resolve ?? { source: 'payload', path: '' }}
                allowStatic={false}
                onChange={(resolve) => setRule({ ...rule, resolve: resolve as Resolver })}
              />
            ) : (
              <ResolverEditor
                label="Resolve"
                value={rule.resolve ?? { source: 'payload' }}
                onChange={(resolve) => setRule({ ...rule, resolve })}
              />
            )}
          </div>
          <div>
            <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Writes to (context key)</label>
            <input
              className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
              placeholder="e.g. documentType"
              value={rule.writesTo ?? ''}
              onChange={(e) => setRule({ ...rule, writesTo: e.target.value })}
            />
          </div>
        </>
      )}

      {isValidation && (
        <>
          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Left (actual value)</label>
            {usePicker ? (
              <ResolverSentencePicker
                itemTree={itemTree!}
                value={rule.evaluate?.left ?? { source: 'payload', path: '' }}
                allowStatic={false}
                onChange={(left) =>
                  setRule({
                    ...rule,
                    evaluate: { comparator: rule.evaluate?.comparator ?? 'equals', ...rule.evaluate, left: left as Resolver },
                  })
                }
              />
            ) : (
              <ResolverEditor
                label="Left (actual value)"
                value={rule.evaluate?.left ?? { source: 'payload' }}
                onChange={(left) =>
                  setRule({
                    ...rule,
                    evaluate: { comparator: rule.evaluate?.comparator ?? 'equals', ...rule.evaluate, left },
                  })
                }
              />
            )}
          </div>

          <div>
            <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Comparator</label>
            <select
              className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
              value={rule.evaluate?.comparator ?? 'equals'}
              onChange={(e) =>
                setRule({
                  ...rule,
                  evaluate: {
                    left: rule.evaluate?.left ?? { source: 'payload' },
                    ...rule.evaluate,
                    comparator: e.target.value as Comparator,
                  },
                })
              }
            >
              {COMPARATORS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {(rule.evaluate?.comparator === 'withinTolerancePct' ||
            rule.evaluate?.comparator === 'withinToleranceAbs') && (
            <div>
              <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Tolerance</label>
              <input
                type="number"
                step="0.01"
                className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
                value={rule.evaluate?.tolerance ?? 0}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    evaluate: {
                      left: rule.evaluate?.left ?? { source: 'payload' },
                      comparator: rule.evaluate?.comparator ?? 'withinTolerancePct',
                      ...rule.evaluate,
                      tolerance: Number(e.target.value),
                    },
                  })
                }
              />
            </div>
          )}

          <div>
            <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Right (comparison value)</label>
            {usePicker ? (
              <ResolverSentencePicker
                itemTree={itemTree!}
                value={rule.evaluate?.right ?? { source: 'payload', path: '' }}
                allowStatic
                onChange={(right) =>
                  setRule({
                    ...rule,
                    evaluate: {
                      left: rule.evaluate?.left ?? { source: 'payload' },
                      comparator: rule.evaluate?.comparator ?? 'equals',
                      ...rule.evaluate,
                      right,
                    },
                  })
                }
              />
            ) : (
              <ResolverEditor
                label="Right (comparison value)"
                value={
                  rule.evaluate?.right && 'source' in rule.evaluate.right
                    ? (rule.evaluate.right as Resolver)
                    : { source: 'payload' }
                }
                onChange={(right) =>
                  setRule({
                    ...rule,
                    evaluate: {
                      left: rule.evaluate?.left ?? { source: 'payload' },
                      comparator: rule.evaluate?.comparator ?? 'equals',
                      ...rule.evaluate,
                      right,
                    },
                  })
                }
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Severity</label>
              <select
                className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
                value={rule.severity ?? 'block'}
                onChange={(e) => setRule({ ...rule, severity: e.target.value as Severity })}
              >
                <option value="block">Block</option>
                <option value="warn">Warn</option>
              </select>
            </div>
            <div>
              <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Message</label>
              <input
                className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
                placeholder="Human-readable violation message"
                value={rule.message ?? ''}
                onChange={(e) => setRule({ ...rule, message: e.target.value })}
              />
            </div>
          </div>
        </>
      )}

      <div>
        <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">
          Applies when (JSON Logic, optional gate)
        </label>
        <textarea
          className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
          rows={3}
          placeholder='{ "==": [{ "var": "documentType" }, "PO Invoice"] }'
          value={rule.appliesWhen ? JSON.stringify(rule.appliesWhen) : ''}
          onChange={(e) => {
            try {
              setRule({ ...rule, appliesWhen: JSON.parse(e.target.value) });
            } catch {
              // ignore invalid JSON while typing
            }
          }}
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-primary px-4 py-2 font-body-sm text-body-sm font-medium text-on-primary disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save rule'}
      </button>
    </div>
  );
}
