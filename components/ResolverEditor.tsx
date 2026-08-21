// web/components/ResolverEditor.tsx
//
// Edits a single Resolver: source type, then the fields relevant to that source.
// This is the FE half of the "resolve" primitive from the rule engine design -
// same shape for a payload path, a reference lookup, or a historical uniqueness check.

import React from 'react';
import { Resolver, ResolverSource } from '../lib/types';

const SOURCES: { value: ResolverSource; label: string }[] = [
  { value: 'payload', label: 'From payload' },
  { value: 'reference', label: 'ERP reference lookup' },
  { value: 'historical', label: 'Historical / uniqueness check' },
  { value: 'internal', label: 'Internal lookup (our own table)' },
  { value: 'httpCall', label: 'Generic HTTP call (advanced)' },
  { value: 'ai', label: 'AI (BYOK)' },
  { value: 'computed', label: 'Calculation (e.g. quantity × price)' },
];

export function ResolverEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Resolver;
  onChange: (next: Resolver) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2">
      <div className="text-xs font-medium text-gray-500">{label}</div>

      <select
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
        value={value.source}
        onChange={(e) => onChange({ source: e.target.value as ResolverSource })}
      >
        {SOURCES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {value.source === 'payload' && (
        <input
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
          placeholder="dot.path.into.item (e.g. unitPrice)"
          value={value.path ?? ''}
          onChange={(e) => onChange({ ...value, path: e.target.value })}
        />
      )}

      {value.source === 'reference' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="refType (e.g. purchaseOrder)"
            value={value.refType ?? ''}
            onChange={(e) => onChange({ ...value, refType: e.target.value })}
          />
          <input
            className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="refKey path (e.g. poNumber)"
            value={value.refKey ?? ''}
            onChange={(e) => onChange({ ...value, refKey: e.target.value })}
          />
          <input
            className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="refLineKey path (optional, e.g. sku)"
            value={value.refLineKey ?? ''}
            onChange={(e) => onChange({ ...value, refLineKey: e.target.value })}
          />
          <input
            className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="path into result (e.g. unitPrice)"
            value={value.path ?? ''}
            onChange={(e) => onChange({ ...value, path: e.target.value })}
          />
        </div>
      )}

      {value.source === 'historical' && (
        <div className="grid grid-cols-2 gap-2">
          <input
            className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="entity (e.g. invoice)"
            value={value.entity ?? ''}
            onChange={(e) => onChange({ ...value, entity: e.target.value })}
          />
          <input
            className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="keyFields, comma separated"
            value={(value.keyFields ?? []).join(',')}
            onChange={(e) =>
              onChange({ ...value, keyFields: e.target.value.split(',').map((s) => s.trim()) })
            }
          />
        </div>
      )}

      {value.source === 'internal' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            A lookup against data we store ourselves - not an external ERP call.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              placeholder="internalTable (e.g. customerCreditLimits)"
              value={value.internalTable ?? ''}
              onChange={(e) => onChange({ ...value, internalTable: e.target.value })}
            />
            <input
              className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              placeholder="internalKey path (e.g. customerId)"
              value={value.internalKey ?? ''}
              onChange={(e) => onChange({ ...value, internalKey: e.target.value })}
            />
          </div>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="path into the stored record (e.g. creditLimit)"
            value={value.path ?? ''}
            onChange={(e) => onChange({ ...value, path: e.target.value })}
          />
        </div>
      )}

      {value.source === 'httpCall' && (
        <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-2.5">
          <p className="text-xs text-amber-700">
            Advanced escape hatch - use an ERP adapter instead if this system will be used
            regularly. This call is fully self-contained; nothing here goes through the shared
            per-flow adapter.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <select
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={value.httpMethod ?? 'GET'}
              onChange={(e) => onChange({ ...value, httpMethod: e.target.value as 'GET' | 'POST' | 'PUT' })}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
            </select>
            <input
              className="col-span-2 rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              placeholder="https://api.example.com/items/{{sku}}"
              value={value.httpUrl ?? ''}
              onChange={(e) => onChange({ ...value, httpUrl: e.target.value })}
            />
          </div>
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="auth secret name (optional - sent as Bearer token)"
            value={value.httpAuthSecretName ?? ''}
            onChange={(e) => onChange({ ...value, httpAuthSecretName: e.target.value })}
          />
          {(value.httpMethod === 'POST' || value.httpMethod === 'PUT') && (
            <textarea
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
              rows={2}
              placeholder='body template, e.g. { "sku": "{{sku}}" }'
              value={value.httpBodyTemplate ?? ''}
              onChange={(e) => onChange({ ...value, httpBodyTemplate: e.target.value })}
            />
          )}
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="response path to extract (e.g. data.price)"
            value={value.httpResponsePath ?? ''}
            onChange={(e) => onChange({ ...value, httpResponsePath: e.target.value })}
          />
        </div>
      )}

      {value.source === 'ai' && (
        <div className="space-y-2 rounded border border-indigo-200 bg-indigo-50 p-2.5">
          <p className="text-xs text-indigo-700">
            BYOK - uses your own AI provider API key, never shared platform usage. Requires a
            secret named <code className="font-mono">ai-api-key</code> configured for this
            tenant first.
          </p>
          <textarea
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            rows={3}
            placeholder="Prompt, e.g. Does this description look like a duplicate? {{description}}"
            value={value.aiPrompt ?? ''}
            onChange={(e) => onChange({ ...value, aiPrompt: e.target.value })}
          />
          <input
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
            placeholder="response path (optional - only if the prompt asks for JSON)"
            value={value.aiResponsePath ?? ''}
            onChange={(e) => onChange({ ...value, aiResponsePath: e.target.value })}
          />
        </div>
      )}
      {value.source === 'computed' && (
        <div className="space-y-2 rounded border border-emerald-200 bg-emerald-50 p-2.5">
          <p className="text-xs text-emerald-700">
            Entirely internal arithmetic - no external call, no adapter involved.
          </p>
          <select
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={value.computeOperator ?? 'multiply'}
            onChange={(e) =>
              onChange({ ...value, computeOperator: e.target.value as Resolver['computeOperator'] })
            }
          >
            <option value="multiply">Multiply (A × B)</option>
            <option value="add">Add (A + B)</option>
            <option value="subtract">Subtract (A − B)</option>
            <option value="divide">Divide (A ÷ B)</option>
            <option value="sumField">Sum a field across an array</option>
          </select>

          {value.computeOperator === 'sumField' ? (
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
                placeholder="array path (e.g. lineItems)"
                value={value.sumFieldArrayPath ?? ''}
                onChange={(e) => onChange({ ...value, sumFieldArrayPath: e.target.value })}
              />
              <input
                className="rounded border border-gray-300 px-2 py-1.5 text-sm font-mono"
                placeholder="field to sum (e.g. lineTotal)"
                value={value.sumFieldName ?? ''}
                onChange={(e) => onChange({ ...value, sumFieldName: e.target.value })}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <ResolverEditor
                label="First value (A)"
                value={value.computeOperands?.[0] ?? { source: 'payload' }}
                onChange={(a) =>
                  onChange({
                    ...value,
                    computeOperands: [a, value.computeOperands?.[1] ?? { source: 'payload' }],
                  })
                }
              />
              <ResolverEditor
                label="Second value (B)"
                value={value.computeOperands?.[1] ?? { source: 'payload' }}
                onChange={(b) =>
                  onChange({
                    ...value,
                    computeOperands: [value.computeOperands?.[0] ?? { source: 'payload' }, b],
                  })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
