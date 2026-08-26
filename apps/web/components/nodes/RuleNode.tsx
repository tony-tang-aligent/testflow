// web/components/nodes/RuleNode.tsx
//
// Visual representation of a single Rule. Single click opens the side panel
// (SentenceRuleEditor) - the canvas is for organizing rules into groups and
// seeing dependencies; the actual resolve/compare authoring happens there.

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Rule } from '../../lib/types';

export interface RuleNodeData {
  rule: Rule;
  onEdit: (id: string) => void;
}

const KIND_COLOR: Record<Rule['kind'], string> = {
  derivation: 'bg-amber-50 border-amber-200 text-amber-900',
  validation: 'bg-emerald-50 border-emerald-200 text-emerald-900',
};

const KIND_LABEL: Record<Rule['kind'], string> = {
  derivation: 'Save a value',
  validation: 'Compare values',
};

function isUnconfigured(rule: Rule): boolean {
  return rule.ruleId.startsWith('new-rule-');
}

export function RuleNode({ id, data, selected }: NodeProps<RuleNodeData>) {
  const { rule } = data;
  const unconfigured = isUnconfigured(rule);
  const colorClass = KIND_COLOR[rule.kind];

  return (
    <div
      onClick={() => data.onEdit(id)}
      className={`min-w-[180px] cursor-pointer rounded-lg border-2 px-3 py-2 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${colorClass} ${
        unconfigured ? 'border-dashed' : ''
      } ${selected ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide opacity-70">{KIND_LABEL[rule.kind]}</span>
        {rule.severity && (
          <span className="text-[10px] rounded-full bg-white/70 px-1.5 py-0.5 font-medium">
            {rule.severity === 'block' ? 'Stops order' : 'Flags only'}
          </span>
        )}
      </div>
      {unconfigured ? (
        <div className="text-sm italic opacity-60">Click to configure</div>
      ) : (
        <div className="text-sm opacity-90 max-w-[200px]">{rule.message || rule.writesTo || rule.ruleId}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}
