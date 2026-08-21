// web/components/SidePanel.tsx
//
// Docked right-side panel, replacing the full-screen Modal for canvas editing.
// Keeps the graph visible and interactive-adjacent while a node's config is open,
// matching the Shopify Flow / Zapier / n8n pattern of "click a step, edit in a
// drawer, click the next step" rather than a blocking dialog per edit.

import React from 'react';

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
      {/* Click-outside-to-close scrim - transparent, doesn't dim the canvas */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 h-full w-[640px] max-w-[92vw] overflow-y-auto border-l border-gray-200 bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3.5">
          <h2 className="text-sm font-medium">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </>
  );
}
