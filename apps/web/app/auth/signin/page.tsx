// apps/web/app/auth/signin/page.tsx
//
// One button - Cognito's identity_provider param (set in packages/auth/src/config.ts)
// skips straight to Azure AD, so there's no credential form here at all, staff
// and external guests alike. The provided design's email/password form is
// deliberately NOT built here - this app has exactly one auth mechanism
// (Cognito/Azure AD SSO), no email/password backend exists at all. A form
// that submits to nothing would be worse than not having it.

import { redirect } from 'next/navigation';
import { auth, signIn } from '@workspace/auth/server';

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect('/flow-builder');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#09090b] p-layout-margin text-on-surface">
      <main className="flex w-full max-w-[400px] flex-col items-center">
        <div className="mb-xxl flex flex-col items-center text-center">
          <div className="mb-lg flex h-12 w-12 items-center justify-center rounded-xl border border-outline-variant bg-surface-container-high shadow-sm">
            <span className="material-symbols-outlined text-brand-indigo" style={{ fontSize: 28 }}>
              check_circle
            </span>
          </div>
          <h1 className="mb-xs font-display-lg text-display-lg text-on-surface">Sign in to FlexVal</h1>
          <p className="font-body-base text-body-base text-on-surface-variant">Order Validation Platform</p>
        </div>

        <div className="flex w-full flex-col gap-lg rounded-xl border border-outline-variant bg-[#18181b] p-layout-margin shadow-[0_4px_6px_-1px_rgba(0,0,0,0.5),0_2px_4px_-2px_rgba(0,0,0,0.5)]">
          <form
            action={async () => {
              'use server';
              await signIn('cognito', { redirectTo: '/flow-builder' });
            }}
          >
            <button
              type="submit"
              className="flex h-10 w-full items-center justify-center gap-sm rounded bg-brand-indigo font-body-base text-body-base text-white transition-colors duration-150 hover:bg-brand-indigo/90"
            >
              <svg fill="currentColor" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.698 7.287 8.712.302a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 6.44 6.44 1.453-1.453a.5.5 0 0 1 .712 0l1.288 1.288a.5.5 0 0 1 0 .712L8.712 15.698a1.03 1.03 0 0 1-1.457 0l-1.45-1.45 6.44-6.44 1.453 1.453a.5.5 0 0 0 .712 0l1.288-1.288a.5.5 0 0 0 0-.712Z" />
                <path d="M7.788 8.653 1.348 2.213a1.03 1.03 0 0 0-1.457 0l-1.45 1.45 6.44 6.44 1.453-1.453a.5.5 0 0 1 .712 0l1.288 1.288a.5.5 0 0 1 0 .712l-6.44 6.44a1.03 1.03 0 0 1-1.457 0l-1.45-1.45 6.44-6.44 1.453 1.453a.5.5 0 0 0 .712 0l1.288-1.288a.5.5 0 0 0 0-.712Z" />
              </svg>
              Continue with Azure AD
            </button>
          </form>
        </div>

        <div className="mt-xl flex items-center justify-center gap-lg font-body-sm text-body-sm text-on-surface-variant">
          <a className="transition-colors hover:text-on-surface" href="#">
            Status
          </a>
          <span className="h-[3px] w-[3px] rounded-full bg-outline-variant" />
          <a className="transition-colors hover:text-on-surface" href="#">
            Privacy Policy
          </a>
          <span className="h-[3px] w-[3px] rounded-full bg-outline-variant" />
          <a className="transition-colors hover:text-on-surface" href="#">
            Terms of Service
          </a>
        </div>
      </main>
    </div>
  );
}
