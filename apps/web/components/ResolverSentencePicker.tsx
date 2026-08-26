// web/components/ResolverSentencePicker.tsx
//
// Replaces the old ResolverEditor's raw source/path/refType/refKey text inputs
// with a segmented "where does this value come from" choice, each branch driven
// by the field picker rather than typed paths. This is the piece that makes a
// rule read like a sentence: "Get [this] ... compare ... [that]".

import React, { useState } from 'react';
import { FieldNode, labelForPath } from '../lib/fieldTree';
import { FieldPickerButton } from './FieldPickerButton';
import { ResolverEditor } from './ResolverEditor';
import { Resolver } from '../lib/types';

const REF_TYPES = [
  { value: 'purchaseOrder', label: 'Purchase Order', fields: ['price', 'quantity', 'remainingToInvoice', 'currency', 'status'] },
  { value: 'goodsReceipt', label: 'Goods Receipt', fields: ['quantity', 'expiryDate'] },
  { value: 'vendorMaster', label: 'Vendor', fields: ['status', 'taxId'] },
  { value: 'customerMaster', label: 'Customer', fields: ['status', 'creditLimit'] },
  { value: 'materialMaster', label: 'Material', fields: ['active', 'category'] },
];

export type SentenceValue = Resolver | { static: unknown };

function isStatic(v: SentenceValue): v is { static: unknown } {
  return 'static' in v;
}

type Branch = 'payload' | 'reference' | 'static' | 'advanced';

function branchOf(v: SentenceValue): Branch {
  if (isStatic(v)) return 'static';
  if (v.source === 'reference') return 'reference';
  if (v.source === 'payload') return 'payload';
  // historical / internal / httpCall / ai - not covered by the sentence
  // builder's own branches, so they land on the raw editor by default too.
  if (!isStatic(v) && v.source) return 'advanced';
  return 'payload';
}

export function ResolverSentencePicker({
  itemTree,
  value,
  allowStatic,
  onChange,
}: {
  itemTree: FieldNode;
  value: SentenceValue;
  allowStatic: boolean;
  onChange: (next: SentenceValue) => void;
}) {
  const [branch, setBranch] = useState<Branch>(branchOf(value));

  const branchOptions: { id: Branch; label: string }[] = [
    { id: 'payload', label: 'From this order' },
    { id: 'reference', label: 'Look up from ERP' },
    ...(allowStatic ? [{ id: 'static' as Branch, label: 'A fixed value' }] : []),
    { id: 'advanced', label: 'More…' },
  ];

  function switchBranch(next: Branch) {
    setBranch(next);
    if (next === 'payload') onChange({ source: 'payload', path: '' });
    else if (next === 'reference') onChange({ source: 'reference', refType: 'purchaseOrder', refKey: '', path: '' });
    else if (next === 'static') onChange({ static: '' });
    else onChange({ source: 'internal' }); // 'advanced' - ResolverEditor's own dropdown picks the real source
  }

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-md border border-gray-200 p-0.5 text-xs">
        {branchOptions.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => switchBranch(opt.id)}
            className={`rounded px-2 py-1 font-medium ${
              branch === opt.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {branch === 'payload' && !isStatic(value) && (
        <FieldPickerButton
          tree={itemTree}
          mode="leaf"
          value={value.path ? labelForPath(itemTree, value.path) : ''}
          placeholder="Choose a field…"
          onChange={(node) => onChange({ source: 'payload', path: node.path })}
        />
      )}

      {branch === 'reference' && !isStatic(value) && (
        <ReferenceSentenceFields itemTree={itemTree} value={value} onChange={onChange} />
      )}

      {branch === 'static' && isStatic(value) && (
        <input
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          placeholder="Type the fixed value"
          value={String(value.static ?? '')}
          onChange={(e) => onChange({ static: e.target.value })}
        />
      )}

      {branch === 'advanced' && !isStatic(value) && (
        <ResolverEditor label="" value={value} onChange={onChange} />
      )}
    </div>
  );
}

function ReferenceSentenceFields({
  itemTree,
  value,
  onChange,
}: {
  itemTree: FieldNode;
  value: Resolver;
  onChange: (next: Resolver) => void;
}) {
  const refType = REF_TYPES.find((r) => r.value === value.refType) ?? REF_TYPES[0];
  const [matchLine, setMatchLine] = useState(!!value.refLineKey);

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-2.5">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-500">Look up</span>
        <select
          className="rounded border border-gray-300 bg-white px-1.5 py-1 text-sm font-medium"
          value={refType.value}
          onChange={(e) => onChange({ ...value, refType: e.target.value, path: '' })}
        >
          {REF_TYPES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <span className="text-gray-500">using</span>
      </div>

      <FieldPickerButton
        tree={itemTree}
        mode="leaf"
        value={value.refKey ? labelForPath(itemTree, value.refKey) : ''}
        placeholder="which field identifies it?"
        onChange={(node) => onChange({ ...value, refKey: node.path })}
      />

      <label className="flex items-center gap-1.5 text-xs text-gray-500">
        <input
          type="checkbox"
          checked={matchLine}
          onChange={(e) => {
            setMatchLine(e.target.checked);
            if (!e.target.checked) onChange({ ...value, refLineKey: undefined });
          }}
        />
        Match a specific line within it
      </label>

      {matchLine && (
        <FieldPickerButton
          tree={itemTree}
          mode="leaf"
          value={value.refLineKey ? labelForPath(itemTree, value.refLineKey) : ''}
          placeholder="which field matches the line?"
          onChange={(node) => onChange({ ...value, refLineKey: node.path })}
        />
      )}

      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-gray-500">then read</span>
        <input
          list={`ref-fields-${refType.value}`}
          className="rounded border border-gray-300 px-2 py-1 text-sm font-mono"
          placeholder="field name"
          value={value.path ?? ''}
          onChange={(e) => onChange({ ...value, path: e.target.value })}
        />
        <datalist id={`ref-fields-${refType.value}`}>
          {refType.fields.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
