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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function handleDelete(flow: FlowGraph, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(`Delete flow "${flow.flowId}"? This can't be undone.`);
    if (!ok) return;
    setDeletingId(flow.flowId);
    setError(null);
    try {
      await flowBuilderApi.deleteDraft(flow.flowId);
      setDrafts((ds) => ds.filter((d) => d.flowId !== flow.flowId));
    } catch (err) {
      // Most likely cause: it was published (by someone else, or in
      // another tab) in the moment between this page loading and the click
      // - the backend's own check is the real guard, this is just surfacing
      // whatever it says rather than assuming success.
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
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

      {error && (
        <div className="rounded bg-error-container/20 px-3 py-2 font-body-sm text-body-sm text-error">{error}</div>
      )}

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
                <th className="p-table-cell-padding font-medium">Status</th>
                <th className="p-table-cell-padding text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-body-base text-body-base text-on-surface">
              {drafts.map((draft) => {
                const isPublished = draft.flowId === publishedFlowId;
                return (
                  <tr key={draft.flowId} className="group transition-colors hover:bg-surface-container-highest">
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
                    <td className="p-table-cell-padding">
                      {isPublished ? <Badge variant="success">Published</Badge> : <Badge variant="secondary">Draft</Badge>}
                    </td>
                    <td className="p-table-cell-padding text-right">
                      <button
                        onClick={(e) => handleDelete(draft, e)}
                        disabled={isPublished || deletingId === draft.flowId}
                        title={isPublished ? 'Publish a different flow for this document type first' : undefined}
                        className="font-body-sm text-body-sm text-error opacity-0 transition-opacity hover:underline group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30 disabled:no-underline disabled:group-hover:opacity-30"
                      >
                        {deletingId === draft.flowId ? 'Deleting…' : 'Delete'}
                      </button>
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
