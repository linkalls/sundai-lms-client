# sundai-lms-client

[日本語ドキュメント](README.ja.md)

Unofficial **Bun + TypeScript** API client for reading **your own** Sundai LMS student data.

> [!IMPORTANT]
> This project is **unofficial**, not affiliated with Sundai. Endpoints were observed in the publicly served LMS frontend on 2026-10-23. They can change without notice. Use your own account only, follow the service's terms and avoid excessive polling. Never publish session tokens or raw student exports.

## What it can read

- Student profile and mock exam results (`GET /users/my_detail` → `exam_results.items`)
- Announcements, user notifications, and tags
- Handouts, categories, PDF files and document metadata
- Surveys, weekly survey statistics
- Subject preferences, teachers, and learning activity statistics
- Calendar entries, interview booking slots and classroom-related metadata
- Personal chat and study plans

The API includes some account-scoped write methods for read-state/surveys, but the CLI in this repository performs read-only data exports. Administrator/master endpoints are deliberately excluded.

## Requirements

- [Bun](https://bun.sh/docs) 1.2+
- A valid **personal** Sundai LMS account

```bash
bun install
bun run check
bun test
```

## Login

An email/password SSO helper is included from the original client. Its availability depends on the currently deployed Sundai authentication flow; it might not work for every account or if the login flow changes.

```bash
# Only use your own credentials and your own private terminal.
export SUNDAI_LMS_EMAIL='your-account@example.com'
export SUNDAI_LMS_PASSWORD='your-password'
bun run bin/sundai-lms.ts login
unset SUNDAI_LMS_PASSWORD
```

The `login` command stores a reusable session as `sundai-lms-session.json` with permission `0600`. Never commit, share or paste it. You may also provide an existing valid session to the client programmatically.

## Fetch real mock-exam results

```bash
bun run bin/sundai-lms.ts exams
```

This writes `exams.json` locally (ignored by Git). To export the full profile or available resource categories:

```bash
bun run bin/sundai-lms.ts profile
bun run bin/sundai-lms.ts export
```

The export includes personal information and is not suitable for public sharing. The calendar export uses a bounded ±31-day window by default; pass `calendarEntries` as an `exportAll` option to customize the query.

## Use from TypeScript

```ts
import { SundaiLmsClient, loadSession } from "./src/index.ts";

// Authentication headers are loaded from your own local, private session.
const session = await loadSession("sundai-lms-session.json");
const client = SundaiLmsClient.fromSession(session);

// Mock exams contain the subject scores, deviations and judgement details.
const exams = await client.getExamResults();
console.log(`Mock exams: ${exams.length}`);

// Read your own announcements and handouts.
const announcements = await client.listContacts();
const handouts = await client.listHandouts();
console.log(`Announcements: ${announcements.items.length}`);
console.log(`Handouts: ${handouts.items.length}`);

// These dates use YYYYMMDD, as required by the LMS API.
const calendar = await client.listCalendarEntries("20261001", "20261115");
console.log(`Calendar events: ${calendar.items.length}`);
```

### Notes on response formats

The original server JSON is `snake_case`. The library automatically converts object keys to `camelCase`, including nested keys:

- `exam_results.items` → `detail.examResults.items`
- `subjects[].full_score` → `subjects[].fullScore`
- `judgement_details[].judgement_rank` → `judgementDetails[].judgementRank`

Some list endpoints return `{ items: [...] }`, whereas calendar/booking endpoints return `{ entries: [...] }`. The client normalizes these to `Paginated<T>.items` and retains the original parsed object in `.raw`.

`GET /chats/me` returns a **single chat object**, not a paginated list. Use `getMyChat()`.

## Development / CI

```bash
bun install
bun run check
bun test
```

Unit tests use mocked fetch responses and do not require real Sundai credentials. A GitHub Actions workflow runs these checks on every push and pull request.

## Security

- `.gitignore` excludes local sessions, `.env`, exam results, and other private exports.
- Do not put login credentials or access-token headers directly into source files or shell history.
- Read-only polling should use a reasonable interval; this project does not include an automatic high-frequency monitor.
- A successful `200` does not imply permission to access arbitrary users. Only operate on resources returned to your own account.

## License

MIT for this client source code. Sundai's LMS and its API remain the property of their respective owners.
