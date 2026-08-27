// apps/web/app/auth/signin/page.tsx
//
// One button - Cognito's identity_provider param (set in packages/auth/src/config.ts)
// skips straight to Azure AD, so there's no credential form here at all, staff
// and external guests alike.

import { redirect } from 'next/navigation';
import { auth, signIn } from '@workspace/auth/server';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect('/flow-builder');

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Order Validator</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            action={async () => {
              'use server';
              await signIn('cognito', { redirectTo: '/flow-builder' });
            }}
          >
            <Button type="submit" className="w-full">
              Sign in with Microsoft
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
