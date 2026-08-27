// apps/web/app/flow-builder/[flowId]/executions/page.tsx
//
// Real, persistent test history for this flow's document type - what the
// removed ephemeral banner used to try to show, gone the moment you
// navigated away. Same drawer pattern as the cross-client Logs page, for
// consistency - list + lazy-fetched detail on click.

'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { flowBuilderApi } from '../../../../lib/flowBuilderApi';
import { StatusBadge } from '../../../../components/StatusBadge';

interface HistoryRow {
  documentType: string;
  evaluatedAt: string;
  executionId: string;
  status: string;
  violationCount: number;
}

export default function FlowExecutionHistoryPage() {
  const params = useParams<{ flowId: string }>();
  const [documentType, setDocumentType] = useState<string | null>(null);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<HistoryRow | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof flowBuilderApi.getExecutionHistoryDetail>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    flowBuilderApi.getDraft(params.flowId).then((graph) => {
      setDocumentType(graph.documentType);
      flowBuilderApi
        .listExecutionHistory(graph.documentType)
        .then(setRows)
        .finally(() => setLoading(false));
    });
  }, [params.flowId]);

  async function refresh() {
    if (!documentType) return;
    setRefreshing(true);
    try {
      setRows(await flowBuilderApi.listExecutionHistory(documentType));
    } finally {
      setRefreshing(false);
    }
  }

  async function openRow(row: HistoryRow) {
    setSelected(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await flowBuilderApi.getExecutionHistoryDetail(row.documentType, row.executionId);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-outline-variant bg-surface px-5 py-3">
        <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
          <Link href={`/flow-builder/${params.flowId}`} className="hover:text-on-surface">
            &larr; Back to canvas
          </Link>
        </div>
        <h1 className="font-headline-md text-headline-md text-on-surface">
          Test history{documentType ? ` \u00b7 ${documentType}` : ''}
        </h1>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex w-24 items-center justify-end gap-1 font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="relative flex-1 overflow-auto">
        {loading ? (
          <p className="p-5 font-body-sm text-body-sm text-on-surface-variant">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              No test runs yet - click "Test flow" on the canvas to run one. If you just did, the
              result may take a few seconds to land here - try Refresh above.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 border-b border-outline-variant bg-surface font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="p-table-cell-padding font-semibold">Evaluated at</th>
                <th className="p-table-cell-padding font-semibold">Execution ID</th>
                <th className="p-table-cell-padding font-semibold">Status</th>
                <th className="p-table-cell-padding text-right font-semibold">Violations</th>
              </tr>
            </thead>
            <tbody className="font-body-sm text-body-sm">
              {rows.map((row) => (
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
                  <td className="p-table-cell-padding font-code-sm text-code-sm text-primary">{row.executionId}</td>
                  <td className="p-table-cell-padding">
                    <StatusBadge status={row.status === 'failed' ? 'failed' : 'passed'} />
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
              <h2 className="font-body-base text-body-base font-semibold text-on-surface">Execution detail</h2>
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
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-label-caps text-label-caps uppercase text-on-surface-variant">Payload</span>
                      <button
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(detail.detail.payload, null, 2))}
                        className="flex items-center gap-1 font-body-sm text-body-sm text-primary hover:underline"
                      >
                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                        Copy
                      </button>
                    </div>
                    <pre className="max-h-64 overflow-auto rounded border border-outline-variant bg-background p-md font-code-sm text-code-sm text-on-surface-variant">
                      {JSON.stringify(detail.detail.payload, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <span className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">
                      Violations ({detail.detail.violations.length})
                    </span>
                    {detail.detail.violations.length === 0 ? (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">None.</p>
                    ) : (
                      <pre className="max-h-64 overflow-auto rounded border border-outline-variant bg-background p-md font-code-sm text-code-sm text-on-surface-variant">
                        {JSON.stringify(detail.detail.violations, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ) : (
                <p className="font-body-sm text-body-sm text-on-surface-variant">Detail not found.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
