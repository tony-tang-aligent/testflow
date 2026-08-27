// apps/web/components/flow-builder/NodePalette.tsx
//
// M3 dark tokens throughout, matching the provided design spec - Material
// Symbols for the search icon instead of lucide, consistent with the rest
// of this design system. The category-accent-color system is untouched -
// that's meaningful (each color maps to a real node category everywhere in
// the canvas), not decoration.

import React, { useMemo, useState } from 'react';
import { NODE_TYPE_REGISTRY, NodeCategory } from '@workspace/flow-compiler';
import { cn } from '../../lib/utils';

const CATEGORY_LABELS: Record<NodeCategory, string> = {
  control: 'Control',
  check: 'Check',
  transform: 'Transform',
  action: 'Action',
  aggregation: 'Aggregation',
  output: 'Output',
};

const CATEGORY_ACCENT: Record<NodeCategory, string> = {
  control: '#F0A93E',
  check: '#2F6FED',
  transform: '#2F6FED',
  action: '#0EA5A5',
  aggregation: '#E8577A',
  output: '#22C55E',
};

export function NodePalette() {
  const [query, setQuery] = useState('');
  const [activeCategories, setActiveCategories] = useState<Set<NodeCategory>>(new Set());

  const nodeTypes = Object.values(NODE_TYPE_REGISTRY).filter((def) => {
    if (def.type === 'documentInput') return false;
    if (activeCategories.size > 0 && !activeCategories.has(def.category)) return false;
    if (query && !def.label.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const categories = useMemo(
    () => Array.from(new Set(Object.values(NODE_TYPE_REGISTRY).map((d) => d.category))),
    [],
  );

  function toggleCategory(cat: NodeCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function onDragStart(e: React.DragEvent, nodeType: string) {
    e.dataTransfer.setData('application/flow-node-type', nodeType);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div className="flex h-full w-64 flex-col border-r border-outline-variant bg-surface-container-low">
      <div className="p-3">
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[16px] text-on-surface-variant">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search nodes…"
            className="w-full rounded border border-outline-variant bg-background py-1.5 pl-8 pr-2 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:border-primary focus:outline-none"
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors',
                activeCategories.has(cat)
                  ? 'text-on-tertiary'
                  : 'border border-outline-variant bg-background text-on-surface-variant hover:text-on-surface',
              )}
              style={activeCategories.has(cat) ? { background: CATEGORY_ACCENT[cat] } : undefined}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-4">
        {nodeTypes.map((def) => (
          <div
            key={def.type}
            draggable
            onDragStart={(e) => onDragStart(e, def.type)}
            className="cursor-grab rounded-lg border border-outline-variant bg-surface px-3 py-2.5 shadow-sm transition-colors hover:border-primary active:cursor-grabbing"
            style={{ borderLeft: `3px solid ${CATEGORY_ACCENT[def.category]}` }}
          >
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: CATEGORY_ACCENT[def.category] }}
            >
              {CATEGORY_LABELS[def.category]}
            </span>
            <div className="font-body-base text-body-base font-medium text-on-surface">{def.label}</div>
            <p className="mt-0.5 font-body-sm text-body-sm leading-snug text-on-surface-variant">{def.description}</p>
          </div>
        ))}
        {nodeTypes.length === 0 && (
          <p className="px-1 pt-6 text-center font-body-sm text-body-sm text-on-surface-variant">No node types match.</p>
        )}
      </div>
    </div>
  );
}
