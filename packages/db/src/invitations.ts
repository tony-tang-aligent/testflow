// packages/db/src/invitations.ts
//
// TODO: blocked on confirming User.Invite.All is admin-consented on the
// Portalink Azure AD tenant's app registration (see auth scoping conversation -
// checking with the team). Everything else in this build works without this;
// only "invite a brand-new external user who has no Azure AD account yet"
// depends on it. Adding an EXISTING Azure AD user (Portalink staff) to an
// Organization never needs this at all - that's just addUserToOrganization
// once they've signed in once via the normal Cognito/Azure AD flow.

export interface InviteExternalUserParams {
  email: string;
  organizationId: string;
  role: 'admin' | 'member';
  invitedRedirectUrl: string;
}

export async function inviteExternalUserViaGraph(_params: InviteExternalUserParams): Promise<void> {
  throw new Error(
    'inviteExternalUserViaGraph is not implemented yet - needs User.Invite.All admin consent on the ' +
      'Azure AD app registration first. See DEPLOYMENT.md for the pending confirmation.',
  );
}
