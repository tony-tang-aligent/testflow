// apps/web/components/flow-builder/FieldPicker.tsx
//
// Reuses the exact tree-browsing pattern already proven in the original
// validator (lib/fieldTree.ts) - same underlying buildFieldTree/getValueAtPath
// helpers, just a more compact popover suited to sitting inside a narrow
// config panel rather than a full side panel.

import React, { useState } from 'react';
import { FieldNode, buildFieldTree } from '../../lib/fieldTree';

function TreeBranch({
  node,
  onPick,
  depth = 0,
}: {
  node: FieldNode;
  onPick: (path: string) => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = !!node.children?.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => (hasChildren ? setOpen((o) => !o) : onPick(node.path))}
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs hover:bg-gray-100"
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {hasChildren && <span className="text-gray-400">{open ? '▾' : '▸'}</span>}
        <span className={hasChildren ? 'font-medium text-gray-700' : 'text-gray-600'}>{node.label}</span>
        {!hasChildren && <span className="ml-auto truncate text-gray-400">{node.preview}</span>}
      </button>
      {hasChildren && open && (
        <div>
          {node.children!.map((child) => (
            <TreeBranch key={child.path} node={child} onPick={onPick} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FieldPicker({
  samplePayload,
  value,
  onChange,
  placeholder,
}: {
  samplePayload?: Record<string, unknown>;
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const tree = samplePayload ? buildFieldTree(samplePayload) : null;

  return (
    <div className="relative">
      <div className="flex gap-1">
        <input
          className="w-full rounded border border-gray-200 px-2 py-1.5 font-mono text-xs"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={!tree}
          title={tree ? 'Browse sample payload' : 'Set a sample payload first'}
          className="shrink-0 rounded border border-gray-200 px-2 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          ⌄
        </button>
      </div>
      {open && tree && (
        <div className="absolute z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
          <TreeBranch
            node={tree}
            onPick={(path) => {
              onChange(path === '$' ? '' : path);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
