// web/app/flows/[flowId]/layout.tsx
//
// Sub-nav for everything scoped to one specific flow. Split out from the root
// layout since Canvas/Rules/Executions only make sense once a flow is selected -
// the /flows list page itself uses the plain root layout with no sub-nav.

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { api } from '../../../lib/api';

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  const { flowId } = useParams<{ flowId: string }>();
  const pathname = usePathname();
  const [flowName, setFlowName] = useState<string | null>(null);

  useEffect(() => {
    api
      .getFlowDefinition(flowId)
      .then((flow) => setFlowName(flow.name))
      .catch(() => setFlowName(null));
  }, [flowId]);

  const isCanvas = pathname?.includes('/canvas');
  const isRules = pathname?.includes('/rules');
  const isExecutions = pathname?.includes('/executions');

  const linkClass = (active: boolean) =>
    `text-sm ${active ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-900'}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-6 border-b border-gray-200 bg-white px-6 py-2.5">
        <Link href="/flows" className="text-sm text-gray-400 hover:text-gray-700">
          &larr; All flows
        </Link>
        <span className="text-sm font-medium text-gray-900">{flowName ?? '\u2026'}</span>
        <div className="flex gap-4">
          <Link href={`/flows/${flowId}/canvas`} className={linkClass(!!isCanvas)}>
            Canvas
          </Link>
          <Link href={`/flows/${flowId}/rules`} className={linkClass(!!isRules)}>
            Rules
          </Link>
          <Link href={`/flows/${flowId}/executions`} className={linkClass(!!isExecutions)}>
            Executions
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
