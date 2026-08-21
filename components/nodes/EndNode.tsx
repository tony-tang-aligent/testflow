// web/components/nodes/EndNode.tsx
//
// Purely a visual anchor - "every scope's rules are evaluated, then aggregated
// here." Corresponds conceptually to the `aggregate` Lambda from the backend
// scoping, but isn't itself editable or saved - it's just a landing point on the
// canvas so the graph reads top-to-bottom like a real flow.

import React from 'react';
import { Handle, Position } from 'reactflow';

export function EndNode() {
  return (
    <div className="rounded-full border-2 border-gray-900 bg-white px-5 py-2 text-sm font-medium text-gray-900 shadow-sm">
      <Handle type="target" position={Position.Top} className="!bg-gray-900" />
      Aggregate &amp; end
    </div>
  );
}
