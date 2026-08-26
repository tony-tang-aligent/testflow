// web/components/nodes/StartNode.tsx
//
// Matches Shopify Flow's actual trigger-step behavior exactly (confirmed via
// Shopify Help Center): the step itself is passive - hovering it reveals a "+"
// below it, which is the only way to add the next step. Not a persistent button,
// not clickable itself.

import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export interface StartNodeData {
  onAddScope: () => void;
}

export function StartNode({ data }: NodeProps<StartNodeData>) {
  return (
    <div className="group relative">
      <div className="rounded-full border-2 border-gray-900 bg-gray-900 px-5 py-2 text-sm font-medium text-white shadow-sm transition-all group-hover:shadow-md">
        Start
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-900" />
      <button
        onClick={data.onAddScope}
        className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-600 opacity-0 shadow transition-opacity group-hover:opacity-100 hover:bg-gray-50"
        title="Add a group to repeat rules over"
      >
        +
      </button>
    </div>
  );
}
