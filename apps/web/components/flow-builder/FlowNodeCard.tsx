// apps/web/components/flow-builder/FlowNodeCard.tsx
//
// One component for every node type - category, label come from the
// NodeTypeRegistry, not hardcoded per type. Config editing moved OUT of this
// card into NodeConfigPanel (left-docked, replacing the palette on select) -
// this card now stays a fixed, compact size whether selected or not, rather
// than expanding in place on the canvas.
//
// Badge colors are now dark-mode-appropriate (tinted background + light
// accent text), not the light-mode pastel pairs this had before - matching
// the M3 design spec's node card treatment.

import React from 'react';
import { Handle, Position } from 'reactflow';
import { getNodeType, NodeCategory } from '@workspace/flow-compiler';

const CATEGORY_STYLES: Record<NodeCategory, { accent: string; badgeBg: string; badgeText: string }> = {
  control: { accent: '#F0A93E', badgeBg: 'rgba(240,169,62,0.15)', badgeText: '#F0A93E' },
  check: { accent: '#2F6FED', badgeBg: 'rgba(47,111,237,0.15)', badgeText: '#7DA6FF' },
  transform: { accent: '#2F6FED', badgeBg: 'rgba(47,111,237,0.15)', badgeText: '#7DA6FF' },
  action: { accent: '#0EA5A5', badgeBg: 'rgba(14,165,165,0.15)', badgeText: '#5FD4D4' },
  aggregation: { accent: '#E8577A', badgeBg: 'rgba(232,87,122,0.15)', badgeText: '#F397AC' },
  output: { accent: '#22C55E', badgeBg: 'rgba(34,197,94,0.15)', badgeText: '#6EE0A0' },
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
      className={`w-64 rounded-xl border border-outline-variant bg-surface shadow-sm transition-all ${
        data.hasError ? 'border-error' : ''
      } ${data.selected ? 'ring-2 ring-offset-1 ring-offset-background' : ''}`}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: styles.accent,
        ...(data.selected ? ({ '--tw-ring-color': styles.accent } as React.CSSProperties) : {}),
        ...(data.hasError ? { animation: 'flowNodePulse 1.8s ease-in-out infinite' } : {}),
      }}
    >
      {def.type !== 'documentInput' && <Handle type="target" position={Position.Top} className="!bg-outline" />}

      <div className="px-4 py-3">
        <span
          className="mb-1.5 inline-block rounded px-1.5 py-0.5 font-label-caps text-label-caps uppercase tracking-wide"
          style={{ background: styles.badgeBg, color: styles.badgeText }}
        >
          {def.category}
        </span>
        <div className="font-body-base text-body-base font-semibold text-on-surface">{def.label}</div>
        <p className="mt-1 font-body-sm text-body-sm leading-snug text-on-surface-variant">{def.description}</p>
      </div>

      {data.hasError && (
        <div className="rounded-b-xl border-t border-error/30 bg-error-container/20 px-4 py-2 font-body-sm text-body-sm text-error">
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
        <Handle type="source" position={Position.Bottom} className="!bg-outline" />
      )}
    </div>
  );
}
