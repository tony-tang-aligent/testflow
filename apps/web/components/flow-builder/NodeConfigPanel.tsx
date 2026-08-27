// apps/web/components/flow-builder/NodeConfigPanel.tsx
//
// Content only, no wrapping frame - rendered INSIDE the shared SidePanel
// component (components/SidePanel.tsx, the same one the original validator
// uses) rather than reimplementing a second right-docked panel. The palette
// stays visible at all times; this panel is an additional overlay on top.
//
// httpCall gets one extra thing every other node type doesn't: a Postman-
// style "Send test request" panel, using the exact same resolver the real
// executor uses server-side (infra/lambda/flowBuilderShared/httpActionResolver.ts).

import React, { useState } from 'react';
import { getNodeType, NodeCategory, KeyValueRow } from '@workspace/flow-compiler';
import { FieldPicker } from './FieldPicker';
import { KeyValueMapper } from './KeyValueMapper';
import { flowBuilderApi } from '../../lib/flowBuilderApi';

const CATEGORY_ACCENT: Record<NodeCategory, string> = {
    control: '#F0A93E',
    check: '#2F6FED',
    transform: '#2F6FED',
    action: '#0EA5A5',
    aggregation: '#E8577A',
    output: '#22C55E',
};

interface TestResponse {
    request: { url: string; method: string; headers: Record<string, string>; body?: string };
    response?: { status: number; statusText: string; headers: Record<string, string>; body: string; timeMs: number };
    error?: string;
    timeMs?: number;
}

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
    const [sending, setSending] = useState(false);
    const [testResult, setTestResult] = useState<TestResponse | null>(null);

    async function handleSendTest() {
        setSending(true);
        setTestResult(null);
        try {
            const result = await flowBuilderApi.testHttpAction(config, samplePayload ?? {});
            setTestResult(result);
        } catch (err) {
            setTestResult({ request: { url: '', method: '' }, error: (err as Error).message });
        } finally {
            setSending(false);
        }
    }

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
                                samplePayload={samplePayload ? { payload: samplePayload } : undefined}
                                value={String(config[field.key] ?? '')}
                                onChange={(v) => onConfigChange({ [field.key]: v })}
                                placeholder={field.placeholder}
                            />
                        ) : field.kind === 'keyValueMapper' ? (
                            <KeyValueMapper
                                rows={(config[field.key] as KeyValueRow[]) ?? []}
                                onChange={(rows) => onConfigChange({ [field.key]: rows })}
                                samplePayload={samplePayload}
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

                {!samplePayload && def.configFields.some((f) => f.kind === 'fieldPicker' || f.kind === 'keyValueMapper') && (
                    <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Set a sample payload (top bar) to browse fields instead of typing paths by hand.
                    </p>
                )}

                {nodeType === 'httpCall' && (
                    <div className="border-t border-gray-100 pt-4">
                        <button
                            onClick={handleSendTest}
                            disabled={sending || !config.url}
                            className="w-full rounded bg-gray-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                        >
                            {sending ? 'Sending…' : 'Send test request'}
                        </button>

                        {testResult && (
                            <div className="mt-3 space-y-2 rounded border border-gray-200 bg-gray-50 p-3">
                                {testResult.error ? (
                                    <p className="text-xs text-red-600">{testResult.error}</p>
                                ) : testResult.response ? (
                                    <>
                                        <div className="flex items-center gap-2">
                      <span
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                              testResult.response.status < 300
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : testResult.response.status < 400
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-red-100 text-red-800'
                          }`}
                      >
                        {testResult.response.status} {testResult.response.statusText}
                      </span>
                                            <span className="text-xs text-gray-400">{testResult.response.timeMs}ms</span>
                                        </div>
                                        <details className="text-xs">
                                            <summary className="cursor-pointer text-gray-500 hover:text-gray-800">
                                                Request sent ({testResult.request.method})
                                            </summary>
                                            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px]">
                        {testResult.request.url}
                                                {'\n'}
                                                {JSON.stringify(testResult.request.headers, null, 2)}
                                                {testResult.request.body ? `\n\n${testResult.request.body}` : ''}
                      </pre>
                                        </details>
                                        <details className="text-xs" open>
                                            <summary className="cursor-pointer text-gray-500 hover:text-gray-800">
                                                Response headers
                                            </summary>
                                            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px]">
                        {JSON.stringify(testResult.response.headers, null, 2)}
                      </pre>
                                        </details>
                                        <details className="text-xs" open>
                                            <summary className="cursor-pointer text-gray-500 hover:text-gray-800">
                                                Response body
                                            </summary>
                                            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white p-2 font-mono text-[10px]">
                        {testResult.response.body || '(empty)'}
                      </pre>
                                        </details>
                                    </>
                                ) : null}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}