export type OAuthFailureCode =
  | 'credentials_whitespace'
  | 'credentials_rejected'
  | 'provider_denied'
  | 'redirect_mismatch'
  | 'state_missing'
  | 'state_invalid'
  | 'state_mismatch'
  | 'callback_invalid'
  | 'token_exchange'
  | 'token_response'
  | 'identity_validation'
  | 'identity_response'
  | 'wrong_client'
  | 'user_lookup'
  | 'user_response'
  | 'identity_mismatch'
  | 'unexpected';

export class OAuthFailure extends Error {
  constructor(
    readonly code: OAuthFailureCode,
    readonly status?: number,
    readonly detail?:
      | 'invalid_client_secret'
      | 'invalid_client_id'
      | 'invalid_authorization_code'
      | 'redirect_mismatch',
  ) {
    super(code);
  }
}

export function oauthFailure(error: unknown) {
  return error instanceof OAuthFailure ? error : new OAuthFailure('unexpected');
}

export function logOAuthFailure(error: unknown) {
  const failure = oauthFailure(error);
  // Never pass Error objects, provider bodies, URLs, cookies or credentials here.
  console.warn(
    '[streamlaughs.auth]',
    JSON.stringify({
      code: failure.code,
      status: failure.status,
      detail: failure.detail,
    }),
  );
  return failure;
}

export function loginErrorMessage(reason?: string) {
  if (reason === 'redirect_mismatch')
    return 'Twitch rejected this app’s callback URL. the app owner needs to update its Twitch login settings.';
  if (reason === 'credentials_whitespace' || reason === 'credentials_rejected')
    return 'Twitch couldn’t verify this app. its login settings need updating before you can sign in.';
  if (
    reason === 'state_missing' ||
    reason === 'state_invalid' ||
    reason === 'state_mismatch'
  )
    return 'your sign-in session expired or changed. start again in this tab with cookies allowed.';
  if (reason === 'provider_denied')
    return 'Twitch sign-in was cancelled. try again and approve the app to continue.';
  return 'we couldn’t finish your Twitch sign-in. try again to start a fresh login.';
}
