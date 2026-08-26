// apps/web/components/flow-builder/NodeConfigPanel.tsx
//
// Docks in the SAME left column the palette occupies - selecting a node
// swaps the palette out for this panel; deselecting swaps it back. Avoids
// needing a third column, and matches "left pop up" literally rather than
// the right-docked pattern the original validator uses.

import React from 'react';
import { getNodeType, NodeCategory } from '@workspace/flow-compiler';
import { FieldPicker } from './FieldPicker';

const CATEGORY_ACCENT: Record<NodeCategory, string> = {
  control: '#F0A93E',
  check: '#2F6FED',
  transform: '#2F6FED',
  action: '#0EA5A5',
  aggregation: '#E8577A',
  output: '#22C55E',
};

export function NodeConfigPanel({
  nodeType,
  config,
  onConfigChange,
  onDelete,
  onClose,
  samplePayload,
}: {
  nodeType: string;
  config: Record<string, unknown>;
  onConfigChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onClose: () => void;
  samplePayload?: Record<string, unknown>;
}) {
  const def = getNodeType(nodeType);
  const accent = CATEGORY_ACCENT[def.category];

  return (
    <div className="flex h-full w-64 flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-700">
          &larr; Back to palette
        </button>
        <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-600">
          Delete
        </button>
      </div>

      <div className="border-b border-gray-100 px-4 py-3">
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: `${accent}1A`, color: accent }}
        >
          {def.category}
        </span>
        <div className="mt-1 text-sm font-semibold text-gray-900">{def.label}</div>
        <p className="mt-1 text-xs leading-snug text-gray-500">{def.description}</p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {def.configFields.length === 0 && (
          <p className="text-xs text-gray-400">This node has no configuration.</p>
        )}
        {def.configFields.map((field) => (
          <div key={field.key}>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {field.label}
            </label>
            {field.kind === 'fieldPicker' ? (
              <FieldPicker
                samplePayload={samplePayload}
                value={String(config[field.key] ?? '')}
                onChange={(v) => onConfigChange({ [field.key]: v })}
                placeholder={field.placeholder}
              />
            ) : field.kind === 'textarea' ? (
              <textarea
                className="w-full rounded border border-gray-200 px-2 py-1.5 font-mono text-xs"
                rows={3}
                placeholder={field.placeholder}
                value={String(config[field.key] ?? '')}
                onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
              />
            ) : field.kind === 'select' ? (
              <select
                className="w-full rounded border border-gray-200 px-2 py-1.5 text-xs"
                value={String(config[field.key] ?? field.options?.[0] ?? '')}
                onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
              >
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded border border-gray-200 px-2 py-1.5 font-mono text-xs"
                placeholder={field.placeholder}
                value={String(config[field.key] ?? '')}
                onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
              />
            )}
          </div>
        ))}

        {!samplePayload && def.configFields.some((f) => f.kind === 'fieldPicker') && (
          <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
            Set a sample payload (top bar) to browse fields instead of typing paths by hand.
          </p>
        )}
      </div>
    </div>
  );
}
