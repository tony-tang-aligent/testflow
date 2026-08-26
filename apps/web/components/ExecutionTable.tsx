// web/components/ExecutionTable.tsx
import React from 'react';
import Link from 'next/link';
import { ExecutionSummary } from '../lib/types';
import { StatusBadge } from './StatusBadge';

export function ExecutionTable({ executions }: { executions: ExecutionSummary[] }) {
  if (executions.length === 0) {
    return <p className="text-sm text-gray-500">No executions yet.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
          <th className="py-2 font-medium">Order</th>
          <th className="py-2 font-medium">Status</th>
          <th className="py-2 font-medium">Violations</th>
          <th className="py-2 font-medium">Evaluated at</th>
        </tr>
      </thead>
      <tbody>
        {executions.map((e) => (
          <tr key={e.executionId} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-2">
              <Link
                href={`/clients/${e.tenantId}/flows/${e.flowId}/executions/${e.executionId}`}
                className="text-blue-600 hover:underline"
              >
                {e.orderId}
              </Link>
            </td>
            <td className="py-2">
              <StatusBadge status={e.status} />
            </td>
            <td className="py-2">{e.violationCount}</td>
            <td className="py-2 text-gray-500">{new Date(e.evaluatedAt).toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
