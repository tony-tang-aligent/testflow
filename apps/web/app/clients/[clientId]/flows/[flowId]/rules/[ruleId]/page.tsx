// web/app/flows/[flowId]/rules/[ruleId]/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../../../../../lib/api';
import { Rule } from '../../../../../../../lib/types';
import { RuleForm } from '../../../../../../../components/RuleForm';

function blankRule(flowId: string): Rule {
  return {
    tenantId: '', // set server-side from auth context on save
    flowId,
    ruleId: '',
    version: 0,
    active: true,
    scopeId: 'lineItem',
    kind: 'validation',
  };
}

export default function RuleEditorPage() {
  const params = useParams<{ clientId: string; flowId: string; ruleId: string }>();
  const router = useRouter();
  const isNew = params.ruleId === 'new';

  const [rule, setRule] = useState<Rule | null>(isNew ? blankRule(params.flowId) : null);

  useEffect(() => {
    if (!isNew) {
      api.getRule(params.clientId, params.flowId, params.ruleId).then(setRule);
    }
  }, [isNew, params.clientId, params.flowId, params.ruleId]);

  if (!rule) return <p className="p-6 font-body-sm text-body-sm text-on-surface-variant">Loading…</p>;

  return (
    <div className="p-layout-margin">
      <h1 className="mb-4 font-display-lg text-display-lg text-on-surface">
        {isNew ? 'New rule' : `Rule: ${rule.ruleId}`}
      </h1>
      <RuleForm
        initial={rule}
        onSave={async (r) => {
          await api.saveRule(params.clientId, params.flowId, r.ruleId, r);
          router.push(`/clients/${params.clientId}/flows/${params.flowId}/rules`);
        }}
      />
    </div>
  );
}
