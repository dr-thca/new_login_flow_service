# Task: Update the local test server to simulate Dwarf's two-subdomain architecture

## Context

This is a local Express test server at `/Users/thca/dev/dr/new_login_flow_service` used to develop and test a React Native WebView auth flow against Dwarf's VMSpillet system. The real system uses **two subdomains** under `.dwarf.dk`:

- **seashell** (`seashell-app-preprod.dwarf.dk`) — the API/backend (Next.js CMS). Handles auth, JWT verification, session management. Runs the `/api/game/auth/enter` endpoint.
- **seal** (`seal-app-preprod.dwarf.dk`) — the static SPA frontend. Serves HTML pages like `/`, `/onboarding`, `/auth/login`, `/login`, `/nap/vm2026/login`.

Both share the root domain `.dwarf.dk`, so cookies scoped to `Domain=.dwarf.dk` are readable by both.

The current test server simulates an **old single-domain model** where everything runs on one Express server on one port. It needs to be updated to simulate the two-subdomain architecture so we can test the 302 redirect flow between seashell and seal locally.

## Current state

The server has:

- `src/index.ts` — entry point, starts Express on `PORT` (default 3000)
- `src/app.ts` — all logic: `createApp()` factory, in-memory sessions, 4-branch auth decision tree, HTML page helpers
- Express 5, TypeScript, ESM, `tsx watch` for dev
- POC-grade JWT handling (decode without signature verification)

## What you need to do

### 1. Split into two Express apps on two ports

Create two Express apps:

- **Seashell** (port 3001 by default, configurable via `SEASHELL_PORT`) — the API backend
- **Seal** (port 3002 by default, configurable via `SEAL_PORT`) — the static frontend

Update `src/index.ts` to start both servers. Keep the `createApp()` factory pattern if it makes sense, or split into `createSeashellApp()` and `createSealApp()`.

### 2. Seashell app — `/api/game/auth/enter` endpoint

This is the critical endpoint. It should implement the exact same 4-branch decision tree as the real Dwarf backend:

```
GET /api/game/auth/enter?destinationUrl=/some/path&appLoggedIn=true|false
```

**Branch 1: Has session cookie** (`vmspillet_game_session`)

- Look up the session in the in-memory store
- If valid → 302 redirect to `SEAL_ORIGIN + destinationUrl`

**Branch 2: Has `Authorization: Bearer <token>` header**

