// web/app/flows/[flowId]/rules/[ruleId]/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../../../lib/api';
import { Rule } from '../../../../../lib/types';
import { RuleForm } from '../../../../../components/RuleForm';

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
  const params = useParams<{ flowId: string; ruleId: string }>();
  const router = useRouter();
  const isNew = params.ruleId === 'new';

  const [rule, setRule] = useState<Rule | null>(isNew ? blankRule(params.flowId) : null);

  useEffect(() => {
    if (!isNew) {
      api.getRule(params.flowId, params.ruleId).then(setRule);
    }
  }, [isNew, params.flowId, params.ruleId]);

  if (!rule) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="p-6">
      <h1 className="text-lg font-medium mb-4">{isNew ? 'New rule' : `Rule: ${rule.ruleId}`}</h1>
      <RuleForm
        initial={rule}
        onSave={async (r) => {
          await api.saveRule(params.flowId, r.ruleId, r);
          router.push(`/flows/${params.flowId}/rules`);
        }}
      />
    </div>
  );
}
