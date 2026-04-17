# Triggering re-authentication from the frontend

When the VMSpillet session expires (e.g. after the 3-hour extended TTL), the frontend needs to tell the app to perform a new token exchange. The app intercepts navigations to `/auth/login` on the frontend origin and handles re-authentication automatically.

## How it works

1. The frontend navigates to `/auth/login?destinationUrl=<path>` on its own origin.
2. The app intercepts this navigation before it loads.
3. The app performs a native token exchange with the backend (`/api/game/auth/enter` with a Bearer token).
4. The backend creates a new session and redirects back to the frontend at the given `destinationUrl`.
5. The user is seamlessly re-authenticated without seeing a login screen.

## JavaScript

```js
// Navigate to /auth/login with the current page as the return destination.
// The app intercepts this and triggers a token exchange.
window.location.href = '/auth/login?destinationUrl=' + encodeURIComponent(currentDestination);
```

`currentDestination` should be the path the user should return to after re-authentication, e.g. `/` or `/league/123`.

## Example: detecting an expired session and re-authenticating

```js
async function fetchWithReauth(url, options) {
  const response = await fetch(url, { ...options, credentials: 'include' });

  if (response.status === 401) {
    // Session expired — trigger re-auth via the app
    window.location.href = '/auth/login?destinationUrl=' + encodeURIComponent(window.location.pathname);
    return;
  }

  return response;
}
```

## Important notes

- The `destinationUrl` parameter must be a **relative path** (e.g. `/league/123`), not a full URL.
- This only works inside the app's WebView. The app listens for navigations to `/auth/login` on the frontend origin and intercepts them.
- The user will not see a login screen — the app handles the token exchange natively and redirects back to the destination.
