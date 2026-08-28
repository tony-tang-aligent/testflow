// apps/web/app/flow-builder/page.tsx
//
// M3 dark tokens, matching Overview's own table pattern for consistency -
// Button/Badge already remapped to M3 (see tailwind.config.js's token
// system), so no change needed to those imports. All fetch/create logic
// unchanged - visual layer only.

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { flowBuilderApi } from '../../lib/flowBuilderApi';
import type { FlowGraph } from '@workspace/flow-compiler';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';

const DOCUMENT_TYPES = ['Order', 'Invoice'];

export default function FlowBuilderDashboard() {
  const router = useRouter();
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPES[0]);
  const [drafts, setDrafts] = useState<FlowGraph[]>([]);
  const [publishedFlowId, setPublishedFlowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      flowBuilderApi.listDrafts(documentType).catch(() => []),
      flowBuilderApi
          .getPublishedFlow(documentType)
          .then((r) => r.published?.flowId ?? null)
          .catch(() => null),
    ])
        .then(([draftList, publishedId]) => {
          setDrafts(draftList);
          setPublishedFlowId(publishedId);
        })
        .finally(() => setLoading(false));
  }, [documentType]);

  async function handleCreate() {
    setCreating(true);
    try {
      const draft = await flowBuilderApi.createDraft(documentType);
      router.push(`/flow-builder/${draft.flowId}`);
    } finally {
      setCreating(false);
    }
  }

  return (
      <div className="mx-auto max-w-3xl space-y-xl p-layout-margin">
        <div>
          <div className="mb-1 flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
            <Link href="/flow-builder" className="hover:text-on-surface">
              Dashboard
            </Link>
            <span>/</span>
            <span className="text-on-surface">Flow Builder</span>
          </div>
          <h1 className="font-display-lg text-display-lg text-on-surface">Flows</h1>
        </div>

        <div className="flex items-center justify-between">
          <div className="inline-flex rounded-lg border border-outline-variant bg-surface-container-low p-1">
            {DOCUMENT_TYPES.map((dt) => (
                <button
                    key={dt}
                    onClick={() => setDocumentType(dt)}
                    className={`rounded-md px-3 py-1.5 font-body-sm text-body-sm font-medium transition-colors ${
                        documentType === dt
                            ? 'bg-surface-container-high text-on-surface shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                >
                  {dt}
                </button>
            ))}
          </div>
          <Button onClick={handleCreate} disabled={creating}>
            <span className="material-symbols-outlined mr-1.5 text-[16px]">add</span>
            {creating ? 'Creating…' : 'New draft'}
          </Button>
        </div>

        {loading ? (
            <p className="font-body-sm text-body-sm text-on-surface-variant">Loading…</p>
        ) : drafts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-outline-variant p-12 text-center">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No draft flows for {documentType} yet - create one to get started.
              </p>
            </div>
        ) : (
            <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
              <table className="w-full border-collapse text-left">
                <thead className="border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                <tr>
                  <th className="p-table-cell-padding font-medium">Flow ID</th>
                  <th className="p-table-cell-padding font-medium">Nodes</th>
                  <th className="p-table-cell-padding text-right font-medium">Status</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-body-base text-body-base text-on-surface">
                {drafts.map((draft) => {
                  const isPublished = draft.flowId === publishedFlowId;
                  return (
                      <tr key={draft.flowId} className="transition-colors hover:bg-surface-container-highest">
                        <td className="p-table-cell-padding">
                          <Link
                              href={`/flow-builder/${draft.flowId}`}
                              className="font-code-sm text-code-sm text-primary hover:underline"
                          >
                            {draft.flowId}
                          </Link>
                        </td>
                        <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">
                          {draft.nodes.length}
                        </td>
                        <td className="p-table-cell-padding text-right">
                          {isPublished ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Draft</Badge>}
                        </td>
                      </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
        )}
      </div>
  );
}