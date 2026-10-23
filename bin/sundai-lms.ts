#!/usr/bin/env bun

/**
 * Unofficial Sundai LMS CLI for the current student's own data.
 * No admin API calls, sending messages, booking actions, or read-state mutations.
 *
 * Usage:
 *   bun run ./bin/sundai-lms.ts login [session.json]
 *   bun run ./bin/sundai-lms.ts exams [session.json] [exams.json]
 *   bun run ./bin/sundai-lms.ts profile [session.json] [profile.json]
 *   bun run ./bin/sundai-lms.ts export [session.json] [export.json]
 *
 * Login credentials must come from environment variables, never CLI arguments.
 */

import { chmod, writeFile } from "node:fs/promises";
import { loadSession, saveSession, SundaiLmsClient } from "../src/index";

const [command = "help", ...args] = Bun.argv.slice(2);
const defaultSession = "sundai-lms-session.json";

async function writePrivateJson(path: string, data: unknown): Promise<void> {
  // Restrict the output file to its owner, because exports include personal data.
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

function requiredEnvironment(name: string): string {
  const value = Bun.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function main(): Promise<void> {
  if (command === "login") {
    const path = args[0] ?? defaultSession;
    const session = await SundaiLmsClient.loginWithEmailPassword({
      email: requiredEnvironment("SUNDAI_LMS_EMAIL"),
      password: requiredEnvironment("SUNDAI_LMS_PASSWORD"),
    });
    await saveSession(path, session);
    console.log(`Session saved privately: ${path}`);
    return;
  }

  if (!["exams", "profile", "export"].includes(command)) {
    console.log("Usage:");
    console.log("  bun run bin/sundai-lms.ts login [session.json]");
    console.log("  bun run bin/sundai-lms.ts exams [session.json] [exams.json]");
    console.log("  bun run bin/sundai-lms.ts profile [session.json] [profile.json]");
    console.log("  bun run bin/sundai-lms.ts export [session.json] [export.json]");
    return;
  }

  const sessionFile = args[0] ?? defaultSession;
  const client = SundaiLmsClient.fromSession(await loadSession(sessionFile));

  if (command === "exams") {
    const output = args[1] ?? "exams.json";
    const items = await client.getExamResults();
    await writePrivateJson(output, { exportedAt: new Date().toISOString(), total: items.length, items });
    console.log(`Exported ${items.length} mock exams to ${output}`);
    return;
  }

  if (command === "profile") {
    const output = args[1] ?? "profile.json";
    await writePrivateJson(output, await client.getMyDetail());
    console.log(`Saved your own profile data to ${output}`);
    return;
  }

  const output = args[1] ?? "export.json";
  const snapshot = await client.exportAll();
  await writePrivateJson(output, snapshot);
  console.log(`Exported ${snapshot.contacts.length} notices, ${snapshot.handouts.length} handouts, ${snapshot.surveys.length} surveys, and ${snapshot.calendarEntries.length} calendar items to ${output}`);
}

await main().catch((error: unknown) => {
  // Do not log raw response bodies: they may include student details.
  if (error instanceof Error) console.error(`${error.name}: ${error.message}`);
  else console.error("Command failed");
  process.exitCode = 1;
});
