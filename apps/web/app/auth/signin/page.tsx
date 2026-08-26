// apps/web/app/auth/signin/page.tsx
//
// One button - Cognito's identity_provider param (set in packages/auth/src/config.ts)
// skips straight to Azure AD, so there's no credential form here at all, staff
// and external guests alike.

import { signIn } from '@workspace/auth/server';

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-6 text-lg font-medium">Order Validator</h1>
        <form
          action={async () => {
            'use server';
            await signIn('cognito');
          }}
        >
          <button
            type="submit"
            className="w-full rounded bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Sign in with Microsoft
          </button>
        </form>
      </div>
    </div>
  );
}
