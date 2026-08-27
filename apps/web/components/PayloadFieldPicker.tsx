// web/components/PayloadFieldPicker.tsx
//
// The single component that replaces every "type a dot-path" text input in the
// old design. Given a sample value, renders it as an expandable tree the person
// clicks through - exactly the "insert field" pill pattern from Zapier, just
// sourced from a pasted example instead of a live test run (we don't have a
// running trigger to sample from the way Zapier/Shopify Flow do).
//
// Two modes:
// - 'leaf': only string/number/boolean/null fields are selectable (for resolver
//   values being compared)
// - 'array': only array fields are selectable (for "repeat for each..." scope
//   creation) - the whole root is also offered as a "the whole order, once" option

import React, { useState } from 'react';
import { FieldNode } from '../lib/fieldTree';

const KIND_BADGE: Record<string, string> = {
  string: 'bg-primary-container/20 text-primary',
  number: 'bg-secondary-container/20 text-secondary',
  boolean: 'bg-tertiary-container/20 text-tertiary',
  null: 'bg-surface-variant text-on-surface-variant',
  array: 'bg-error-container/20 text-error',
  object: 'bg-surface-variant text-on-surface-variant',
};

function TreeRow({
  node,
  depth,
  mode,
  onSelect,
}: {
  node: FieldNode;
  depth: number;
  mode: 'leaf' | 'array';
  onSelect: (node: FieldNode) => void;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = !!node.children?.length;
  const isSelectable = mode === 'leaf' ? node.kind !== 'object' && node.kind !== 'array' : node.kind === 'array';

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded px-1.5 py-1 font-body-sm text-body-sm ${
          isSelectable ? 'cursor-pointer hover:bg-surface-container-highest' : ''
        }`}
        style={{ paddingLeft: depth * 14 + 6 }}
        onClick={() => {
          if (isSelectable) onSelect(node);
          else if (hasChildren) setExpanded((e) => !e);
        }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((ex) => !ex);
            }}
            className="w-3 text-on-surface-variant"
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span className={isSelectable ? 'font-medium text-on-surface' : 'text-on-surface-variant'}>{node.label}</span>
        <span className={`rounded px-1 text-[10px] font-medium ${KIND_BADGE[node.kind]}`}>{node.kind}</span>
        <span className="truncate font-body-sm text-body-sm text-on-surface-variant">{node.preview}</span>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children!.map((child) => (
            <TreeRow key={child.path} node={child} depth={depth + 1} mode={mode} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PayloadFieldPicker({
  tree,
  mode,
  onSelect,
  onClose,
  allowWholeRoot,
}: {
  tree: FieldNode;
  mode: 'leaf' | 'array';
  onSelect: (node: FieldNode) => void;
  onClose: () => void;
  /** Only meaningful in 'array' mode: offer "the whole order, once" as an option
   * alongside actual array fields (this is what becomes the 'order' scope). */
  allowWholeRoot?: boolean;
}) {
  return (
    <div className="absolute z-30 mt-1 max-h-80 w-[26rem] max-w-[85vw] overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-high p-2 shadow-lg">
      {mode === 'array' && allowWholeRoot && (
        <div
          className="mb-1 cursor-pointer rounded border border-dashed border-outline-variant px-2 py-1.5 font-body-sm text-body-sm font-medium text-on-surface hover:bg-surface-container-highest"
          onClick={() => onSelect({ path: '$', label: 'The whole order (once per order)', kind: 'object', preview: '' })}
        >
          The whole order (runs once per order)
        </div>
      )}
      <TreeRow node={tree} depth={0} mode={mode} onSelect={onSelect} />
      <button onClick={onClose} className="mt-2 w-full rounded border border-outline-variant py-1 font-body-sm text-body-sm text-on-surface-variant hover:bg-surface-container-highest">
        Cancel
      </button>
    </div>
  );
}
