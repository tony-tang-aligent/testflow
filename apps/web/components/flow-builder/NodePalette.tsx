// apps/web/components/flow-builder/NodePalette.tsx
import React, { useMemo, useState } from 'react';
import { NODE_TYPE_REGISTRY, NodeCategory } from '@workspace/flow-compiler';

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
    <div className="flex h-full w-64 flex-col bg-[#13151A] text-gray-300">
      <div className="p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes…"
          className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-white/30 focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCategory(cat)}
              className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
                activeCategories.has(cat) ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
              style={{
                background: activeCategories.has(cat) ? CATEGORY_ACCENT[cat] : 'rgba(255,255,255,0.06)',
              }}
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
            className="cursor-grab rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 transition-colors hover:bg-white/[0.08] active:cursor-grabbing"
            style={{ borderLeft: `3px solid ${CATEGORY_ACCENT[def.category]}` }}
          >
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: CATEGORY_ACCENT[def.category] }}
            >
              {CATEGORY_LABELS[def.category]}
            </span>
            <div className="text-sm font-medium text-white">{def.label}</div>
            <p className="mt-0.5 text-xs leading-snug text-gray-400">{def.description}</p>
          </div>
        ))}
        {nodeTypes.length === 0 && (
          <p className="px-1 pt-6 text-center text-xs text-gray-500">No node types match.</p>
        )}
      </div>
    </div>
  );
}
