// apps/web/app/flow-builder/page.tsx
//
// Complete redesign with the shadcn foundation - Card for each draft row
// (real elevation/border tokens instead of ad-hoc gray-200/shadow-sm pairs),
// Button for every action, Badge for the "Published" marker. All the
// underlying fetch/create logic is completely unchanged - this is purely
// the visual layer.

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';
import { flowBuilderApi } from '../../lib/flowBuilderApi';
import type { FlowGraph } from '@workspace/flow-compiler';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Card } from '../../components/ui/card';

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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/flow-builder" className="hover:text-foreground">
          Dashboard
        </Link>
        <span>/</span>
        <span className="text-foreground">Flow Builder</span>
      </div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Flows</h1>

      <div className="mb-6 flex items-center justify-between">
        <div className="inline-flex rounded-lg border bg-muted p-1">
          {DOCUMENT_TYPES.map((dt) => (
            <button
              key={dt}
              onClick={() => setDocumentType(dt)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                documentType === dt
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {dt}
            </button>
          ))}
        </div>
        <Button onClick={handleCreate} disabled={creating}>
          <Plus className="mr-1.5 h-4 w-4" />
          {creating ? 'Creating…' : 'New draft'}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : drafts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No draft flows for {documentType} yet - create one to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft) => {
            const isPublished = draft.flowId === publishedFlowId;
            return (
              <Link key={draft.flowId} href={`/flow-builder/${draft.flowId}`}>
                <Card
                  className={`flex items-center justify-between px-4 py-3 transition-shadow hover:shadow-md ${
                    isPublished ? 'border-emerald-300 ring-1 ring-emerald-100' : ''
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{draft.flowId}</span>
                      {isPublished && <Badge variant="success">Published</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {draft.nodes.length} node{draft.nodes.length === 1 ? '' : 's'}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
