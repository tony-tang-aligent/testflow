// apps/web/app/logs/page.tsx
//
// Now genuinely aggregated across BOTH systems - the old validator
// (client-scoped) and flow-builder (document-type-scoped, no client concept
// at all - a real, deliberate architectural difference, not an oversight).
// Same proven summary-in-DynamoDB/detail-lazily-from-S3 pattern both systems
// already use individually; this just merges their two summary lists into
// one sorted table, tagging each row with which system it came from.
//
// The scope mismatch is real and shown honestly, not papered over: a
// "Client" filter that only ever narrows validator rows, and a "Document
// Type" filter that only ever narrows flow-builder rows - picking either
// one hides rows from the OTHER system entirely, since neither dimension
// applies to both. Selecting "Acme Corp" doesn't mean "show flow-builder
// rows too, unfiltered" - it means "show only what Acme Corp actually has,"
// and flow-builder has no concept of Acme Corp at all.
//
// Known, stated limitation: flow-builder's document types aren't
// dynamically discoverable anywhere in this system - this hardcodes the
// same two-item list the flow-builder dashboard/overview pages already
// hardcode. A third document type needs updating in all three places until
// a real "list all document types" endpoint exists.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { flowBuilderApi } from '../../lib/flowBuilderApi';
import { ExecutionDetail } from '../../lib/types';
import { StatusBadge } from '../../components/StatusBadge';

const FLOW_BUILDER_DOCUMENT_TYPES = ['Order', 'Invoice'];

interface LogRow {
  source: 'validator' | 'flow-builder';
  executionId: string;
  evaluatedAt: string;
  status: string;
  violationCount: number;
  reference: string; // orderId for validator, executionId itself for flow-builder (no equivalent field exists there)
  scopeLabel: string; // client name for validator, document type for flow-builder
  tenantId?: string;
  flowId?: string;
  documentType?: string;
}

interface CommonDetail {
  payload: unknown;
  violations: unknown[];
  rulesEvaluated?: number; // validator only - flow-builder tracks no equivalent
}

