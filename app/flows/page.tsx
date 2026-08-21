// web/app/flows/page.tsx
//
// The landing page - matches Shopify Flow's own dashboard shape: a list of
// workflows (here, "flows"), each showing a name and a bit of status, a
// "Create workflow" button, click a row to open its builder.

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../lib/api';
import { FlowDefinition } from '../../lib/types';

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    api
      .listFlows()
      .then(setFlows)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const flow = await api.createFlow(newName.trim());
      router.push(`/flows/${flow.flowId}/canvas`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flow: FlowDefinition, e: React.MouseEvent) {
    e.preventDefault(); // don't follow the row's own link
    e.stopPropagation();
    const ok = window.confirm(
      `Delete "${flow.name}"? This also deletes all ${flow.scopes?.length ?? 0} group(s) and their rules. Past execution history is kept.`,
    );
    if (!ok) return;
    await api.deleteFlow(flow.flowId);
    setFlows((fs) => fs.filter((f) => f.flowId !== flow.flowId));
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Flows</h1>
          <p className="text-sm text-gray-600">
            Each flow is an independent set of validation rules - e.g. one for AP invoice validation,
            another for PO order validation.
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow"
          >
            + Create flow
          </button>
        )}
      </div>

      {showCreateForm && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <label className="mb-1 block text-xs font-medium text-gray-500">Flow name</label>
          <div className="flex gap-2">
            <input
              autoFocus
              className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
              placeholder="e.g. AP invoice validation"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="rounded bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {creating ? 'Creating\u2026' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : flows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          No flows yet - create your first one above.
        </div>
      ) : (
        <div className="space-y-2">
          {flows.map((flow) => (
            <div
              key={flow.flowId}
              onClick={() => router.push(`/flows/${flow.flowId}/canvas`)}
              className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-gray-300 hover:shadow"
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{flow.name}</div>
                <div className="text-xs text-gray-500">
                  {flow.scopes?.length ?? 0} group{flow.scopes?.length === 1 ? '' : 's'} · v{flow.version}
                  {!flow.samplePayload && ' \u00b7 needs an example payload'}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={(e) => handleDelete(flow, e)}
                  className="text-xs text-red-500 hover:text-red-700 hover:underline"
                >
                  Delete
                </button>
                <span className="text-sm text-gray-400">Open →</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
