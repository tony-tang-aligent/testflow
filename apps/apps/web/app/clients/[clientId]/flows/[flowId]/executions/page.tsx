// web/app/flows/[flowId]/executions/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api } from '../../../../../../lib/api';
import { ExecutionSummary } from '../../../../../../lib/types';
import { ExecutionTable } from '../../../../../../components/ExecutionTable';

export default function ExecutionsPage() {
  const { clientId, flowId } = useParams<{ clientId: string; flowId: string }>();
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .listExecutions(clientId, flowId, statusFilter || undefined)
      .then(setExecutions)
      .finally(() => setLoading(false));
  }, [clientId, flowId, statusFilter]);

  return (
    <div className="mx-auto max-w-4xl space-y-lg p-layout-margin">
      <div>
        <h1 className="font-display-lg text-display-lg text-on-surface">Logs</h1>
        <p className="mt-xs font-body-sm text-body-sm text-on-surface-variant">Validation runs for this flow</p>
      </div>

      {/* Only a real, functional filter - status, already wired to the API.
          The reference design's "All Clients" filter and "Live Stream
          Active" indicator don't apply: this page is already scoped to one
          client/flow via the URL, and nothing here streams in real time -
          it's a plain fetch on mount/filter-change, not a live socket. */}
      <div className="flex flex-wrap items-center gap-md rounded-lg border border-outline-variant bg-surface-container-low p-md">
        <div className="flex items-center gap-sm rounded border border-outline-variant bg-surface-container px-sm py-xs">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">filter_list</span>
          <select
            className="h-auto border-none bg-transparent p-0 font-body-sm text-body-sm text-on-surface focus:outline-none focus:ring-0"
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

      {loading ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Loading…</p>
      ) : (
        <ExecutionTable executions={executions} />
      )}
    </div>
  );
}
