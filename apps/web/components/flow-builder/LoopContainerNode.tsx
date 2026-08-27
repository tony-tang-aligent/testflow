// apps/web/components/flow-builder/LoopContainerNode.tsx
//
// Matches the design spec's own loop-container treatment exactly
// (surface-container-lowest + dashed outline + a floating label chip), not
// a generic amber-tinted box - the spec already designed this pattern, this
// just ports it in. Material Symbols "repeat" icon instead of an emoji, for
// consistency with the rest of this icon system.
//
// Deliberately only a TARGET handle, no source handle - the compiler now
// derives "what happens after the loop" from a CHILD's own outgoing edge to
// something outside the container, not from an edge on the container itself
// (see compiler.ts's resumeEdge logic). Giving this a source handle would
// let you draw a connection the compiler silently ignores - actively
// misleading, not just unused.

import React from 'react';
import { Handle, NodeResizer, Position } from 'reactflow';

const ACCENT = '#F0A93E'; // matches 'control' category's accent everywhere else

export interface LoopContainerData {
  config: Record<string, unknown>;
  hasError: boolean;
  errorMessage?: string;
  selected: boolean;
}

export function LoopContainerNode({ data }: { data: LoopContainerData }) {
  const arrayPath = String(data.config.arrayPath ?? '(no array field set)');

  return (
    <>
      <NodeResizer
        color={ACCENT}
        isVisible={data.selected}
        minWidth={320}
        minHeight={220}
        handleStyle={{ width: 8, height: 8 }}
      />
      <Handle type="target" position={Position.Top} className="!bg-outline" />

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
        <div className="px-4 pt-6 font-code-sm text-code-sm text-on-surface-variant">{arrayPath}</div>
      </div>

      {data.hasError && (
        <div className="absolute -bottom-7 left-0 right-0 rounded bg-error-container/20 px-2 py-1 text-center font-body-sm text-body-sm text-error">
          {data.errorMessage}
        </div>
      )}
    </>
  );
}
