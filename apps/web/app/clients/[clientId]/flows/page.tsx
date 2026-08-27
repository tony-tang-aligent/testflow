// web/app/flows/page.tsx
//
// The landing page - matches Shopify Flow's own dashboard shape: a list of
// workflows (here, "flows"), each showing a name and a bit of status, a
// "Create workflow" button, click a row to open its builder.

'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../../lib/api';
import { FlowDefinition } from '../../../../lib/types';

export default function FlowsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const [flows, setFlows] = useState<FlowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    api
      .listFlows(clientId)
      .then(setFlows)
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const flow = await api.createFlow(clientId, newName.trim());
      router.push(`/clients/${clientId}/flows/${flow.flowId}/canvas`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(flow: FlowDefinition, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      `Delete "${flow.name}"? This also deletes all ${flow.scopes?.length ?? 0} group(s) and their rules. Past execution history is kept.`,
    );
    if (!ok) return;
    await api.deleteFlow(clientId, flow.flowId);
    setFlows((fs) => fs.filter((f) => f.flowId !== flow.flowId));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-lg p-layout-margin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display-lg text-display-lg text-on-surface">Flows</h1>
          <p className="mt-xs font-body-sm text-body-sm text-on-surface-variant">
            Each flow is an independent set of validation rules - e.g. one for AP invoice validation,
            another for PO order validation.
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="rounded bg-primary px-4 py-2 font-body-sm text-body-sm font-medium text-on-primary shadow-sm"
          >
            + Create flow
          </button>
        )}
      </div>

      {showCreateForm && (
        <div className="rounded-lg border border-outline-variant bg-surface-container p-lg">
          <label className="mb-1 block font-label-caps text-label-caps uppercase text-on-surface-variant">
            Flow name
          </label>
          <div className="flex gap-2">
            <input
              autoFocus
              className="flex-1 rounded border border-outline-variant bg-background px-2 py-1.5 font-body-sm text-body-sm text-on-surface focus:border-primary focus:outline-none"
              placeholder="e.g. AP invoice validation"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="rounded bg-primary px-4 py-1.5 font-body-sm text-body-sm font-medium text-on-primary disabled:opacity-50"
            >
              {creating ? 'Creating\u2026' : 'Create'}
            </button>
            <button
              onClick={() => setShowCreateForm(false)}
              className="rounded border border-outline-variant px-4 py-1.5 font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-variant"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Loading…</p>
      ) : flows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant p-12 text-center">
          <p className="font-body-sm text-body-sm text-on-surface-variant">No flows yet - create your first one above.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="p-table-cell-padding font-medium">Flow name</th>
                <th className="p-table-cell-padding font-medium">Details</th>
                <th className="p-table-cell-padding text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-body-base text-body-base text-on-surface">
              {flows.map((flow) => (
                <tr
                  key={flow.flowId}
                  onClick={() => router.push(`/clients/${clientId}/flows/${flow.flowId}/canvas`)}
                  className="group cursor-pointer transition-colors hover:bg-surface-container-highest"
                >
                  <td className="p-table-cell-padding font-medium">{flow.name}</td>
                  <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">
                    {flow.scopes?.length ?? 0} group{flow.scopes?.length === 1 ? '' : 's'} &middot; v{flow.version}
                    {!flow.samplePayload && ' \u00b7 needs an example payload'}
                  </td>
                  <td className="p-table-cell-padding text-right">
                    <div className="flex items-center justify-end gap-md">
                      <button
                        onClick={(e) => handleDelete(flow, e)}
                        className="font-body-sm text-body-sm text-error opacity-0 transition-opacity hover:underline group-hover:opacity-100"
                      >
                        Delete
                      </button>
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">arrow_forward</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
