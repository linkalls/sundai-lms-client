import { chmod, writeFile } from "node:fs/promises";
import type { SundaiLmsSession } from "./types";

/**
 * Writes a session. Credentials in this file have the same sensitivity as a password.
 * Always restrict the file to owner read/write on Unix-like systems.
 */
export async function saveSession(path: string, session: SundaiLmsSession): Promise<void> {
  await writeFile(path, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

/** Reads and validates a previously produced authentication session. */
export async function loadSession(path: string): Promise<SundaiLmsSession> {
  const session = await Bun.file(path).json() as SundaiLmsSession;
  if (session.version !== 1 || !session.auth?.token || !session.auth.client || !session.auth.uid) {
    throw new Error("This is not a valid Sundai LMS session file");
  }
  return session;
}
