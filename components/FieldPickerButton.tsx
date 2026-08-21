// web/components/FieldPickerButton.tsx

import React, { useState } from 'react';
import { FieldNode } from '../lib/fieldTree';
import { PayloadFieldPicker } from './PayloadFieldPicker';

export function FieldPickerButton({
  tree,
  mode,
  value,
  placeholder,
  allowWholeRoot,
  onChange,
}: {
  tree: FieldNode;
  mode: 'leaf' | 'array';
  value: string; // currently selected label to display, empty if none
  placeholder: string;
  allowWholeRoot?: boolean;
  onChange: (node: FieldNode) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded border px-2.5 py-1 text-sm font-medium ${
          value
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
            : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400'
        }`}
      >
        {value || placeholder}
      </button>
      {open && (
        <PayloadFieldPicker
          tree={tree}
          mode={mode}
          allowWholeRoot={allowWholeRoot}
          onClose={() => setOpen(false)}
          onSelect={(node) => {
            onChange(node);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
