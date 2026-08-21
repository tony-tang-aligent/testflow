// web/components/StatusBadge.tsx
import React from 'react';

const STYLES: Record<string, string> = {
  passed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warned: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
  needs_review: 'bg-blue-50 text-blue-700 border-blue-200',
};

const LABELS: Record<string, string> = {
  needs_review: 'needs review',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STYLES[status] ?? 'bg-gray-50 text-gray-700 border-gray-200';
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
