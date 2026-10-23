<div align="center">

# sundai-lms-client

**An unofficial Bun + TypeScript client for accessing your own Sundai LMS student data**

[![CI](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml/badge.svg)](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml)
![Bun](https://img.shields.io/badge/runtime-Bun-14151A?logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[日本語](README.md) · [Getting started](#getting-started) · [API reference](#api-reference) · [Security](#security)

</div>

> [!IMPORTANT]
> **Unofficial and experimental.** This project is not affiliated with Sundai. It uses endpoints observed in the publicly served LMS frontend, which can change without notice. Use it **only with your own account and information you are authorized to view**, and respect the service's terms.

## Features

- Read mock-exam scores, maximum scores, deviations, and university application judgments.
- Retrieve announcements, personal notifications, handouts, PDF files, and surveys.
- Access subjects, teachers, learning activity statistics, calendar entries, and interview booking slots.
- Export supported personal LMS data to local JSON files.

This repository contains the **API client and command-line interface only**—no Expo, React Native, or Android app. It is not published on npm.

## Getting started

### Install

Requires [Bun](https://bun.sh/) 1.2 or later.

```bash
git clone https://github.com/linkalls/sundai-lms-client.git
cd sundai-lms-client
bun install
```

### Authenticate

All data requests require a valid session belonging to the current student. An email/password SSO helper is included, but **compatibility with the currently deployed login flow has not been verified**.

```bash
# Run in Bash. Interactive input avoids storing credentials in shell history.
read -r -p 'LMS email: ' SUNDAI_LMS_EMAIL
read -r -s -p 'LMS password: ' SUNDAI_LMS_PASSWORD
printf '\n'
export SUNDAI_LMS_EMAIL SUNDAI_LMS_PASSWORD
bun run bin/sundai-lms.ts login
unset SUNDAI_LMS_EMAIL SUNDAI_LMS_PASSWORD
```

A successful login writes `sundai-lms-session.json`. The session contains live authentication credentials; treat it like a password. On Unix-like systems, the file is written with permission `0600`. You can also supply an existing valid `SundaiLmsSession` programmatically.

### Export your mock-exam results

```bash
bun run bin/sundai-lms.ts exams
```

This produces `exams.json`, containing your normalized `exam_results.items`. The following is **fictional sample data**, not a real student's result:

```json
{
  "exportedAt": "2026-10-23T12:00:00.000Z",
  "total": 1,
  "items": [
    {
      "year": "2026",
      "name": "Example exam",
      "subjects": [
        {
          "name": "English",
          "score": 80,
          "fullScore": 100,
          "deviation": 60.0
        }
      ],
      "judgementDetails": [
        {
          "universityName": "Example University",
          "facultyName": "Faculty of Letters",
          "judgementRank": "B"
        }
      ]
    }
  ]
}
```

## CLI commands

| Command | Action | Default output |
| --- | --- | --- |
| `bun run bin/sundai-lms.ts login` | Create a personal session (unverified SSO helper) | `sundai-lms-session.json` |
| `bun run bin/sundai-lms.ts exams` | Export mock exams | `exams.json` |
| `bun run bin/sundai-lms.ts profile` | Export full profile including exams | `profile.json` |
| `bun run bin/sundai-lms.ts export` | Export supported notices, handouts, and other categories | `export.json` |

The `exams`, `profile`, and `export` commands use an existing session and perform reads only. To change input and output paths:

```bash
bun run bin/sundai-lms.ts exams sundai-lms-session.json my-exams.json
bun run bin/sundai-lms.ts profile sundai-lms-session.json my-profile.json
bun run bin/sundai-lms.ts export sundai-lms-session.json my-export.json
```

> [!WARNING]
> `.gitignore` covers the **default filenames**. Custom output names containing sensitive data must be excluded from version control manually. The `export` command exports its implemented categories, **not mock exams**; use `exams` or `profile` for those. Calendar exports default to a ±31-day range around the current Japan-local date.

## TypeScript example

Save as `example.ts` at the repository root and run `bun run example.ts`.

```ts
import { SundaiLmsClient, loadSession } from "./src/index.ts";

// Load credentials from your own local, private session file.
const session = await loadSession("sundai-lms-session.json");
const client = SundaiLmsClient.fromSession(session);

// Read exam scores, deviations, and university judgments.
const exams = await client.getExamResults();
console.log(`Mock exams: ${exams.length}`);

// Read announcements and handouts.
const contacts = await client.listContacts();
const handouts = await client.listHandouts();
console.log(`Announcements: ${contacts.items.length}`);
console.log(`Handouts: ${handouts.items.length}`);

// Date parameters use YYYYMMDD.
const calendar = await client.listCalendarEntries("20261001", "20261115");
console.log(`Calendar events: ${calendar.items.length}`);
```

### Response normalization

The LMS returns `snake_case` JSON keys. The library recursively converts them to `camelCase`:

| Server JSON | Client property |
| --- | --- |
| `exam_results.items` | `detail.examResults.items` |
| `subjects[].full_score` | `subjects[].fullScore` |
| `judgement_details[].judgement_rank` | `judgementDetails[].judgementRank` |

```ts
const detail = await client.getMyDetail();
const items = detail.examResults?.items ?? [];

// Shortcut for the same items array.
const exams = await client.getExamResults();
```

List results are normalized to `.items`, including endpoints that return `{ entries: [...] }` (calendar and interview booking slots). The original parsed object remains available as `.raw`. `/chats/me` is a **single object**, not a list; use `getMyChat()`.

## API reference

Base URL: `https://api.lms.sundai-edfu.com/api`

These are the main implemented **student-scoped read methods**, based on the frontend and account-level checks on October 23, 2026. Some ID-specific routes were identified in the frontend but not verified with live content.

| Client method | HTTP | Path |
| --- | --- | --- |
| `getProfile()` | GET | `/users/me` |
| `getMyDetail()` / `getExamResults()` | GET | `/users/my_detail` |
| `listContacts()` / `getContact(id)` | GET | `/contacts` / `/contacts/:id` |
| `listUserNotifications()` / `listFullUserNotifications()` | GET | `/user_notifications` / `/user_notifications/full` |
| `listHandouts()` / `getHandoutFile(id)` | GET | `/handouts` / `/handouts/:id/file` |
| `listHandoutCategories()` / `listHandoutTags()` | GET | `/handout_categories/list` / `/handout_tags/list` |
| `listSurveys()` / `getSurvey(id)` | GET | `/user_surveys` / `/user_surveys/:id` |
| `getWeeklySurveyData()` | GET | `/user_surveys/my_weekly_data` |
| `listSubjects()` / `listTeachers()` | GET | `/subjects` / `/teachers` |
| `listFavoriteSubjects()` | GET | `/favorite_subjects` |
| `listLearningActivities(subjectId)` | GET | `/al_activities/me?subject_id=...` |
| `getLearningActivityStats(subjectId)` | GET | `/al_activity_stats/me?subject_id=...` |
| `listCalendarEntries(fromDate, toDate)` | GET | `/calendar_entries?from_date=...&to_date=...` |
| `listInterviewBookings(fromDate, toDate)` | GET | `/interview_bookings?from_date=...&to_date=...` |
| `listContactTags()` / `listUserContactTags()` | GET | `/contact_tags` / `/user_contact_tags` |
| `getClassSurveyPeriods()` | GET | `/class_survey_periods` |
| `getMyChat()` / `getChat(id)` | GET | `/chats/me` / `/chats/:id` |
| `listStudyPlans()` / `getStudyPlan(id)` | GET | `/study_plans` / `/study_plans/:id` |
| `listDocumentDirectories()` / `getDocument(id)` | GET | `/document_directories` / `/documents/:id` |
| `getBooking(id)` / `getSubmission(id)` | GET | `/bookings/:id` / `/submissions/:id` |

Date arguments are `YYYYMMDD` strings. Learning activity methods require a subject ID. `getHandoutFile()` returns a `Response` (typically PDF), not JSON.

**State-changing methods** such as `markContactRead()`, `markChatRead()` and `updateSurvey()` also exist in the library, although the CLI never calls them. They can modify account state when invoked directly.

## Security

- Never commit sessions, `.env` files, raw student responses, or downloaded personal documents.
- CLI output files and sessions use `0600` permissions on Unix-like systems.
- `.gitignore` cannot identify all arbitrary filenames. Review staged files before pushing.
- Avoid logging sensitive response bodies, especially in CI or issue reports.
- Use only resources authorized for your own account; administrator endpoints and third-party student data are not supported.
- Avoid aggressive polling. No continuous monitoring service is included in this repository.

## Testing

```bash
bun install
bun run check
bun test
```

Tests use mocked HTTP responses and do **not** need a Sundai account. [GitHub Actions CI](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml) runs type checks and tests on pushes and pull requests.

## License

Client source: [MIT](LICENSE). The LMS, API, trademarks, and service content remain the property of their respective owners.
