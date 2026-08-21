// web/app/flows/[flowId]/executions/[executionId]/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../../lib/api';
import { ExecutionDetail, DismissedWarning, FlowDefinition, Violation } from '../../../../../lib/types';
import { getValueAtPath, setValueAtPath } from '../../../../../lib/fieldTree';
import { StatusBadge } from '../../../../../components/StatusBadge';

/** Applies a set of per-field corrections onto a fresh copy of the payload,
 * locating each target via the violation's scope (which array, via
 * FlowDefinition.scopes[].itemsPath) and itemId (matched by id/sku, the same
 * way evaluateRules derived itemId in the first place - see evaluateRules/index.ts). */
function applyFieldCorrections(
  payload: Record<string, unknown>,
  scopes: FlowDefinition['scopes'],
  corrections: Array<{ scopeId: string; itemId?: string; path: string; value: unknown }>,
): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  for (const c of corrections) {
    const scope = scopes.find((s) => s.scopeId === c.scopeId);
    if (!scope || scope.itemsPath === '$' || !c.itemId) {
      setValueAtPath(clone, c.path, c.value);
      continue;
    }
    const arr = getValueAtPath(clone, scope.itemsPath);
    if (!Array.isArray(arr)) continue;
    const items = arr as Record<string, unknown>[];
    // itemId is either the item's own id/sku, or a '#N' index fallback the
    // backend assigns when an item has neither (see resolveScopes/index.ts) -
    // matching '#N' by position keeps this correct for items with no natural
    // identifier, instead of every such item colliding on an empty string.
    const item = c.itemId.startsWith('#')
      ? items[Number(c.itemId.slice(1))]
      : items.find((it) => String(it.id ?? it.sku ?? '') === c.itemId);
    if (item) setValueAtPath(item, c.path, c.value);
  }
  return clone;
}

/** Coerces a typed-in string back to the actual value's original type where
 * sensible - a plain <input> is always a string, and writing "2" where the
 * payload originally had the number 2 would just reintroduce the exact
 * number-vs-numeric-string bug already fixed elsewhere (see ruleEvaluator.ts's
 * looseEquals). Only numbers get this treatment; strings/booleans pass through as typed. */
function coerceToOriginalType(rawInput: string, originalValue: unknown): unknown {
  if (typeof originalValue === 'number' && rawInput.trim() !== '' && !isNaN(Number(rawInput))) {
    return Number(rawInput);
  }
  return rawInput;
}

function violationKey(v: Violation): string {
  return `${v.ruleId}:${v.itemId ?? ''}`;
}

function CorrectionForm({
  detail,
  scopes,
  onSubmitted,
}: {
  detail: ExecutionDetail;
  scopes: FlowDefinition['scopes'];
  onSubmitted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [payloadText, setPayloadText] = useState(JSON.stringify(detail.payload, null, 2));

  // Per-field quick-correction inputs, keyed the same way as dismissals.
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  // Only warnings can be dismissed - blocking violations can only go away by
  // actually fixing the data and letting re-validation clear them for real.
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const v of detail.violations) {
      if (v.severity === 'warn' && v.dismissed) initial[violationKey(v)] = true;
    }
    return initial;
  });

  function toggleDismiss(v: Violation) {
    setDismissed((d) => ({ ...d, [violationKey(v)]: !d[violationKey(v)] }));
  }

  const activeViolations = detail.violations.filter((v) => !v.dismissed);
  const quickCorrectable = activeViolations.filter((v) => v.severity === 'block' && v.correctablePath);
  const notQuickCorrectable = activeViolations.filter((v) => v.severity === 'block' && !v.correctablePath);

  async function handleSubmit() {
    setError(null);

    let correctedPayload: Record<string, unknown>;
    if (advancedMode) {
      try {
        correctedPayload = JSON.parse(payloadText);
      } catch {
        setError("That's not valid JSON - check for a missing comma or bracket.");
        return;
      }
    } else {
      const corrections = quickCorrectable
        .filter((v) => fieldEdits[violationKey(v)] !== undefined && fieldEdits[violationKey(v)] !== '')
        .map((v) => ({
          scopeId: v.scopeId,
          itemId: v.itemId,
          path: v.correctablePath!,
          value: coerceToOriginalType(fieldEdits[violationKey(v)], v.actual),
        }));
      correctedPayload = applyFieldCorrections(detail.payload, scopes, corrections);
    }

    const dismissedWarnings: DismissedWarning[] = Object.entries(dismissed)
      .filter(([, isDismissed]) => isDismissed)
      .map(([key]) => {
        const [ruleId, itemId] = key.split(':');
        return itemId ? { ruleId, itemId } : { ruleId };
      });

    setSubmitting(true);
    try {
      await api.submitCorrection(detail.flowId, detail.executionId, { correctedPayload, dismissedWarnings });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit correction');
    } finally {
      setSubmitting(false);
    }
  }

  const blockingCount = activeViolations.filter((v) => v.severity === 'block').length;

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-blue-800">
          {blockingCount > 0
            ? `${blockingCount} blocking issue${blockingCount === 1 ? '' : 's'} to fix. Warnings can be dismissed instead.`
            : 'No blocking issues remain - dismiss any warnings you want to acknowledge, or just resubmit as-is.'}
        </p>
        <button
          onClick={() => setAdvancedMode((a) => !a)}
          className="whitespace-nowrap text-xs text-blue-700 underline hover:no-underline"
        >
          {advancedMode ? 'Back to quick corrections' : 'Edit full JSON instead'}
        </button>
      </div>

      {advancedMode ? (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Corrected payload</label>
          <textarea
            className="h-64 w-full rounded border border-gray-300 p-3 font-mono text-xs"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {quickCorrectable.length === 0 && notQuickCorrectable.length === 0 ? (
            <p className="text-sm text-gray-500">No blocking fields to correct.</p>
          ) : (
            quickCorrectable.map((v) => (
              <div key={violationKey(v)} className="rounded border border-gray-200 bg-white p-2.5">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-500">
                  <span className="font-mono">{v.ruleId}</span>
                  <span>·</span>
                  <span className="font-mono">
                    {v.scopeId}
                    {v.itemId ? ` / ${v.itemId}` : ''} → {v.correctablePath}
                  </span>
                </div>
                <p className="mb-1.5 text-sm text-gray-700">{v.message}</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Current: {String(v.actual)}</span>
                  <input
                    className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm font-mono"
                    placeholder={`Corrected value (e.g. ${String(v.expected)})`}
                    value={fieldEdits[violationKey(v)] ?? ''}
                    onChange={(e) => setFieldEdits((f) => ({ ...f, [violationKey(v)]: e.target.value }))}
                  />
                </div>
              </div>
            ))
          )}

          {notQuickCorrectable.length > 0 && (
            <p className="text-xs text-amber-700">
              {notQuickCorrectable.length} issue{notQuickCorrectable.length === 1 ? '' : 's'} came from a
              lookup, not this payload directly - use &quot;Edit full JSON instead&quot; to address{' '}
              {notQuickCorrectable.length === 1 ? 'it' : 'those'}.
            </p>
          )}
        </div>
      )}

      {activeViolations.some((v) => v.severity === 'warn') && (
        <div className="border-t border-blue-100 pt-2">
          <p className="mb-1 text-xs font-medium text-gray-600">Dismiss warnings</p>
          {activeViolations
            .filter((v) => v.severity === 'warn')
            .map((v) => (
              <label key={violationKey(v)} className="flex items-center gap-2 py-0.5 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!!dismissed[violationKey(v)]}
                  onChange={() => toggleDismiss(v)}
                />
                {v.message}
              </label>
            ))}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit correction & re-validate'}
      </button>
    </div>
  );
}

