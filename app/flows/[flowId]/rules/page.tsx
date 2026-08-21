// web/app/flows/[flowId]/rules/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import { Rule } from '../../../../lib/types';

export default function RulesPage() {
  const { flowId } = useParams<{ flowId: string }>();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listRules(flowId)
      .then(setRules)
      .finally(() => setLoading(false));
  }, [flowId]);

  return (
    <div className="max-w-3xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-medium">Rules</h1>
        <Link
          href={`/flows/${flowId}/rules/new`}
          className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          New rule
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-2 font-medium">Rule ID</th>
              <th className="py-2 font-medium">Scope</th>
              <th className="py-2 font-medium">Kind</th>
              <th className="py-2 font-medium">Severity</th>
              <th className="py-2 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.ruleId} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2">
                  <Link href={`/flows/${flowId}/rules/${r.ruleId}`} className="text-blue-600 hover:underline font-mono">
                    {r.ruleId}
                  </Link>
                </td>
                <td className="py-2 font-mono text-gray-600">{r.scopeId}</td>
                <td className="py-2">{r.kind}</td>
                <td className="py-2">{r.severity ?? '—'}</td>
                <td className="py-2">{r.active ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
