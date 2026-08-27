// apps/web/app/logs/page.tsx
//
// Real cross-client execution log - the piece that was missing entirely
// (the sidebar's "Logs" link pointed at /clients as a placeholder before
// this). Fans out: accessible clients -> each client's flows -> each flow's
// executions, merged and sorted by evaluatedAt. Genuinely N+M calls, not a
// single query - for an org with many clients/flows this could get slow;
// worth revisiting with a real aggregation endpoint if that becomes a
// problem, not something to pretend doesn't exist.
//
// "Latency" from the reference design isn't shown - this system doesn't
// track execution latency anywhere. "Violations" (a real field on
// ExecutionSummary) takes its place instead.

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { ExecutionSummary, ExecutionDetail } from '../../lib/types';
import { StatusBadge } from '../../components/StatusBadge';

interface LogRow extends ExecutionSummary {
  clientName: string;
}

export default function LogsPage() {
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const accessibleClients = await api.listAccessibleClients().catch(() => []);
      setClients(accessibleClients);

      const perClientRows = await Promise.all(
        accessibleClients.map(async (client) => {
          const flows = await api.listFlows(client.id).catch(() => []);
          const perFlowExecutions = await Promise.all(
            flows.map((flow) =>
              api
                .listExecutions(client.id, flow.flowId)
                .then((execs) => execs.map((e) => ({ ...e, clientName: client.name })))
                .catch(() => [] as LogRow[]),
            ),
          );
          return perFlowExecutions.flat();
        }),
      );

      const merged = perClientRows.flat().sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime());
      setRows(merged);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (clientFilter && r.tenantId !== clientFilter) return false;
        if (statusFilter && r.status !== statusFilter) return false;
        return true;
      }),
    [rows, clientFilter, statusFilter],
  );

  async function openRow(row: LogRow) {
    setSelected(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await api.getExecutionDetail(row.tenantId, row.flowId, row.executionId);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-outline-variant bg-surface-container-low p-md">
        <h1 className="mb-1 font-display-lg text-display-lg text-on-surface">Logs</h1>
        <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
          Validation executions across every client you have access to
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
                <th className="p-table-cell-padding font-semibold">Order</th>
                <th className="p-table-cell-padding font-semibold">Client</th>
                <th className="p-table-cell-padding font-semibold">Status</th>
                <th className="p-table-cell-padding text-right font-semibold">Violations</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm">
              {filtered.map((row) => (
                <tr
                  key={row.executionId}
                  onClick={() => openRow(row)}
                  className={`cursor-pointer border-b border-outline-variant transition-colors hover:bg-surface-variant ${
                    selected?.executionId === row.executionId ? 'bg-surface-variant' : ''
                  }`}
                >
                  <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">
                    {new Date(row.evaluatedAt).toLocaleString()}
                  </td>
                  <td className="p-table-cell-padding font-code-sm text-code-sm text-primary">{row.orderId}</td>
                  <td className="p-table-cell-padding text-on-surface">{row.clientName}</td>
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
                  {selected.orderId}
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
                        Client
                      </span>
                      <span className="font-body-sm text-body-sm text-on-surface">{selected.clientName}</span>
                    </div>
                    <div>
                      <span className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">
                        Rules evaluated
                      </span>
                      <span className="font-code-sm text-code-sm text-on-surface">{detail.rulesEvaluated.length}</span>
                    </div>
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
                    ) : (
                      <ul className="space-y-1">
                        {detail.violations.map((v, i) => (
                          <li key={i} className="rounded border border-outline-variant bg-surface-container p-2 font-body-sm text-body-sm text-on-surface">
                            {v.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <a
                    href={`/clients/${selected.tenantId}/flows/${selected.flowId}/executions/${selected.executionId}`}
                    className="inline-flex items-center gap-1 font-body-sm text-body-sm text-primary hover:underline"
                  >
                    Open full execution page
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </a>
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
