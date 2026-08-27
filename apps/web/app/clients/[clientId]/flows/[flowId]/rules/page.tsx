// web/app/flows/[flowId]/rules/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../../../../lib/api';
import { Rule } from '../../../../../../lib/types';

export default function RulesPage() {
  const { clientId, flowId } = useParams<{ clientId: string; flowId: string }>();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listRules(clientId, flowId)
      .then(setRules)
      .finally(() => setLoading(false));
  }, [clientId, flowId]);

  return (
    <div className="mx-auto max-w-3xl space-y-lg p-layout-margin">
      <div className="flex items-center justify-between">
        <h1 className="font-display-lg text-display-lg text-on-surface">Rules</h1>
        <Link
          href={`/clients/${clientId}/flows/${flowId}/rules/new`}
          className="rounded bg-primary px-3 py-1.5 font-body-sm text-body-sm font-medium text-on-primary"
        >
          New rule
        </Link>
      </div>

      {loading ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-outline-variant bg-surface-container">
          <table className="w-full border-collapse text-left">
            <thead className="border-b border-outline-variant bg-surface-container-low font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              <tr>
                <th className="p-table-cell-padding font-medium">Rule ID</th>
                <th className="p-table-cell-padding font-medium">Scope</th>
                <th className="p-table-cell-padding font-medium">Kind</th>
                <th className="p-table-cell-padding font-medium">Severity</th>
                <th className="p-table-cell-padding font-medium">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant font-body-base text-body-base text-on-surface">
              {rules.map((r) => (
                <tr key={r.ruleId} className="transition-colors hover:bg-surface-container-highest">
                  <td className="p-table-cell-padding">
                    <Link
                      href={`/clients/${clientId}/flows/${flowId}/rules/${r.ruleId}`}
                      className="font-code-sm text-code-sm text-primary hover:underline"
                    >
                      {r.ruleId}
                    </Link>
                  </td>
                  <td className="p-table-cell-padding font-code-sm text-code-sm text-on-surface-variant">{r.scopeId}</td>
                  <td className="p-table-cell-padding">{r.kind}</td>
                  <td className="p-table-cell-padding">{r.severity ?? '—'}</td>
                  <td className="p-table-cell-padding">{r.active ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