- Decode the JWT payload (no signature verification needed — this is a POC)
- Extract `sub` from the payload
- Create a new session in the in-memory store
- Set a cookie: `vmspillet_game_session=<sessionToken>` with `Domain=localhost`, `httpOnly=true`, `sameSite=none`, `secure=false` (we're on localhost), `path=/`
- 302 redirect to `SEAL_ORIGIN + destinationUrl` (or `SEAL_ORIGIN + /onboarding?next=<destinationUrl>` — just always redirect to destinationUrl for now, skip onboarding logic)

**Branch 3: `appLoggedIn=true`, no Bearer, no session**

- 302 redirect to `SEAL_ORIGIN + /auth/login?destinationUrl=<destinationUrl>`
- This is NOT a login page — it's a signal that the app should trigger a native login + token exchange. The React Native app intercepts this navigation before the page loads.

**Branch 4: Fallback** (`appLoggedIn` is missing or `false`)

- 302 redirect to `SEAL_ORIGIN + /login` (a teaser/login page)

Also add:

- `GET /api/game/auth/me` — returns 200 with user data if session cookie is valid, 401 otherwise. Useful for debugging.

### 3. Seal app — static frontend pages

The seal app serves the HTML pages that the WebView actually renders. It needs these routes:

- `GET /` — home page (simple HTML showing "VMSpillet" and the user's session status)
- `GET /onboarding` — onboarding page (simple HTML)
- `GET /auth/login` — this page should never actually render in the WebView (the app intercepts it), but serve a simple fallback HTML saying "This page is intercepted by the app"
- `GET /login` — teaser/login page with a "Log ind" button that links to the native login URL
- `GET /nap/vm2026/login` — another login trigger URL. The React Native app intercepts navigations to this path to trigger native login. Serve a simple fallback HTML.
- `GET /{*splat}` — catch-all for any other destination pages, show a simple page with the path

The seal app should also read the `vmspillet_game_session` cookie (shared with seashell via the same domain) to display session status on pages. Use `cookie-parser`.

### 4. Cross-origin considerations for localhost

Since both apps run on `localhost` but on different ports, they are technically different origins. For the cookie sharing to work:

- Set cookies with `Domain=localhost` (or omit Domain — cookies without an explicit Domain attribute are sent to the exact host including all ports on localhost)
- Actually, on localhost the simplest approach: seashell sets the cookie WITHOUT a `Domain` attribute. Cookies set by `localhost:3001` without a Domain attribute will NOT be sent to `localhost:3002`. So instead:

  - **Option A (recommended)**: Seashell sets the cookie in the 302 response, and since the browser follows the redirect to seal, the cookie is set for the seashell origin. Then seal can't read it. This matches production behavior where the cookie has `Domain=.dwarf.dk`.
  - For local testing, the simplest workaround: **have seashell's 302 response set the cookie, and also have a shared in-memory session store** that both apps reference. Seal doesn't need to verify the cookie itself — it just serves static HTML. The auth is verified by seashell only.

  **Simplest approach**: Keep a shared `sessions` Map in a separate module that both apps import. Seashell creates sessions and sets the cookie. When the WebView navigates from seashell (302) to seal, the cookie is only sent back to seashell on subsequent requests, but seal doesn't need it — seal just serves HTML pages.

### 5. CORS headers on seashell

The WebView sends requests to seashell with a Bearer token header. Add CORS middleware to seashell:

```typescript
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", SEAL_ORIGIN);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Authorization, X-Correlation-Id, Content-Type",
  );
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});
```

### 6. Logging

Keep the existing request logging style. Log each branch decision clearly with the branch number, like:

```
[2026-04-09T12:00:00.000Z] GET /api/game/auth/enter?destinationUrl=/&appLoggedIn=true | session=false bearer=true
  → Branch 2: Bearer token → created session abc123… → 302 http://localhost:3002/
```

Log the seashell and seal URLs on startup:

```
Seashell (API) running on http://localhost:3001
Seal (Frontend) running on http://localhost:3002
```

### 7. Configuration

Use environment variables with sensible defaults:

- `SEASHELL_PORT` — default `3001`
- `SEAL_PORT` — default `3002`
- Derive `SEAL_ORIGIN` as `http://localhost:${SEAL_PORT}` (used in redirects from seashell)

### 8. Keep it simple

- This is a POC/local dev tool. Keep it minimal.
- No real JWT verification — just decode the payload.
- In-memory sessions only (Map).
- No database, no Redis/Valkey.
- Reuse the existing HTML helper functions (`pageShell`, `destinationPage`, `loginPage`) — they produce nice-looking pages.
- Keep the existing dependencies. You may add `cors` package if you prefer, but inline CORS headers are fine too.

## File structure after changes

```
src/
├── index.ts              # Starts both seashell and seal servers
├── seashell.ts            # createSeashellApp() — the API backend
├── seal.ts                # createSealApp() — the static frontend
├── sessions.ts            # Shared in-memory session store
└── html.ts                # Shared HTML helpers (pageShell, etc.)
```

You can keep `app.ts` and rename it, or delete it and create the new files. Up to you — just make sure the old single-server code is fully replaced.

## How the React Native app will connect

After these changes, the app's `VMSpilletScreen.tsx` debug override will be changed from:

```typescript
base_url: 'https://seal-app-preprod.dwarf.dk',
seashell_url: 'https://seashell-app-preprod.dwarf.dk',
```

to:

```typescript
base_url: 'http://localhost:3002',
seashell_url: 'http://localhost:3001',
```

The auth flow from the app's perspective:

1. App loads `http://localhost:3001/api/game/auth/enter?destinationUrl=/&appLoggedIn=true` with `Authorization: Bearer <vmToken>`
2. Seashell validates token → creates session → sets cookie → 302 to `http://localhost:3002/`
3. WebView follows redirect to seal, renders the page
4. If no Bearer token but `appLoggedIn=true` → seashell 302s to `http://localhost:3002/auth/login?destinationUrl=/` → app intercepts this and triggers native login

## Verification

After making changes:

1. Run `npm run dev` and verify both servers start
2. Test with curl:

   ```bash
   # Branch 4: no session, no appLoggedIn → 302 to seal /login
   curl -v 'http://localhost:3001/api/game/auth/enter?destinationUrl=/&appLoggedIn=false'

   # Branch 3: appLoggedIn=true → 302 to seal /auth/login
   curl -v 'http://localhost:3001/api/game/auth/enter?destinationUrl=/invite&appLoggedIn=true'

   # Branch 2: Bearer token → 302 to seal destination (with Set-Cookie)
   # Use a fake JWT: header.payload.signature where payload has "sub"
   FAKE_JWT=$(echo -n '{"alg":"RS256","kid":"test"}' | base64 | tr -d '=').$(echo -n '{"sub":"user123","exp":9999999999}' | base64 | tr -d '=').fakesig
   curl -v -H "Authorization: Bearer $FAKE_JWT" 'http://localhost:3001/api/game/auth/enter?destinationUrl=/&appLoggedIn=true'

   # Branch 1: with session cookie → 302 to seal destination
   # (use the session cookie from the previous response)
   curl -v -b 'vmspillet_game_session=<token-from-previous>' 'http://localhost:3001/api/game/auth/enter?destinationUrl=/game'

   # Auth me endpoint
   curl -v -b 'vmspillet_game_session=<token-from-previous>' 'http://localhost:3001/api/game/auth/me'

   # Seal pages
   curl -v 'http://localhost:3002/'
   curl -v 'http://localhost:3002/auth/login'
   curl -v 'http://localhost:3002/login'
   ```

3. Verify TypeScript compiles: `npx tsc --noEmit`
