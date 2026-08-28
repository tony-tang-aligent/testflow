// apps/web/app/page.tsx
//
// Root redirects to Overview - the actual dashboard/landing summary, not
// Workflows (which is more of a flows-list within one section). Previously
// pointed at /flow-builder specifically because /clients could crash if
// Aurora/Cognito/the SSR compute role weren't configured - /overview has
// the same reliability property (no dependency on any of that), so this
// change doesn't reintroduce that risk.

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/overview');
}
