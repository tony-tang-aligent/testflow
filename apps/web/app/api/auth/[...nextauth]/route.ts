// apps/web/app/api/auth/[...nextauth]/route.ts
//
// Every NextAuth endpoint (signin, callback, session, csrf, signout) is
// served through this one catch-all - without it, none of those routes exist
// at all, which is exactly what produced the 404 on sign-in. `handlers` is
// built by NextAuth(authConfig) in packages/auth/src/server.ts; this file
// just exposes it as an actual Next.js route.

import { handlers } from '@workspace/auth/server';

export const { GET, POST } = handlers;
