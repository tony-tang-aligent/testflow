// apps/web/components/flow-builder/LoopContainerNode.tsx
//
// The actual UX fix - repeatForEach now renders as a large, resizable
// container instead of a small fixed-size card. Dragging another node inside
// this visual boundary (handled in the canvas page's onNodeDragStop) is what
// sets that node's parentId, making loop membership something you can see,
// not something you'd have to trace edges to figure out.
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
            <Handle type="target" position={Position.Top} className="!bg-gray-300" />

            <div
                className={`h-full w-full rounded-xl border-2 border-dashed bg-amber-50/40 ${
                    data.hasError ? 'border-red-400' : 'border-amber-300'
                }`}
                style={data.hasError ? { animation: 'flowNodePulse 1.8s ease-in-out infinite' } : undefined}
            >
                <div className="flex items-center gap-1.5 border-b-2 border-dashed border-amber-300 bg-amber-100/60 px-3 py-1.5">
                    <span className="text-sm">🔁</span>
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Repeat For Each</span>
                    <span className="ml-1 rounded bg-white/70 px-1.5 py-0.5 font-mono text-[11px] text-amber-900">
            {arrayPath}
          </span>
                </div>
            </div>

            {data.hasError && (
                <div className="absolute -bottom-7 left-0 right-0 rounded bg-red-50 px-2 py-1 text-center text-xs text-red-600">
                    {data.errorMessage}
                </div>
            )}
        </>
    );
}