export default function LogsPage() {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('');
  const [documentTypeFilter, setDocumentTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [detail, setDetail] = useState<CommonDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const accessibleClients = await api.listAccessibleClients().catch(() => []);
      setClients(accessibleClients);

      const validatorRows = await Promise.all(
          accessibleClients.map(async (client) => {
            const flows = await api.listFlows(client.id).catch(() => []);
            const perFlow = await Promise.all(
                flows.map((flow) =>
                    api
                        .listExecutions(client.id, flow.flowId)
                        .then((execs) =>
                            execs.map(
                                (e): LogRow => ({
                                  source: 'validator',
                                  executionId: e.executionId,
                                  evaluatedAt: e.evaluatedAt,
                                  status: e.status,
                                  violationCount: e.violationCount,
                                  reference: e.orderId,
                                  scopeLabel: client.name,
                                  tenantId: e.tenantId,
                                  flowId: e.flowId,
                                }),
                            ),
                        )
                        .catch(() => [] as LogRow[]),
                ),
            );
            return perFlow.flat();
          }),
      );

      const flowBuilderRows = await Promise.all(
          FLOW_BUILDER_DOCUMENT_TYPES.map((documentType) =>
              flowBuilderApi
                  .listExecutionHistory(documentType)
                  .then((execs) =>
                      execs.map(
                          (e): LogRow => ({
                            source: 'flow-builder',
                            executionId: e.executionId,
                            evaluatedAt: e.evaluatedAt,
                            status: e.status,
                            violationCount: e.violationCount,
                            reference: e.executionId,
                            scopeLabel: documentType,
                            documentType,
                          }),
                      ),
                  )
                  .catch(() => [] as LogRow[]),
          ),
      );

      const merged = [...validatorRows.flat(), ...flowBuilderRows.flat()].sort(
          (a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime(),
      );
      setRows(merged);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(
      () =>
          rows.filter((r) => {
            if (clientFilter && (r.source !== 'validator' || r.tenantId !== clientFilter)) return false;
            if (documentTypeFilter && (r.source !== 'flow-builder' || r.documentType !== documentTypeFilter)) return false;
            if (statusFilter && r.status !== statusFilter) return false;
            return true;
          }),
      [rows, clientFilter, documentTypeFilter, statusFilter],
  );

  async function openRow(row: LogRow) {
    setSelected(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      if (row.source === 'validator') {
        const d = await api.getExecutionDetail(row.tenantId!, row.flowId!, row.executionId);
        setDetail({ payload: d.payload, violations: d.violations, rulesEvaluated: d.rulesEvaluated.length });
      } else {
        const d = await flowBuilderApi.getExecutionHistoryDetail(row.documentType!, row.executionId);
        setDetail({ payload: d.detail.payload, violations: d.detail.violations });
      }
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
      <div className="flex h-full flex-col">
        <div className="border-b border-outline-variant bg-surface-container-low p-md">
          <h1 className="mb-1 font-display-lg text-display-lg text-on-surface">Logs</h1>
          <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
            Executions across both systems - the old validator (per client) and Flow Builder (per document type)
          </p>
          <div className="flex flex-wrap items-center gap-md">
            <div className="flex items-center gap-sm rounded border border-outline-variant bg-surface-container px-sm py-xs">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">corporate_fare</span>
              <select
                  className="border-none bg-transparent p-0 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-0"
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
              >
                <option value="">All clients</option>
                {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-sm rounded border border-outline-variant bg-surface-container px-sm py-xs">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">account_tree</span>
              <select
                  className="border-none bg-transparent p-0 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-0"
                  value={documentTypeFilter}
                  onChange={(e) => setDocumentTypeFilter(e.target.value)}
              >
                <option value="">All document types</option>
                {FLOW_BUILDER_DOCUMENT_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-sm rounded border border-outline-variant bg-surface-container px-sm py-xs">
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">filter_list</span>
              <select
                  className="border-none bg-transparent p-0 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-0"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Status: All</option>
                <option value="needs_review">Needs review</option>
                <option value="passed">Passed</option>
                <option value="warned">Warned</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto">
          {loading ? (
              <p className="p-md font-body-sm text-body-sm text-on-surface-variant">Loading…</p>
          ) : filtered.length === 0 ? (
              <p className="p-md font-body-sm text-body-sm text-on-surface-variant">No executions match these filters.</p>
          ) : (
              <table className="w-full whitespace-nowrap border-collapse text-left">
                <thead className="sticky top-0 border-b border-outline-variant bg-surface font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="p-table-cell-padding font-semibold">Evaluated at</th>
                  <th className="p-table-cell-padding font-semibold">Reference</th>
                  <th className="p-table-cell-padding font-semibold">System</th>
                  <th className="p-table-cell-padding font-semibold">Scope</th>
                  <th className="p-table-cell-padding font-semibold">Status</th>
                  <th className="p-table-cell-padding text-right font-semibold">Violations</th>
                </tr>
                </thead>
                <tbody className="font-body-sm text-body-sm">
                {filtered.map((row) => (
                    <tr
                        key={`${row.source}-${row.executionId}`}
                        onClick={() => openRow(row)}
                        className={`cursor-pointer border-b border-outline-variant transition-colors hover:bg-surface-variant ${
                            selected?.executionId === row.executionId && selected?.source === row.source
                                ? 'bg-surface-variant'
                                : ''
                        }`}
                    >
                      <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">
                        {new Date(row.evaluatedAt).toLocaleString()}
                      </td>
                      <td className="p-table-cell-padding font-code-sm text-code-sm text-primary">{row.reference}</td>
                      <td className="p-table-cell-padding">
                    <span
                        className={`rounded px-1.5 py-0.5 font-label-caps text-label-caps uppercase ${
                            row.source === 'validator'
                                ? 'bg-primary-container/20 text-primary'
                                : 'bg-secondary-container/20 text-secondary'
                        }`}
                    >
                      {row.source === 'validator' ? 'Validator' : 'Flow Builder'}
                    </span>
                      </td>
                      <td className="p-table-cell-padding text-on-surface">{row.scopeLabel}</td>
                      <td className="p-table-cell-padding">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="p-table-cell-padding text-right font-code-sm text-code-sm text-on-surface-variant">
                        {row.violationCount}
                      </td>
                    </tr>
                ))}
                </tbody>
              </table>
          )}

          {selected && (
              <div className="absolute right-0 top-0 z-20 h-full w-[440px] max-w-[92vw] overflow-y-auto border-l border-outline-variant bg-surface-container-high shadow-xl">
                <div className="sticky top-0 flex items-center justify-between border-b border-outline-variant bg-surface-container px-md py-3">
                  <div className="flex items-center gap-2">
                    <h2 className="font-body-base text-body-base font-semibold text-on-surface">Event details</h2>
                    <span className="rounded bg-primary-container/20 px-1.5 py-0.5 font-code-sm text-code-sm text-primary">
                  {selected.reference}
                </span>
                  </div>
                  <button
                      onClick={() => setSelected(null)}
                      className="rounded p-1 text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
                <div className="p-md">
                  {detailLoading ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">Loading…</p>
                  ) : detail ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-md">
                          <div>
                      <span className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">
                        {selected.source === 'validator' ? 'Client' : 'Document type'}
                      </span>
                            <span className="font-body-sm text-body-sm text-on-surface">{selected.scopeLabel}</span>
                          </div>
                          {detail.rulesEvaluated !== undefined && (
                              <div>
                        <span className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">
                          Rules evaluated
                        </span>
                                <span className="font-code-sm text-code-sm text-on-surface">{detail.rulesEvaluated}</span>
                              </div>
                          )}
                        </div>

                        <div>
                          <div className="mb-1 flex items-center justify-between">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">
                        Payload
                      </span>
                            <button
                                onClick={() => navigator.clipboard.writeText(JSON.stringify(detail.payload, null, 2))}
                                className="flex items-center gap-1 font-body-sm text-body-sm text-primary hover:underline"
                            >
                              <span className="material-symbols-outlined text-[14px]">content_copy</span>
                              Copy
                            </button>
                          </div>
                          <pre className="max-h-64 overflow-auto rounded border border-outline-variant bg-background p-md font-code-sm text-code-sm text-on-surface-variant">
                      {JSON.stringify(detail.payload, null, 2)}
                    </pre>
                        </div>

                        <div>
                    <span className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">
                      Violations ({detail.violations.length})
                    </span>
                          {detail.violations.length === 0 ? (
                              <p className="font-body-sm text-body-sm text-on-surface-variant">None.</p>
                          ) : selected.source === 'validator' ? (
                              <ul className="space-y-1">
                                {(detail.violations as { message: string }[]).map((v, i) => (
                                    <li
                                        key={i}
                                        className="rounded border border-outline-variant bg-surface-container p-2 font-body-sm text-body-sm text-on-surface"
                                    >
                                      {v.message}
                                    </li>
                                ))}
                              </ul>
                          ) : (
                              // flow-builder's violation shape isn't a guaranteed
                              // {message} object the way the validator's is - shown
                              // as raw JSON, matching what flow-builder's own
                              // per-flow history page already does for the same
                              // reason.
                              <pre className="max-h-64 overflow-auto rounded border border-outline-variant bg-background p-md font-code-sm text-code-sm text-on-surface-variant">
                        {JSON.stringify(detail.violations, null, 2)}
                      </pre>
                          )}
                        </div>

                        {selected.source === 'validator' && (
                            <a
                                href={`/clients/${selected.tenantId}/flows/${selected.flowId}/executions/${selected.executionId}`}
                                className="inline-flex items-center gap-1 font-body-sm text-body-sm text-primary hover:underline"
                            >
                              Open full execution page
                              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            </a>
                        )}
                      </div>
                  ) : (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">Execution detail not found.</p>
                  )}
                </div>
              </div>
          )}
        </div>
      </div>
  );
}