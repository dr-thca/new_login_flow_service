import cookieParser from "cookie-parser";
import express, { Request, Response } from "express";
import { createSession, deleteSession, getSession } from "./sessions.js";

const SESSION_COOKIE_NAME = "vmspillet_game_session";

interface SeashellConfig {
  sealPort: number;
}

function requestedDestination(req: Request): string {
  const destination = req.query.destinationUrl;
  if (typeof destination === "string" && destination.length > 0) {
    return destination;
  }
  return "/";
}

function decodeJwtSub(token: string): string | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error(`expected 3 JWT parts, got ${parts.length}`);
  }

  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as {
    sub?: unknown;
  };

  if (typeof payload.sub === "string" && payload.sub.length > 0) {
    return payload.sub;
  }

  return undefined;
}

function sealOriginFromRequest(req: Request, config: SeashellConfig): string {
  const host = req.hostname ?? "localhost";
  return `http://${host}:${config.sealPort}`;
}

function fullSealUrl(
  req: Request,
  config: SeashellConfig,
  path: string,
): string {
  return `${sealOriginFromRequest(req, config)}${path}`;
}

export function createSeashellApp(config: SeashellConfig) {
  const app = express();

  app.use(cookieParser());

  app.use((req: Request, res: Response, next) => {
    res.header(
      "Access-Control-Allow-Origin",
      sealOriginFromRequest(req, config),
    );
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

  app.use((req: Request, _res: Response, next) => {
    const hasSession = !!req.cookies?.[SESSION_COOKIE_NAME];
    const hasBearer = !!req.headers.authorization;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url}` +
        ` | session=${hasSession} bearer=${hasBearer}`,
    );
    next();
  });

  app.get("/api/game/auth/enter", (req: Request, res: Response) => {
    const destinationUrl = requestedDestination(req);
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME] as
      | string
      | undefined;
    const session = getSession(sessionToken);

    if (sessionToken && session) {
      const redirectTarget = fullSealUrl(req, config, destinationUrl);
      console.log(
        `  -> Branch 1: valid session ${sessionToken.slice(0, 8)}... -> 302 ${redirectTarget}`,
      );
      res.redirect(302, redirectTarget);
      return;
    }

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      let userId: string;
      try {
        userId = decodeJwtSub(token) ?? "anonymous";
      } catch (err) {
        console.log(`  -> Branch 2: invalid JWT — ${err}`);
        res.status(401).json({ error: "invalid token" });
        return;
      }

      const sessionToken = createSession(userId);
      res.cookie(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: "none",
        secure: false,
      });

      const redirectTarget = fullSealUrl(req, config, destinationUrl);
      console.log(
        `  -> Branch 2: Bearer token accepted, user=${userId}, session=${sessionToken.slice(0, 8)}... -> 302 ${redirectTarget}`,
      );
      res.redirect(302, redirectTarget);
      return;
    }

    const appLoggedIn = req.query.appLoggedIn;
    if (appLoggedIn === "true") {
      const redirectTarget = fullSealUrl(
        req,
        config,
        `/auth/login?destinationUrl=${encodeURIComponent(destinationUrl)}`,
      );
      console.log(`  -> Branch 3: appLoggedIn=true -> 302 ${redirectTarget}`);
      res.redirect(302, redirectTarget);
      return;
    }

    const redirectTarget = fullSealUrl(req, config, "/login");
    console.log(
      "  -> Branch 4: appLoggedIn missing/false -> 302 " + redirectTarget,
    );
    res.redirect(302, redirectTarget);
  });

  app.get("/api/game/auth/me", (req: Request, res: Response) => {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME] as
      | string
      | undefined;
    const session = getSession(sessionToken);

    if (!sessionToken || !session) {
      res.status(401).json({ authenticated: false });
      return;
    }

    res.status(200).json({
      authenticated: true,
      user: {
        id: session.userId,
      },
      session: {
        token: `${sessionToken.slice(0, 8)}...`,
        createdAt: session.createdAt.toISOString(),
      },
    });
  });

  app.get("/api/game/auth/clear-session", (req: Request, res: Response) => {
    const sessionToken = req.cookies?.[SESSION_COOKIE_NAME] as
      | string
      | undefined;
    const deleted = deleteSession(sessionToken);
    console.log(
      `  -> Clear session: ${deleted ? "deleted" : "no session found"}`,
    );
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    res.status(200).json({ cleared: deleted });
  });

  return app;
}
