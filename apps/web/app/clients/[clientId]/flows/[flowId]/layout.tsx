// web/app/flows/[flowId]/layout.tsx
//
// Sub-nav for everything scoped to one specific flow. Split out from the root
// layout since Canvas/Rules/Executions only make sense once a flow is selected -
// the /flows list page itself uses the plain root layout with no sub-nav.

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { api } from '../../../../../lib/api';

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  const { clientId, flowId } = useParams<{ clientId: string; flowId: string }>();
  const pathname = usePathname();
  const [flowName, setFlowName] = useState<string | null>(null);

  useEffect(() => {
    api
      .getFlowDefinition(clientId, flowId)
      .then((flow) => setFlowName(flow.name))
      .catch(() => setFlowName(null));
  }, [clientId, flowId]);

  const isCanvas = pathname?.includes('/canvas');
  const isRules = pathname?.includes('/rules');
  const isExecutions = pathname?.includes('/executions');

  const linkClass = (active: boolean) =>
    `font-body-sm text-body-sm ${active ? 'font-medium text-on-surface' : 'text-on-surface-variant hover:text-on-surface'}`;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-6 border-b border-outline-variant bg-surface px-6 py-2.5">
        <Link href={`/clients/${clientId}/flows`} className="font-body-sm text-body-sm text-on-surface-variant hover:text-on-surface">
          &larr; All flows
        </Link>
        <span className="font-body-sm text-body-sm font-medium text-on-surface">{flowName ?? '\u2026'}</span>
        <div className="flex gap-4">
          <Link href={`/clients/${clientId}/flows/${flowId}/canvas`} className={linkClass(!!isCanvas)}>
            Canvas
          </Link>
          <Link href={`/clients/${clientId}/flows/${flowId}/rules`} className={linkClass(!!isRules)}>
            Rules
          </Link>
          <Link href={`/clients/${clientId}/flows/${flowId}/executions`} className={linkClass(!!isExecutions)}>
            Executions
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
