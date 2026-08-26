// apps/web/app/flow-builder/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { flowBuilderApi } from '../../lib/flowBuilderApi';
import type { FlowGraph } from '@workspace/flow-compiler';

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
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-1 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/flow-builder" className="hover:text-gray-900">
            Dashboard
          </Link>
          <span>/</span>
          <span className="font-medium text-gray-900">Flow Builder</span>
        </div>
        <h1 className="mb-4 text-lg font-medium">Flows</h1>

        <div className="mb-5 flex items-center gap-2">
          {DOCUMENT_TYPES.map((dt) => (
              <button
                  key={dt}
                  onClick={() => setDocumentType(dt)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                      documentType === dt ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
              >
                {dt}
              </button>
          ))}
          <div className="flex-1" />
          <button
              onClick={handleCreate}
              disabled={creating}
              className="rounded bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {creating ? 'Creating…' : '+ New draft'}
          </button>
        </div>

        {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
        ) : drafts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              No draft flows for {documentType} yet - create one to get started.
            </div>
        ) : (
            <div className="space-y-2">
              {drafts.map((draft) => {
                const isPublished = draft.flowId === publishedFlowId;
                return (
                    <Link
                        key={draft.flowId}
                        href={`/flow-builder/${draft.flowId}`}
                        className={`flex items-center justify-between rounded-lg border bg-white px-4 py-3 shadow-sm hover:shadow ${
                            isPublished ? 'border-emerald-300 ring-1 ring-emerald-100' : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{draft.flowId}</span>
                          {isPublished && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                        Published
                      </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400">
                          {draft.nodes.length} node{draft.nodes.length === 1 ? '' : 's'}
                        </div>
                      </div>
                      <span className="text-sm text-gray-400">Open →</span>
                    </Link>
                );
              })}
            </div>
        )}
      </div>
  );
}