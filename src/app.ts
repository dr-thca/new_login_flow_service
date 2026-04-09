import express, { Request, Response } from "express";
import cookieParser from "cookie-parser";
import { v4 as uuid } from "uuid";

// ---------------------------------------------------------------------------
// In-memory session store  (POC only)
// ---------------------------------------------------------------------------

interface Session {
  userId: string;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function pageShell(title: string, body: string): string {
  return `
    <!DOCTYPE html>
    <html lang="da">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${title}</title>
      <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #f5f5f7;
          color: #1d1d1f;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }
        .card {
          background: #fff;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,.08);
          padding: 2.5rem;
          max-width: 420px;
          width: 100%;
          text-align: center;
        }
        .card h1 {
          font-size: 1.5rem;
          margin-bottom: .75rem;
        }
        .card p {
          color: #6e6e73;
          line-height: 1.5;
          margin-bottom: 1rem;
        }
        .card code {
          background: #f0f0f3;
          padding: .15em .45em;
          border-radius: 6px;
          font-size: .9em;
        }
        .badge {
          display: inline-block;
          background: #e8f5e9;
          color: #2e7d32;
          padding: .35em .9em;
          border-radius: 20px;
          font-weight: 600;
          font-size: .85rem;
          margin-bottom: 1rem;
        }
        .btn {
          display: inline-block;
          background: #0071e3;
          color: #fff;
          text-decoration: none;
          padding: .75rem 2rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 500;
          transition: background .15s;
        }
        .btn:hover { background: #0061c4; }
      </style>
    </head>
    <body>
      <div class="card">
        ${body}
      </div>
    </body>
    </html>`;
}

function destinationPage(destinationUrl: string, userId: string): string {
  return pageShell("VMSpillet", `
    <span class="badge">Logget ind</span>
    <h1>VMSpillet</h1>
    <p>Du er nu logget ind som <strong>${userId}</strong></p>
    <p>Side: <code>${destinationUrl}</code></p>
  `);
}

function loginPage(destinationUrl: string): string {
  const loginHref = `https://preprod.dr.dk/nap/vm2026/login?destinationUrl=${encodeURIComponent(destinationUrl)}`;

  return pageShell("Log ind – VMSpillet", `
    <h1>Du er ikke logget ind</h1>
    <p>Log ind for at fortsætte til <code>${destinationUrl}</code></p>
    <a class="btn" href="${loginHref}">Log ind</a>
  `);
}

function fullRequestUrl(req: Request): string {
  return req.originalUrl || req.path;
}

function destinationUrlForAuthLogin(req: Request): string {
  const url = new URL(fullRequestUrl(req), "http://localhost");
  url.searchParams.delete("appLoggedIn");
  return `${url.pathname}${url.search}${url.hash}`;
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

export function createApp() {
  const app = express();

  app.use(cookieParser());

  // -----------------------------------------------------------------------
  // Request logger
  // -----------------------------------------------------------------------
  app.use((req: Request, _res: Response, next) => {
    const hasSession = !!req.cookies?.session_id;
    const hasBearer = !!req.headers.authorization;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url}` +
      ` | session=${hasSession} bearer=${hasBearer}`
    );
    next();
  });

  // -----------------------------------------------------------------------
  // Auth endpoint – the Newsapp is redirected here when there's no session.
  // The redirect carries the original destinationUrl so
  // the app can parse it and come back with a Bearer token.
  //
  // In practice the WebView never actually loads this page; it intercepts the
  // 302 and hands control back to the native app.
  // -----------------------------------------------------------------------
  app.get("/auth/login", (req: Request, res: Response) => {
    console.log(`  → /auth/login hit (destinationUrl=${req.query.destinationUrl})`);
    res.status(200).send("This page is intercepted by the Newsapp.");
  });

  // -----------------------------------------------------------------------
  // Catch-all for destination pages (e.g. /invite?id=123)
  //
  // Decision tree (mirrors the sequence diagram):
  //
  //  1. Session cookie exists          → 200 destination page
  //  2. No session + Bearer token      → create session, 302 back (Set-Cookie)
  //  3. No session + appLoggedIn=true  → 302 → /auth/login?destinationUrl=…
  //  4. No session + appLoggedIn missing/false → 200 login page with link
  // -----------------------------------------------------------------------
  app.get("/{*splat}", (req: Request, res: Response) => {
    const sessionId = req.cookies?.session_id;

    // ---- 1. Existing session ------------------------------------------
    if (sessionId && sessions.has(sessionId)) {
      const session = sessions.get(sessionId)!;
      console.log(`  → Branch 1: session found (${sessionId.slice(0, 8)}…, user=${session.userId})`);
      res.status(200).send(destinationPage(destinationUrlForAuthLogin(req), session.userId));
      return;
    }

    // ---- 2. Bearer token (from Newsapp after global-login) ------------
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice("Bearer ".length);

      // POC: decode the JWT payload without verifying the signature
      const parts = token.split(".");
      if (parts.length !== 3) {
        console.log(`  → Branch 2: rejected – not a valid JWT (expected 3 parts, got ${parts.length})`);
        res.status(401).send("Invalid token: not a JWT");
        return;
      }

      let header: Record<string, unknown>;
      let payload: Record<string, unknown>;
      try {
        header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      } catch {
        console.log(`  → Branch 2: rejected – failed to decode JWT`);
        res.status(401).send("Invalid token: malformed JWT");
        return;
      }

      console.log(`  → Branch 2: JWT header:`, header);
      console.log(`  → Branch 2: JWT payload:`, payload);

      const userId = (payload.sub as string) ?? `unknown`;

      const newSessionId = uuid();
      sessions.set(newSessionId, { userId, createdAt: new Date() });

      const redirectUrl = destinationUrlForAuthLogin(req);

      console.log(`  → Branch 2: Bearer token → created session ${newSessionId.slice(0, 8)}… → 302 ${redirectUrl}`);

      res
        .cookie("session_id", newSessionId, { httpOnly: true, sameSite: "lax" })
        .redirect(302, redirectUrl);
      return;
    }

    // ---- 3. No session, appLoggedIn=true → redirect to /auth/login ------
    const appLoggedIn = req.query.appLoggedIn;
    if (appLoggedIn === "true") {
      const dest = destinationUrlForAuthLogin(req);
      console.log(`  → Branch 3: appLoggedIn=true → 302 /auth/login?destinationUrl=${encodeURIComponent(dest)}`);
      res.redirect(302, `/auth/login?destinationUrl=${encodeURIComponent(dest)}`);
      return;
    }

    // ---- 4. No session, not logged in → show login page ----------------
    console.log(`  → Branch 4: no session, no appLoggedIn → login page`);
    res.status(200).send(loginPage(destinationUrlForAuthLogin(req)));
  });

  return app;
}
