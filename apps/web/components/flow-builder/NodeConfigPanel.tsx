// apps/web/components/flow-builder/NodeConfigPanel.tsx
//
// Content only, no wrapping frame - rendered INSIDE the shared SidePanel
// component (components/SidePanel.tsx, the same one the original validator
// uses) rather than reimplementing a second right-docked panel. This is what
// makes "the flow-builder should look like Shopify Flow, like the rest of
// the app already does" literally true, not just visually similar - it's the
// same component, reused. The palette stays visible at all times now; this
// panel is an additional overlay on top, not a replacement for it.

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
                                  samplePayload,
                                }: {
  nodeType: string;
  config: Record<string, unknown>;
  onConfigChange: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  samplePayload?: Record<string, unknown>;
}) {
  const def = getNodeType(nodeType);
  const accent = CATEGORY_ACCENT[def.category];

  return (
      <div>
        <div className="mb-4 flex items-start justify-between">
          <div>
          <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: `${accent}1A`, color: accent }}
          >
            {def.category}
          </span>
            <p className="mt-1.5 text-sm text-gray-500">{def.description}</p>
          </div>
          <button onClick={onDelete} className="shrink-0 text-xs text-red-500 hover:text-red-700 hover:underline">
            Delete node
          </button>
        </div>

        <div className="space-y-4">
          {def.configFields.length === 0 && (
              <p className="text-sm text-gray-400">This node has no configuration.</p>
          )}
          {def.configFields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
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
                        className="w-full rounded border border-gray-200 px-2.5 py-2 font-mono text-sm"
                        rows={3}
                        placeholder={field.placeholder}
                        value={String(config[field.key] ?? '')}
                        onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
                    />
                ) : field.kind === 'select' ? (
                    <select
                        className="w-full rounded border border-gray-200 px-2.5 py-2 text-sm"
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
                        className="w-full rounded border border-gray-200 px-2.5 py-2 font-mono text-sm"
                        placeholder={field.placeholder}
                        value={String(config[field.key] ?? '')}
                        onChange={(e) => onConfigChange({ [field.key]: e.target.value })}
                    />
                )}
              </div>
          ))}

          {!samplePayload && def.configFields.some((f) => f.kind === 'fieldPicker') && (
              <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Set a sample payload (top bar) to browse fields instead of typing paths by hand.
              </p>
          )}
        </div>
      </div>
  );
}