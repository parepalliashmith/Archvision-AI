// The email-OTP login session — replaces the old anonymous clientId pseudo-
// identity entirely. A session is a signed token (see server.js's
// authTokens.js) plus the account it belongs to, both cached in localStorage
// so a page reload doesn't require re-verifying an OTP.
const TOKEN_KEY = 'archvision_session_token';
const ACCOUNT_KEY = 'archvision_session_account';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAccount() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setSession(token, account) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

export function isLoggedIn() {
  return !!getToken();
}

// Merge fresh account fields (e.g. a newly saved phone) into the cached session.
export function updateStoredAccount(partial) {
  const current = getAccount();
  if (!current || !partial) return;
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ ...current, ...partial }));
}
