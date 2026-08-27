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
        className={`rounded border px-2.5 py-1 font-body-sm text-body-sm font-medium ${
          value
            ? 'border-primary/30 bg-primary-container/10 text-primary'
            : 'border-dashed border-outline-variant text-on-surface-variant hover:border-outline'
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
