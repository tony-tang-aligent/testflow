// web/components/nodes/ScopeNode.tsx
//
// Visual representation of a ScopeDefinition. Rules attach underneath via an edge
// drawn from this node's bottom handle - that edge is what determines a rule's
// scopeId when the canvas is saved (see app/canvas/page.tsx#handleSave).
//
// Single click (not double-click) opens the side panel - dragging is still
// distinguished automatically by ReactFlow (a real pointer-move-drag never
// fires onClick), so this doesn't conflict with repositioning the node.
//
// Hovering reveals a "+" button - the quick-add affordance for "the next
// available node": clicking it creates a new validation rule already wired to
// this scope, skipping the palette-drag step for the common case.

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export interface ScopeNodeData {
  scopeId: string;
  itemsPath: string;
  label?: string; // friendly display label, e.g. "each line item" or "the whole order"
  onEdit: (id: string) => void;
  onQuickAddRule: (scopeNodeId: string) => void;
}

export function ScopeNode({ id, data, selected }: NodeProps<ScopeNodeData>) {
  const isUnconfigured = !data.scopeId;

  return (
    <div
      onClick={() => data.onEdit(id)}
      className={`group relative min-w-[170px] cursor-pointer rounded-lg border-2 px-4 py-2.5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 ${
        isUnconfigured ? 'border-dashed border-primary/40 bg-primary-container/10' : 'bg-primary-container/15 border-primary/30'
      } ${selected ? 'ring-2 ring-offset-1 ring-primary ring-offset-background' : ''}`}
    >
      <div className="font-label-caps text-label-caps text-primary uppercase tracking-wide">Repeat for</div>
      {isUnconfigured ? (
        <div className="font-body-sm text-body-sm italic text-primary/70">Click to choose what to repeat over</div>
      ) : (
        <div className="font-body-sm text-body-sm font-medium text-on-surface">{data.label || data.scopeId}</div>
      )}
      <Handle type="target" position={Position.Top} className="!bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />

      <button
        onClick={(e) => {
          e.stopPropagation();
          data.onQuickAddRule(id);
        }}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-primary/30 bg-surface-container px-2 py-0.5 font-body-sm text-body-sm font-medium text-primary opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-surface-container-highest"
        title="Add a rule to this group"
      >
        + rule
      </button>
    </div>
  );
}
