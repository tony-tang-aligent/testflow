// web/components/SidePanel.tsx
//
// Docked right-side panel, replacing the full-screen Modal for canvas editing.
// Keeps the graph visible and interactive-adjacent while a node's config is open,
// matching the Shopify Flow / Zapier / n8n pattern of "click a step, edit in a
// drawer, click the next step" rather than a blocking dialog per edit.

import React from 'react';
import { X } from 'lucide-react';
import { Button } from './ui/button';

export function SidePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-[640px] max-w-[92vw] overflow-y-auto border-l border-outline-variant bg-surface-container shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-outline-variant bg-surface-container px-5 py-3.5">
          <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
          <Button onClick={onClose} variant="ghost" size="icon" className="h-7 w-7" aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </>
  );
}
