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
    <div className="max-w-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">Executions</h1>
        <select
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="needs_review">Needs review</option>
          <option value="passed">Passed</option>
          <option value="warned">Warned</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {loading ? <p className="text-sm text-gray-500">Loading…</p> : <ExecutionTable executions={executions} />}
    </div>
  );
}
