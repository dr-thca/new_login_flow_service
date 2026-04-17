import cookieParser from "cookie-parser";
import express, { Request, Response } from "express";
import { destinationPage, loginPage, pageShell } from "./html.js";
import { getSession } from "./sessions.js";

const SESSION_COOKIE_NAME = "vmspillet_game_session";

function sessionStatus(req: Request): { userId?: string; hasSession: boolean } {
  const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  const session = getSession(token);
  if (token && session) {
    return { userId: session.userId, hasSession: true };
  }
  return { hasSession: false };
}

function statusText(hasSession: boolean): string {
  return hasSession ? "Aktiv session fundet" : "Ingen session tilgaengelig";
}

export function createSealApp() {
  const app = express();

  app.use(cookieParser());

  app.use((req: Request, _res: Response, next) => {
    const hasSession = !!req.cookies?.[SESSION_COOKIE_NAME];
    const hasBearer = !!req.headers.authorization;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url}` +
        ` | session=${hasSession} bearer=${hasBearer}`,
    );
    next();
  });

  app.get("/", (req: Request, res: Response) => {
    const status = sessionStatus(req);
    res.status(200).send(destinationPage("/", status.userId));
  });

  app.get("/onboarding", (req: Request, res: Response) => {
    const status = sessionStatus(req);
    res.status(200).send(
      pageShell(
        "Onboarding - VMSpillet",
        `<h1>Onboarding</h1><p>${statusText(status.hasSession)}</p>`,
      ),
    );
  });

  app.get("/auth/login", (_req: Request, res: Response) => {
    res
      .status(200)
      .send(
        pageShell(
          "Auth Login Intercept",
          "<h1>/auth/login</h1><p>Denne side bliver normalt intercepted af appen.</p>",
        ),
      );
  });

  app.get("/login", (req: Request, res: Response) => {
    const destinationUrl =
      typeof req.query.destinationUrl === "string" && req.query.destinationUrl.length > 0
        ? req.query.destinationUrl
        : "/";
    res.status(200).send(loginPage(destinationUrl));
  });

  app.get("/nap/vm2026/login", (_req: Request, res: Response) => {
    res
      .status(200)
      .send(
        pageShell(
          "Native Login Trigger",
          "<h1>/nap/vm2026/login</h1><p>Denne URL bliver normalt intercepted af appen for native login.</p>",
        ),
      );
  });

  app.get("/{*splat}", (req: Request, res: Response) => {
    const status = sessionStatus(req);
    const path = req.originalUrl || req.path;
    res.status(200).send(destinationPage(path, status.userId));
  });

  return app;
}
