// apps/web/app/auth/signin/page.tsx
//
// One button - Cognito's identity_provider param (set in packages/auth/src/config.ts)
// skips straight to Azure AD, so there's no credential form here at all, staff
// and external guests alike.

import { redirect } from 'next/navigation';
import { auth, signIn } from '@workspace/auth/server';

export default async function SignInPage() {
    // Without this, someone with an already-valid session landing back on this
    // page (which is exactly what happens after a successful sign-in, since
    // signIn() below previously had no redirectTo and defaulted to sending the
    // browser back to whatever page the form was submitted from - this page)
    // would just see the sign-in card again, looking identical to a failed
    // login even though the session is genuinely fine (the nav bar showing the
    // signed-in email the whole time was the tell).
    const session = await auth();
    if (session) redirect('/flow-builder');

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
                <h1 className="mb-6 text-lg font-medium">Order Validator</h1>
                <form
                    action={async () => {
                        'use server';
                        // Explicit destination - this is the actual fix. Without it,
                        // NextAuth defaults to redirecting back to wherever the form was
                        // submitted from (this same page), regardless of session state.
                        await signIn('cognito', { redirectTo: '/flow-builder' });
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