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
  restrictTo,
}: {
  node: FieldNode;
  onPick: (path: string) => void;
  depth?: number;
  // When set, only nodes of this kind can actually be picked - everything
  // else still expands (so you can browse THROUGH an object to find an
  // array nested inside it), but clicking it doesn't produce a value.
  // Without this, arrays were never selectable at all: they have children
  // (their item shape), so the old logic always expanded them on click and
  // there was no way to pick the array node itself - only leaves ever
  // produced a path, which is exactly the bug this fixes.
  restrictTo?: 'array';
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = !!node.children?.length;
  const isPickable = !restrictTo || node.kind === restrictTo;

  return (
    <div>
      <div
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 hover:bg-surface-container-highest"
        style={{ paddingLeft: 6 + depth * 12 }}
      >
        {hasChildren && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-on-surface-variant"
            aria-label={open ? 'Collapse' : 'Expand'}
          >
            {open ? '▾' : '▸'}
          </button>
        )}
        <button
          type="button"
          onClick={() => isPickable && onPick(node.path)}
          disabled={!isPickable}
          className={`flex flex-1 items-center gap-1.5 text-left font-body-sm text-body-sm ${
            isPickable ? '' : 'cursor-default opacity-40'
          }`}
          title={
            !isPickable && restrictTo
              ? `Not a${restrictTo === 'array' ? 'n array' : ''} - only ${restrictTo}s can be picked here`
              : undefined
          }
        >
          <span className={hasChildren ? 'font-medium text-on-surface' : 'text-on-surface-variant'}>{node.label}</span>
          {!hasChildren && (
            <span className="ml-auto truncate font-code-sm text-code-sm text-on-surface-variant">{node.preview}</span>
          )}
          {restrictTo && node.kind === restrictTo && (
            <span className="ml-auto rounded bg-primary-container/20 px-1 font-code-sm text-[10px] text-primary">
              select
            </span>
          )}
        </button>
      </div>
      {hasChildren && open && (
        <div>
          {node.children!.map((child) => (
            <TreeBranch key={child.path} node={child} onPick={onPick} depth={depth + 1} restrictTo={restrictTo} />
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
  // When true, a picked field is inserted as {{path}} appended to the
  // current value, not a bare path replacing it - what a key-value mapper
  // row's value needs (interpolation syntax), vs. what fieldPath/comparedTo
  // need (the raw path itself, since those are read directly, never
  // interpolated).
  insertAsPlaceholder,
  // Passed straight through to the tree - see TreeBranch's own comment for
  // why this needed a real fix, not just a warning after the fact.
  restrictTo,
}: {
  samplePayload?: Record<string, unknown>;
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  insertAsPlaceholder?: boolean;
  restrictTo?: 'array';
}) {
  const [open, setOpen] = useState(false);
  const tree = samplePayload ? buildFieldTree(samplePayload) : null;

  return (
    <div className="relative">
      <div className="flex gap-1">
        <input
          className="w-full rounded border border-outline-variant bg-background px-2 py-1.5 font-code-sm text-code-sm text-on-surface focus:border-primary focus:outline-none"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={!tree}
          title={tree ? 'Browse sample payload' : 'Set a sample payload first'}
          className="shrink-0 rounded border border-outline-variant px-2 text-body-sm text-on-surface-variant hover:bg-surface-variant disabled:opacity-40"
        >
          ⌄
        </button>
      </div>
      {open && tree && (
        <div className="absolute z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-high p-1 shadow-lg">
          <TreeBranch
            node={tree}
            restrictTo={restrictTo}
            onPick={(path) => {
              if (path === '$') {
                setOpen(false);
                return;
              }
              onChange(insertAsPlaceholder ? `${value}{{${path}}}` : path);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
