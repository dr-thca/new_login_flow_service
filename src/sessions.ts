import { v4 as uuid } from "uuid";

const SESSION_TTL_MS = 30_000; // 30 seconds

export interface Session {
  userId: string;
  createdAt: Date;
}

const sessions = new Map<string, Session>();

export function createSession(userId: string): string {
  const token = uuid();
  sessions.set(token, { userId, createdAt: new Date() });
  return token;
}

function isExpired(session: Session): boolean {
  return Date.now() - session.createdAt.getTime() > SESSION_TTL_MS;
}

export function getSession(token?: string): Session | undefined {
  if (!token) {
    return undefined;
  }
  const session = sessions.get(token);
  if (session && isExpired(session)) {
    sessions.delete(token);
    return undefined;
  }
  return session;
}

export function deleteSession(token?: string): boolean {
  if (!token) {
    return false;
  }
  return sessions.delete(token);
}

export function hasSession(token?: string): boolean {
  return !!getSession(token);
}
