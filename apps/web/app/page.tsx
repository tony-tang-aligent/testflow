// apps/web/app/page.tsx
//
// Root redirects to the Flow Builder dashboard - the new canvas/compiler
// system, which has no dependency on Aurora/Cognito/the SSR compute role at
// all (unlike /clients, which needs those and can crash if they're not
// configured). This is the reliable default entry point.

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/flow-builder');
}
