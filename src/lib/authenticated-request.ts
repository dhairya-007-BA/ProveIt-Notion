import type { User } from "firebase/auth";

/**
 * Makes a same-origin request authenticated with a freshly refreshed Firebase
 * ID token. Privileged browser operations must use this helper so a token
 * issued before an account migration or revocation is not reused.
 */
export async function authenticatedRequest(
  user: Pick<User, "getIdToken">,
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const idToken = await user.getIdToken(true);
  const headers = new Headers(init.headers);

  headers.set(
    "Authorization",
    `Bearer ${idToken}`
  );

  return fetch(input, {
    ...init,
    headers,
  });
}
