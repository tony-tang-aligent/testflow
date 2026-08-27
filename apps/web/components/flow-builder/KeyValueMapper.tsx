// apps/web/components/flow-builder/KeyValueMapper.tsx
//
// The actual data-mapper piece for the HTTP action node. Each row's value is
// a plain string that may contain {{payload.x}} placeholders - the field
// picker inserts one (wrapped in {{}}) at the end of whatever's already
// typed, rather than replacing the whole value, since these values are
// resolved via interpolate(), not read as a bare path directly.

import React from 'react';
import { FieldPicker } from './FieldPicker';
import type { KeyValueRow } from '@workspace/flow-compiler';

let rowIdCounter = 0;
function newRowId() {
    rowIdCounter += 1;
    return `row_${Date.now()}_${rowIdCounter}`;
}

export function KeyValueMapper({
                                   rows,
                                   onChange,
                                   pickerSource,
                                   keyPlaceholder = 'key (dot-notation for nesting)',
                                   valuePlaceholder = 'value or {{payload.x}}',
                               }: {
    rows: KeyValueRow[];
    onChange: (rows: KeyValueRow[]) => void;
    // Pre-wrapped { payload, actionResults } shape, passed straight through to
    // FieldPicker with no re-wrapping here - this used to wrap a raw
    // samplePayload itself, which silently dropped actionResults for every
    // header/body row (e.g. a second httpCall wanting to reference the first
    // one's captured response couldn't) - same convention as NodeConfigPanel's
    // fieldPicker fields now, not a second, inconsistent one.
    pickerSource: Record<string, unknown>;
    keyPlaceholder?: string;
    valuePlaceholder?: string;
}) {
    function updateRow(id: string, patch: Partial<KeyValueRow>) {
        onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    }
    function removeRow(id: string) {
        onChange(rows.filter((r) => r.id !== id));
    }
    function addRow() {
        onChange([...rows, { id: newRowId(), key: '', value: '' }]);
    }

    return (
        <div className="space-y-1.5">
            {rows.map((row) => (
                <div key={row.id} className="flex items-start gap-1">
                    <input
                        className="w-28 shrink-0 rounded border border-gray-200 px-2 py-1.5 font-mono text-xs"
                        placeholder={keyPlaceholder}
                        value={row.key}
                        onChange={(e) => updateRow(row.id, { key: e.target.value })}
                    />
                    <div className="flex-1">
                        <FieldPicker
                            samplePayload={pickerSource}
                            value={row.value}
                            onChange={(v) => updateRow(row.id, { value: v })}
                            placeholder={valuePlaceholder}
                            insertAsPlaceholder
                        />
                    </div>
                    <button
                        onClick={() => removeRow(row.id)}
                        className="shrink-0 px-1 text-xs text-gray-300 hover:text-red-500"
                        aria-label="Remove row"
                    >
                        ✕
                    </button>
                </div>
            ))}
            <button
                onClick={addRow}
                className="rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-700"
            >
                + Add row
            </button>
        </div>
    );
}