export default function ExecutionDetailPage() {
  const params = useParams<{ flowId: string; executionId: string }>();
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [flow, setFlow] = useState<FlowDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([
      api.getExecutionDetail(params.flowId, params.executionId),
      api.getFlowDefinition(params.flowId),
    ])
      .then(([d, f]) => {
        setDetail(d);
        setFlow(f);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // This is the lazy-load point - detail only ever fetched here, on open,
    // never as part of the list view (which stays on the DynamoDB summary).
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.flowId, params.executionId]);

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (!detail)
    return (
      <div className="p-6">
        <Link href={`/flows/${params.flowId}/executions`} className="text-sm text-gray-500 hover:text-gray-900">
          &larr; Back to executions
        </Link>
        <p className="mt-3 text-sm text-gray-500">Execution detail not found.</p>
      </div>
    );

  return (
    <div className="max-w-3xl space-y-4 p-6">
      <Link href={`/flows/${params.flowId}/executions`} className="text-sm text-gray-500 hover:text-gray-900">
        &larr; Back to executions
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-medium">Order {detail.orderId}</h1>
        <StatusBadge status={detail.status} />
      </div>
      <p className="text-xs text-gray-500">Evaluated {new Date(detail.evaluatedAt).toLocaleString()}</p>

      {detail.status === 'needs_review' && flow && (
        <CorrectionForm
          detail={detail}
          scopes={flow.scopes}
          onSubmitted={() => {
            // Re-validation happens async in the background (the state machine
            // resumes and loops) - reload after a short delay so the reviewer
            // sees the next round's result once it's actually written, rather
            // than an instant reload still showing the stale "needs_review" state.
            setTimeout(load, 3000);
          }}
        />
      )}

      <div>
        <h2 className="text-sm font-medium mb-2">
          Violations ({detail.violations.length})
          {detail.violations.some((v) => v.dismissed) && (
            <span className="ml-2 text-xs font-normal text-gray-400">
              ({detail.violations.filter((v) => v.dismissed).length} dismissed)
            </span>
          )}
        </h2>
        {detail.violations.length === 0 ? (
          <p className="text-sm text-gray-500">No violations.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-2 font-medium">Rule</th>
                <th className="py-2 font-medium">Scope / item</th>
                <th className="py-2 font-medium">Severity</th>
                <th className="py-2 font-medium">Expected</th>
                <th className="py-2 font-medium">Actual</th>
                <th className="py-2 font-medium">Message</th>
              </tr>
            </thead>
            <tbody>
              {detail.violations.map((v, i) => (
                <tr key={i} className={`border-b border-gray-100 ${v.dismissed ? 'opacity-50' : ''}`}>
                  <td className="py-2 font-mono">{v.ruleId}</td>
                  <td className="py-2 font-mono text-gray-600">
                    {v.scopeId}
                    {v.itemId ? ` / ${v.itemId}` : ''}
                  </td>
                  <td className="py-2">
                    {v.severity}
                    {v.dismissed && <span className="ml-1 text-xs text-gray-400">(dismissed)</span>}
                  </td>
                  <td className="py-2">{String(v.expected)}</td>
                  <td className="py-2">{String(v.actual)}</td>
                  <td className="py-2">{v.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <h2 className="text-sm font-medium mb-2">Rules evaluated ({detail.rulesEvaluated.length})</h2>
        <p className="text-xs font-mono text-gray-500">
          {detail.rulesEvaluated.map((r) => `${r.ruleId}@v${r.version}`).join(', ')}
        </p>
      </div>
    </div>
  );
}
