// apps/web/components/flow-builder/FlowNodeCard.tsx
//
// One component for every node type - category, label come from the
// NodeTypeRegistry, not hardcoded per type. Config editing moved OUT of this
// card into NodeConfigPanel (left-docked, replacing the palette on select) -
// this card now stays a fixed, compact size whether selected or not, rather
// than expanding in place on the canvas.

import React from 'react';
import { Handle, Position } from 'reactflow';
import { getNodeType, NodeCategory } from '@workspace/flow-compiler';

const CATEGORY_STYLES: Record<NodeCategory, { accent: string; badgeBg: string; badgeText: string }> = {
  control: { accent: '#F0A93E', badgeBg: '#FEF3E2', badgeText: '#92620C' },
  check: { accent: '#2F6FED', badgeBg: '#EAF1FE', badgeText: '#1D4ED8' },
  transform: { accent: '#2F6FED', badgeBg: '#EAF1FE', badgeText: '#1D4ED8' },
  action: { accent: '#0EA5A5', badgeBg: '#E6FBFB', badgeText: '#0F766E' },
  aggregation: { accent: '#E8577A', badgeBg: '#FDECF0', badgeText: '#BE185D' },
  output: { accent: '#22C55E', badgeBg: '#EAFBF0', badgeText: '#15803D' },
};

export interface FlowNodeCardData {
  nodeType: string;
  config: Record<string, unknown>;
  hasError: boolean;
  errorMessage?: string;
  selected: boolean;
}

export function FlowNodeCard({ data }: { data: FlowNodeCardData }) {
  const def = getNodeType(data.nodeType);
  const styles = CATEGORY_STYLES[def.category];

  return (
    <div
      className={`w-64 rounded-xl border bg-white shadow-sm transition-all ${
        data.hasError ? 'border-red-400 shadow-red-100' : 'border-gray-200'
      } ${data.selected ? 'ring-2 ring-offset-1' : ''}`}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: styles.accent,
        ...(data.selected ? ({ '--tw-ring-color': styles.accent } as React.CSSProperties) : {}),
        ...(data.hasError ? { animation: 'flowNodePulse 1.8s ease-in-out infinite' } : {}),
      }}
    >
      {def.type !== 'documentInput' && <Handle type="target" position={Position.Top} className="!bg-gray-300" />}

      <div className="px-4 py-3">
        <span
          className="mb-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: styles.badgeBg, color: styles.badgeText }}
        >
          {def.category}
        </span>
        <div className="text-sm font-semibold text-gray-900">{def.label}</div>
        <p className="mt-1 text-xs leading-snug text-gray-500">{def.description}</p>
      </div>

      {data.hasError && (
        <div className="rounded-b-xl border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
          {data.errorMessage}
        </div>
      )}

      {def.canHaveOutput && def.branches && (
        <>
          <Handle type="source" position={Position.Bottom} id="true" style={{ left: '30%', background: '#22C55E' }} />
          <Handle type="source" position={Position.Bottom} id="false" style={{ left: '70%', background: '#EF4444' }} />
        </>
      )}
      {def.canHaveOutput && !def.branches && (
        <Handle type="source" position={Position.Bottom} className="!bg-gray-300" />
      )}
    </div>
  );
}
