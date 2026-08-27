// web/app/flows/[flowId]/executions/[executionId]/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../../../../../../lib/api';
import { ExecutionDetail, DismissedWarning, FlowDefinition, Violation } from '../../../../../../../lib/types';
import { getValueAtPath, setValueAtPath } from '../../../../../../../lib/fieldTree';
import { StatusBadge } from '../../../../../../../components/StatusBadge';

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
      await api.submitCorrection(detail.tenantId, detail.flowId, detail.executionId, { correctedPayload, dismissedWarnings });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit correction');
    } finally {
      setSubmitting(false);
    }
  }

  const blockingCount = activeViolations.filter((v) => v.severity === 'block').length;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary-container/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-body-sm text-body-sm text-primary">
          {blockingCount > 0
            ? `${blockingCount} blocking issue${blockingCount === 1 ? '' : 's'} to fix. Warnings can be dismissed instead.`
            : 'No blocking issues remain - dismiss any warnings you want to acknowledge, or just resubmit as-is.'}
        </p>
        <button
          onClick={() => setAdvancedMode((a) => !a)}
          className="whitespace-nowrap font-body-sm text-body-sm text-primary underline hover:no-underline"
        >
          {advancedMode ? 'Back to quick corrections' : 'Edit full JSON instead'}
        </button>
      </div>

      {advancedMode ? (
        <div>
          <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">Corrected payload</label>
          <textarea
            className="h-64 w-full rounded border border-outline-variant bg-background p-3 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
            value={payloadText}
            onChange={(e) => setPayloadText(e.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-2">
          {quickCorrectable.length === 0 && notQuickCorrectable.length === 0 ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">No blocking fields to correct.</p>
          ) : (
            quickCorrectable.map((v) => (
              <div key={violationKey(v)} className="rounded border border-outline-variant bg-surface-container p-2.5">
                <div className="mb-1 flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
                  <span className="font-code-sm text-code-sm">{v.ruleId}</span>
                  <span>·</span>
                  <span className="font-code-sm text-code-sm">
                    {v.scopeId}
                    {v.itemId ? ` / ${v.itemId}` : ''} → {v.correctablePath}
                  </span>
                </div>
                <p className="mb-1.5 font-body-sm text-body-sm text-on-surface">{v.message}</p>
                <div className="flex items-center gap-2">
                  <span className="font-body-sm text-body-sm text-on-surface-variant">Current: {String(v.actual)}</span>
                  <input
                    className="flex-1 rounded border border-outline-variant bg-background px-2 py-1 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
                    placeholder={`Corrected value (e.g. ${String(v.expected)})`}
                    value={fieldEdits[violationKey(v)] ?? ''}
                    onChange={(e) => setFieldEdits((f) => ({ ...f, [violationKey(v)]: e.target.value }))}
                  />
                </div>
              </div>
            ))
          )}

          {notQuickCorrectable.length > 0 && (
            <p className="font-body-sm text-body-sm text-tertiary">
              {notQuickCorrectable.length} issue{notQuickCorrectable.length === 1 ? '' : 's'} came from a
              lookup, not this payload directly - use &quot;Edit full JSON instead&quot; to address{' '}
              {notQuickCorrectable.length === 1 ? 'it' : 'those'}.
            </p>
          )}
        </div>
      )}

      {activeViolations.some((v) => v.severity === 'warn') && (
        <div className="border-t border-primary/20 pt-2">
          <p className="mb-1 font-label-caps text-label-caps uppercase text-on-surface-variant">Dismiss warnings</p>
          {activeViolations
            .filter((v) => v.severity === 'warn')
            .map((v) => (
              <label key={violationKey(v)} className="flex items-center gap-2 py-0.5 font-body-sm text-body-sm text-on-surface">
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

      {error && <p className="font-body-sm text-body-sm text-error">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="rounded bg-primary px-4 py-2 font-body-sm text-body-sm font-medium text-on-primary disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit correction & re-validate'}
      </button>
    </div>
  );
}

export default function ExecutionDetailPage() {
  const params = useParams<{ clientId: string; flowId: string; executionId: string }>();
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [flow, setFlow] = useState<FlowDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([
      api.getExecutionDetail(params.clientId, params.flowId, params.executionId),
      api.getFlowDefinition(params.clientId, params.flowId),
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
  }, [params.clientId, params.flowId, params.executionId]);

  if (loading) return <p className="p-6 font-body-sm text-body-sm text-on-surface-variant">Loading…</p>;
  if (!detail)
    return (
      <div className="p-layout-margin">
        <Link href={`/clients/${params.clientId}/flows/${params.flowId}/executions`} className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
          &larr; Back to executions
        </Link>
        <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">Execution detail not found.</p>
      </div>
    );

  return (
    <div className="max-w-3xl space-y-4 p-layout-margin">
      <Link href={`/clients/${params.clientId}/flows/${params.flowId}/executions`} className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
        &larr; Back to executions
      </Link>
      <div className="flex items-center gap-3">
        <h1 className="font-display-lg text-display-lg text-on-surface">Order {detail.orderId}</h1>
        <StatusBadge status={detail.status} />
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">Evaluated {new Date(detail.evaluatedAt).toLocaleString()}</p>

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
        <h2 className="font-headline-md text-headline-md text-on-surface mb-2">
          Violations ({detail.violations.length})
          {detail.violations.some((v) => v.dismissed) && (
            <span className="ml-2 font-body-sm text-body-sm font-normal text-on-surface-variant">
              ({detail.violations.filter((v) => v.dismissed).length} dismissed)
            </span>
          )}
        </h2>
        {detail.violations.length === 0 ? (
          <p className="font-body-sm text-body-sm text-on-surface-variant">No violations.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant text-left font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
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
                <tr key={i} className={`border-b border-outline-variant ${v.dismissed ? 'opacity-50' : ''}`}>
                  <td className="py-2 font-code-sm text-code-sm">{v.ruleId}</td>
                  <td className="py-2 font-code-sm text-code-sm text-on-surface-variant">
                    {v.scopeId}
                    {v.itemId ? ` / ${v.itemId}` : ''}
                  </td>
                  <td className="py-2">
                    {v.severity}
                    {v.dismissed && <span className="ml-1 font-body-sm text-body-sm text-on-surface-variant">(dismissed)</span>}
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
        <h2 className="font-headline-md text-headline-md text-on-surface mb-2">Rules evaluated ({detail.rulesEvaluated.length})</h2>
        <p className="font-code-sm text-code-sm text-on-surface-variant">
          {detail.rulesEvaluated.map((r) => `${r.ruleId}@v${r.version}`).join(', ')}
        </p>
      </div>
    </div>
  );
}
