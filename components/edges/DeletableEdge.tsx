// web/components/edges/DeletableEdge.tsx
//
// Matches Shopify Flow's documented connection-removal pattern: "hover over the
// arrow that you want to remove, and then click the icon." Used only for
// scope -> rule membership edges - the one connection a person actually manages
// by hand. Start/End edges and derivation-dependency edges stay the default,
// non-deletable, cosmetic edge type.

import React, { useState } from 'react';
import { EdgeProps, getBezierPath, EdgeLabelRenderer, BaseEdge } from 'reactflow';

export interface DeletableEdgeData {
  onDelete: (edgeId: string) => void;
}

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps<DeletableEdgeData>) {
  const [hovered, setHovered] = useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      {/* Wide, invisible hit-target - the visible line itself is too thin to hover reliably */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ cursor: 'pointer' }}
      />
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {hovered && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: 'all' }}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <button
              onClick={() => data?.onDelete(id)}
              className="flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 bg-white text-xs text-gray-500 shadow hover:border-red-300 hover:bg-red-50 hover:text-red-600"
              title="Remove this connection"
            >
              ×
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
