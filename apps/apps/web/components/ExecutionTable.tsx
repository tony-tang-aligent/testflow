// web/components/ExecutionTable.tsx
import React from 'react';
import Link from 'next/link';
import { ExecutionSummary } from '../lib/types';
import { StatusBadge } from './StatusBadge';

export function ExecutionTable({ executions }: { executions: ExecutionSummary[] }) {
  if (executions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-outline-variant p-12 text-center">
        <p className="font-body-sm text-body-sm text-on-surface-variant">No executions yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
      <table className="w-full border-collapse text-left">
        <thead className="border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
          <tr>
            <th className="p-table-cell-padding font-medium">Order</th>
            <th className="p-table-cell-padding font-medium">Status</th>
            <th className="p-table-cell-padding font-medium">Violations</th>
            <th className="p-table-cell-padding font-medium">Evaluated at</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant font-body-base text-body-base text-on-surface">
          {executions.map((e) => (
            <tr key={e.executionId} className="transition-colors hover:bg-surface-container-highest">
              <td className="p-table-cell-padding">
                <Link
                  href={`/clients/${e.tenantId}/flows/${e.flowId}/executions/${e.executionId}`}
                  className="font-code-sm text-code-sm text-primary hover:underline"
                >
                  {e.orderId}
                </Link>
              </td>
              <td className="p-table-cell-padding">
                <StatusBadge status={e.status} />
              </td>
              <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">
                {e.violationCount}
              </td>
              <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">
                {new Date(e.evaluatedAt).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
