// apps/web/components/flow-builder/FlowNodeCard.tsx
//
// Matches the reference design's exact node structure: a header bar (icon +
// label, separated by its own border/background from the body), 1-2 config
// preview rows surfaced directly on the card face (not hidden until you
// click in), and ring-style ports (hollow circle, colored border) instead of
// small solid dots. Category still drives the left accent border and header
// icon color - that's meaningful, not decorative, same as before.

import React from 'react';
import { Handle, Position } from 'reactflow';
import { getNodeType, NodeCategory } from '@workspace/flow-compiler';

const CATEGORY_ACCENT: Record<NodeCategory, string> = {
  control: '#F0A93E',
  check: '#2F6FED',
  transform: '#2F6FED',
  action: '#0EA5A5',
  aggregation: '#E8577A',
  output: '#22C55E',
};

export interface FlowNodeCardData {
  nodeType: string;
  config: Record<string, unknown>;
  hasError: boolean;
  errorMessage?: string;
  selected: boolean;
}

interface PreviewRow {
  label: string;
  value: string;
  pill?: boolean;
}

/** 1-2 representative config values shown directly on the card face, per
 * node type - the same "Source: Webhook / Method: POST" treatment the
 * reference design uses, built from whichever config fields actually exist
 * for that type rather than a generic dump of the whole config object. */
function previewRows(nodeType: string, config: Record<string, unknown>): PreviewRow[] {
  switch (nodeType) {
    case 'fieldValidator':
      return [
        { label: 'Field', value: String(config.fieldPath ?? '(not set)') },
        { label: 'Rule', value: String(config.rule ?? 'mustExist') },
      ];
    case 'computedCheck':
      return [{ label: 'Compares', value: String(config.comparedTo ?? '(not set)') }];
    case 'emailAlert':
      return [{ label: 'To', value: String(config.recipients ?? '(not set)') }];
    case 'slackAlert':
      return [{ label: 'Channel', value: String(config.channel ?? '(not set)') }];
    case 'httpCall':
      return [
        { label: 'Method', value: String(config.method ?? 'GET'), pill: true },
        { label: 'URL', value: String(config.url ?? '(not set)') },
      ];
    case 'lambdaInvoke':
      return [{ label: 'Function', value: String(config.functionArn ?? '(not set)') }];
    case 'workflowResult':
      return [{ label: 'Default action', value: config.returnResult === 'failed' ? 'FAIL' : 'PASS', pill: true }];
    default:
      return [];
  }
}

export function FlowNodeCard({ data }: { data: FlowNodeCardData }) {
  const def = getNodeType(data.nodeType);
  const accent = CATEGORY_ACCENT[def.category];
  const rows = previewRows(data.nodeType, data.config);
  const isVerdict = data.nodeType === 'workflowResult';

  return (
    <div
      className={`w-64 overflow-hidden rounded-lg border border-outline-variant bg-surface shadow-sm transition-all hover:border-primary ${
        data.hasError ? 'border-error' : ''
      } ${data.selected ? 'ring-2 ring-offset-1 ring-offset-background' : ''}`}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: accent,
        ...(data.selected ? ({ '--tw-ring-color': accent } as React.CSSProperties) : {}),
        ...(data.hasError ? { animation: 'flowNodePulse 1.8s ease-in-out infinite' } : {}),
      }}
    >
      {def.type !== 'documentInput' && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3.5 !w-3.5 !border-2 !bg-background"
          style={{ borderColor: accent }}
        />
      )}

      <div className="flex items-center gap-2 border-b border-outline-variant bg-surface-container px-3 py-2">
        <span className="material-symbols-outlined text-[16px]" style={{ color: accent }}>
          {def.icon}
        </span>
        <span className="truncate font-label-caps text-label-caps text-on-surface">{def.label}</span>
      </div>

      {rows.length > 0 ? (
        <div
          className={`flex flex-col gap-1.5 px-3 py-2.5 font-body-sm text-body-sm ${
            isVerdict ? 'bg-secondary-container/15' : ''
          }`}
        >
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <span className="text-on-surface-variant">{row.label}</span>
              {row.pill ? (
                <span className="rounded bg-surface-variant px-1.5 py-0.5 font-code-sm text-code-sm text-on-surface">
                  {row.value}
                </span>
              ) : (
                <span className="truncate font-code-sm text-code-sm text-on-surface" title={row.value}>
                  {row.value}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="px-3 py-2.5 font-body-sm text-body-sm leading-snug text-on-surface-variant">
          {def.description}
        </p>
      )}

      {data.hasError && (
        <div className="border-t border-error/30 bg-error-container/20 px-3 py-2 font-body-sm text-body-sm text-error">
          {data.errorMessage}
        </div>
      )}

      {def.canHaveOutput && def.branches && (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!h-3.5 !w-3.5 !border-2 !bg-background"
            style={{ left: '30%', borderColor: '#22C55E' }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!h-3.5 !w-3.5 !border-2 !bg-background"
            style={{ left: '70%', borderColor: '#EF4444' }}
          />
        </>
      )}
      {def.canHaveOutput && !def.branches && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3.5 !w-3.5 !border-2 !bg-background"
          style={{ borderColor: accent }}
        />
      )}
    </div>
  );
}
