# new_login_flow_service

A local POC/development test server that simulates the **Dwarf VMSpillet login authentication flow**. It lets developers test how a React Native WebView performs token-based auth against Dwarf's production system (`dwarf.dk`) without needing access to real servers.

## Servers

### Seashell — API Backend (`http://localhost:3001`)

Mirrors `seashell-app-preprod.dwarf.dk`. This is the server your app/client should talk to. It handles authentication, session management, and issues redirects based on the auth state of the request.

Point your WebView or HTTP client at:
```
http://localhost:3001/api/game/auth/enter?destinationUrl=<path>
```

### Seal — Frontend (`http://localhost:3002`)

Mirrors `seal-app-preprod.dwarf.dk`. This is the server that serves the HTML pages rendered inside the WebView. You do not call this directly — Seashell redirects to it after auth decisions are made.

---

## Architecture

The service runs two independent Express servers in a single process, mirroring the production two-subdomain architecture:

| Server | Port | Role |
|--------|------|------|
| **Seashell** | `3001` | API/backend — handles auth logic, sessions, and CORS |
| **Seal** | `3002` | Static frontend — serves HTML pages rendered in the WebView |

### Seashell Auth Decision Tree (`GET /api/game/auth/enter`)

| Branch | Condition | Action |
|--------|-----------|--------|
| 1 | Has valid `vmspillet_game_session` cookie | 302 → Seal `destinationUrl` |
| 2 | Has `Authorization: Bearer <JWT>` header | Decode JWT, create session, set cookie, 302 → Seal `destinationUrl` |
| 3 | `appLoggedIn=true`, no session, no Bearer | 302 → Seal `/auth/login?destinationUrl=...` (app intercepts) |
| 4 | Fallback | 302 → Seal `/login` (teaser/login page) |

Additional Seashell endpoints:
- `GET /api/game/auth/me` — returns session user data or 401
- `GET /api/game/auth/clear-session` — clears session cookie and removes it from the store

### Seal Routes

| Route | Purpose |
|-------|---------|
| `GET /` | Home page |
| `GET /onboarding` | Onboarding page |
| `GET /auth/login` | Intercepted by the app; fallback HTML if not intercepted |
| `GET /login` | Teaser/login page |
| `GET /nap/vm2026/login` | Native login trigger URL — app intercepts this |
| `GET /{*splat}` | Catch-all destination page with session status |

## Project Structure

```
src/
├── index.ts      Entry point — starts both servers
├── seashell.ts   API backend, auth decision tree, CORS
├── seal.ts       Frontend HTML page server
├── sessions.ts   Shared in-memory session store (30s TTL)
├── html.ts       HTML template helpers
└── app.ts        Legacy single-server implementation (superseded)
```

## Getting Started

### Prerequisites

- Node.js
- npm

### Install

```bash
npm install
```

### Run (development)

```bash
npm run dev
```

Starts both servers with hot reload via `tsx watch`.

- Seashell: http://localhost:3001
- Seal: http://localhost:3002

### Build & Run (production)

```bash
npm run build
npm start
```

## Configuration

Environment variables with defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `SEASHELL_PORT` | `3001` | API/backend server port |
| `SEAL_PORT` | `3002` | Frontend server port |

## Session Store

Sessions are stored in memory (`Map`) with a **30-second TTL**. The shared store is imported by both Seashell and Seal, allowing Seal to check session status across origins.

Session cookie: `vmspillet_game_session` (`httpOnly`, `sameSite: none`, no explicit domain).

> **Note:** JWT handling is POC-grade — payloads are Base64url-decoded only, with no signature verification.

## Tech Stack

- **TypeScript** (strict, ESM, ES2022)
- **Express 5**
- **tsx** (dev runner with hot reload)
- **cookie-parser**, **uuid**
