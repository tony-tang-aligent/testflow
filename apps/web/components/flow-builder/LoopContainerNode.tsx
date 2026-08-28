// apps/web/components/flow-builder/LoopContainerNode.tsx
//
// arrayPath is now editable directly in the header, via the real FieldPicker
// component (not a plain text stand-in) - not opened in the side panel
// anymore. That panel's full-screen invisible backdrop closes on any click
// outside it, which is fine for a normal node (configure one thing, move on)
// but was actively fighting this node's actual workflow: you need to keep
// dragging children into it and connecting them WHILE it's "selected." Since
// arrayPath was its only config field anyway, moving it inline removes the
// side panel from this node type entirely, rather than working around the
// backdrop. FieldPicker itself has no backdrop of its own (a plain
// absolutely-positioned dropdown, closes only via its own toggle button), so
// embedding it here doesn't reintroduce the same problem.
//
// Deliberately only a TARGET handle, no source handle - the compiler now
// derives "what happens after the loop" from a CHILD's own outgoing edge to
// something outside the container, not from an edge on the container itself
// (see compiler.ts's resumeEdge logic). Giving this a source handle would
// let you draw a connection the compiler silently ignores - actively
// misleading, not just unused.

import React from 'react';
import { Handle, NodeResizer, Position } from 'reactflow';
import { FieldPicker } from './FieldPicker';

const ACCENT = '#F0A93E'; // matches 'control' category's accent everywhere else

export interface LoopContainerData {
  config: Record<string, unknown>;
  hasError: boolean;
  errorMessage?: string;
  selected: boolean;
  samplePayload?: Record<string, unknown>;
  onConfigChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}

export function LoopContainerNode({ data }: { data: LoopContainerData }) {
  return (
    <>
      <NodeResizer
        color={ACCENT}
        isVisible={data.selected}
        minWidth={320}
        minHeight={220}
        handleStyle={{ width: 8, height: 8 }}
      />
      <Handle type="target" position={Position.Top} className="!h-3.5 !w-3.5 !border-2 !border-outline !bg-background" />

      <div
        className={`relative h-full w-full rounded-lg border border-dashed bg-surface-container-lowest ${
          data.hasError ? 'border-error' : 'border-outline'
        }`}
        style={data.hasError ? { animation: 'flowNodePulse 1.8s ease-in-out infinite' } : undefined}
      >
        <div className="absolute -top-3 left-4 flex items-center gap-1 rounded border border-outline-variant bg-background px-2 font-label-caps text-label-caps text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">repeat</span>
          Loop: repeatForEach
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            data.onDelete();
          }}
          className="nodrag absolute -top-3 right-4 rounded border border-outline-variant bg-background px-1.5 font-label-caps text-label-caps text-error hover:bg-error-container/20"
          title="Delete this loop (children are kept, not deleted, but become unattached)"
        >
          Delete
        </button>
        <div className="nodrag nopan px-3 pt-6" onClick={(e) => e.stopPropagation()}>
          <FieldPicker
            samplePayload={data.samplePayload ? { payload: data.samplePayload } : undefined}
            value={String(data.config.arrayPath ?? '')}
            onChange={(v) => data.onConfigChange({ arrayPath: v })}
            placeholder="e.g. payload.lineItems"
          />
        </div>
      </div>

      {data.hasError && (
        <div className="absolute -bottom-7 left-0 right-0 rounded bg-error-container/20 px-2 py-1 text-center font-body-sm text-body-sm text-error">
          {data.errorMessage}
        </div>
      )}
    </>
  );
}
