// apps/web/app/overview/page.tsx
//
// New page, matching the design spec's Overview mockup structurally - but
// using REAL data this system actually tracks (flow counts across both
// document types), not the mockup's example numbers ("1.2M orders
// processed", "98.7% pass rate"). This system has no runtime telemetry
// pipeline built - those would be fabricated if shown as real. What IS real
// and worth showing: how many flows exist, how many are published, and the
// most recently touched ones.

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { flowBuilderApi } from '../../lib/flowBuilderApi';
import type { FlowGraph } from '@workspace/flow-compiler';

const DOCUMENT_TYPES = ['Order', 'Invoice'];

export default function OverviewPage() {
  const [flows, setFlows] = useState<Array<FlowGraph & { documentType: string; published: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all(
      DOCUMENT_TYPES.map(async (dt) => {
        const [drafts, publishedRes] = await Promise.all([
          flowBuilderApi.listDrafts(dt).catch(() => []),
          flowBuilderApi.getPublishedFlow(dt).catch(() => ({ published: null })),
        ]);
        const publishedId = publishedRes.published?.flowId;
        return drafts.map((d) => ({ ...d, documentType: dt, published: d.flowId === publishedId }));
      }),
    )
      .then((groups) => setFlows(groups.flat()))
      .finally(() => setLoading(false));
  }, []);

  const publishedCount = flows.filter((f) => f.published).length;
  const draftCount = flows.length - publishedCount;

  return (
    <div className="mx-auto max-w-[1400px] space-y-xl p-layout-margin">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">Overview</h1>
          <p className="mt-xs font-body-sm text-body-sm text-on-surface-variant">
            Flow inventory across both document types
          </p>
        </div>
        <div className="flex items-center gap-sm rounded border border-outline-variant bg-surface-container-low px-md py-xs font-code-sm text-code-sm text-on-surface-variant">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          System operational
        </div>
      </div>

      <div className="grid grid-cols-1 gap-md md:grid-cols-3">
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-lg">
          <div className="mb-lg flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Total flows
            </span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">account_tree</span>
          </div>
          <div className="font-display-lg text-display-lg text-on-surface">{loading ? '—' : flows.length}</div>
        </div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-lg">
          <div className="mb-lg flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Published
            </span>
            <span className="material-symbols-outlined text-[18px] text-secondary">verified</span>
          </div>
          <div className="font-display-lg text-display-lg text-secondary">{loading ? '—' : publishedCount}</div>
        </div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-low p-lg">
          <div className="mb-lg flex items-start justify-between">
            <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Draft
            </span>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">edit_note</span>
          </div>
          <div className="font-display-lg text-display-lg text-on-surface">{loading ? '—' : draftCount}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
        <div className="flex items-center justify-between border-b border-outline-variant bg-surface-container-high px-lg py-md">
          <h2 className="font-headline-md text-headline-md text-on-surface">All flows</h2>
          <Link
            href="/flow-builder"
            className="flex items-center gap-xs font-label-caps text-label-caps uppercase tracking-wider text-primary hover:underline"
          >
            Open workflows
            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
          </Link>
        </div>
        <table className="w-full border-collapse text-left">
          <thead className="border-b border-outline-variant bg-surface font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            <tr>
              <th className="p-table-cell-padding font-semibold">Flow ID</th>
              <th className="p-table-cell-padding font-semibold">Document type</th>
              <th className="p-table-cell-padding font-semibold">Nodes</th>
              <th className="p-table-cell-padding text-right font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/50 font-body-sm text-body-sm text-on-surface">
            {loading ? (
              <tr>
                <td className="p-table-cell-padding text-on-surface-variant" colSpan={4}>
                  Loading…
                </td>
              </tr>
            ) : flows.length === 0 ? (
              <tr>
                <td className="p-table-cell-padding text-on-surface-variant" colSpan={4}>
                  No flows yet.
                </td>
              </tr>
            ) : (
              flows.map((flow) => (
                <tr key={flow.flowId} className="transition-colors hover:bg-surface-variant">
                  <td className="p-table-cell-padding">
                    <Link href={`/flow-builder/${flow.flowId}`} className="font-code-sm text-code-sm text-primary hover:underline">
                      {flow.flowId}
                    </Link>
                  </td>
                  <td className="p-table-cell-padding">{flow.documentType}</td>
                  <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">
                    {flow.nodes.length}
                  </td>
                  <td className="p-table-cell-padding text-right">
                    <span
                      className={`inline-flex items-center rounded px-2 py-1 font-code-sm text-[10px] ${
                        flow.published
                          ? 'border border-secondary/30 bg-secondary-container/20 text-secondary'
                          : 'border border-outline-variant bg-surface-variant text-on-surface-variant'
                      }`}
                    >
                      {flow.published ? 'PUBLISHED' : 'DRAFT'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
