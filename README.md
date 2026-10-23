<div align="center">

# sundai-lms-client

**駿台LMSの学生本人向けAPIを利用する非公式Bun / TypeScriptクライアント**

[![CI](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml/badge.svg)](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml)
![Bun](https://img.shields.io/badge/runtime-Bun-14151A?logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.en.md) · [使い方](#クイックスタート) · [API一覧](#api一覧) · [セキュリティ](#セキュリティ)

</div>

> [!IMPORTANT]
> **本プロジェクトは非公式の実験的実装であり、駿台および駿台LMSの運営元とは関係がない。** 公開フロントエンドで確認されたAPIを使用するため、仕様変更によって動作しなくなる可能性がある。利用対象は**本人のアカウントで閲覧を許可されたデータ**に限定し、サービスの利用規約を遵守すること。

## 主な機能

- **模試成績の取得** — 得点、満点、偏差値、志望校判定を取得
- **お知らせ・通知の取得** — 一覧、本文、添付資料の情報
- **配布資料の取得** — 一覧やPDFダウンロード
- **学習情報の取得** — 科目、講師、学習活動、アンケート
- **予定の取得** — カレンダー、面談予約枠
- **個人データのエクスポート** — JSONとしてローカル保存

本リポジトリには**APIクライアントおよびCLIのみ**を収録する。Expo、React Native、Androidアプリは含まれない。npmパッケージとしては未公開。

## クイックスタート

### 1. インストール

実行環境には[Bun](https://bun.sh/) 1.2以降が必要。

```bash
git clone https://github.com/linkalls/sundai-lms-client.git
cd sundai-lms-client
bun install
```

### 2. 認証セッションの準備

LMSへのアクセスには、**本人の有効な認証セッション**が必要となる。メールアドレスとパスワードを使用するSSO認証ヘルパーを同梱している。ただし、**現行の認証フローとの互換性は未検証**であり、正常動作は保証されない。

```bash
# Bashで対話入力し、認証情報をコマンド履歴へ記録しない。
read -r -p 'LMS email: ' SUNDAI_LMS_EMAIL
read -r -s -p 'LMS password: ' SUNDAI_LMS_PASSWORD
printf '\n'
export SUNDAI_LMS_EMAIL SUNDAI_LMS_PASSWORD

# 認証成功時に sundai-lms-session.json を生成する。
bun run bin/sundai-lms.ts login

# 使用後は認証情報を環境変数から削除する。
unset SUNDAI_LMS_EMAIL SUNDAI_LMS_PASSWORD
```

セッションファイルには認証トークンが保存されるため、**パスワードと同等の機密情報として管理する必要がある**。Unix系OSでは、生成時のファイル権限は所有者のみ読み書き可能な `0600` に設定される。SSOヘルパーを利用できない場合は、有効な本人用 `SundaiLmsSession` をプログラムから渡すことも可能。

### 3. 模試成績の取得

```bash
bun run bin/sundai-lms.ts exams
```

取得に成功した場合、`exam_results.items` の内容が `exams.json` に出力される。JSONのキー名は `camelCase` に正規化される。

```json
{
  "exportedAt": "2026-10-23T12:00:00.000Z",
  "total": 1,
  "items": [
    {
      "year": "2026",
      "name": "サンプル模試",
      "subjects": [
        {
          "name": "英語",
          "score": 80,
          "fullScore": 100,
          "deviation": 60.0
        }
      ],
      "judgementDetails": [
        {
          "universityName": "サンプル大学",
          "facultyName": "文学部",
          "judgementRank": "B"
        }
      ]
    }
  ]
}
```

**注記：** 上記のJSONはレスポンス構造を説明するための架空データである。実際の成績、個人情報、セッショントークンは本リポジトリに含まれない。

## CLIリファレンス

| コマンド | 動作 | 既定の出力 |
| --- | --- | --- |
| `bun run bin/sundai-lms.ts login` | 自分のSSOセッションを作成（未検証） | `sundai-lms-session.json` |
| `bun run bin/sundai-lms.ts exams` | 模試成績を取得 | `exams.json` |
| `bun run bin/sundai-lms.ts profile` | プロフィール詳細を取得（模試を含む） | `profile.json` |
| `bun run bin/sundai-lms.ts export` | お知らせ、配布資料などをまとめて取得 | `export.json` |

`exams`、`profile`、`export` は保存済みセッションを使用し、**読み取り処理のみ**を実行する。出力先はコマンドライン引数で指定できる。

```bash
# 引数は [session.json] [output.json] の順に指定する。
bun run bin/sundai-lms.ts exams sundai-lms-session.json my-exams.json
bun run bin/sundai-lms.ts profile sundai-lms-session.json my-profile.json
bun run bin/sundai-lms.ts export sundai-lms-session.json my-export.json
```

> [!WARNING]
> `.gitignore` で除外されるのは、`exams.json` などの**既定のファイル名に限られる**。任意のファイル名で出力する場合、個人情報を含むファイルは別途Git管理対象から除外すること。`export` は実装済みのデータカテゴリのみを対象とし、模試成績の取得には `exams` または `profile` を使用する。カレンダーの既定の対象期間は、日本時間の当日を中心とした前後31日間。

## TypeScriptからの利用

以下のコードをリポジトリ直下の `example.ts` に保存して実行する。

```ts
import { SundaiLmsClient, loadSession } from "./src/index.ts";

// 認証情報が含まれるローカルのセッションを読み込む。
const session = await loadSession("sundai-lms-session.json");
const client = SundaiLmsClient.fromSession(session);

// 模試成績（科目別の得点・偏差値・志望校判定）を取得する。
const exams = await client.getExamResults();
console.log(`模試成績: ${exams.length}件`);

// お知らせと配布資料の一覧を取得する。
const contacts = await client.listContacts();
const handouts = await client.listHandouts();
console.log(`お知らせ: ${contacts.items.length}件`);
console.log(`配布資料: ${handouts.items.length}件`);

// カレンダーAPIの日付指定は YYYYMMDD 形式。
const calendar = await client.listCalendarEntries("20261001", "20261115");
console.log(`カレンダー: ${calendar.items.length}件`);
```

```bash
bun run example.ts
```

### レスポンスの正規化

LMSのレスポンスに含まれる `snake_case` のキー名は、クライアント側で再帰的に `camelCase` へ変換される。

| LMSからの生レスポンス | TypeScriptでの取得値 |
| --- | --- |
| `exam_results.items` | `detail.examResults.items` |
| `subjects[].full_score` | `subjects[].fullScore` |
| `judgement_details[].judgement_rank` | `judgementDetails[].judgementRank` |

```ts
const detail = await client.getMyDetail();
const items = detail.examResults?.items ?? [];

// 模試成績の配列のみを取得する簡易メソッド。
const exams = await client.getExamResults();
```

多くの一覧APIは `{ items: [...] }` を返す。一方、カレンダーおよび面談予約枠のAPIは `{ entries: [...] }` を返す。クライアントは双方を `.items` に正規化し、元のレスポンス構造を `.raw` に保持する。`/chats/me` は単一オブジェクトを返すため、`getMyChat()` を使用する。

## API一覧

ベースURL：`https://api.lms.sundai-edfu.com/api`

以下は学生本人向けの主な**読み取りメソッド**。2026年10月23日時点のフロントエンド解析および動作確認に基づく。`/documents/:id` など一部のエンドポイントはフロントエンド上の定義のみ確認しており、すべてのAPIについて実データの取得を検証したものではない。

| クライアントのメソッド | HTTP | パス |
| --- | --- | --- |
| `getProfile()` | GET | `/users/me` |
| `getMyDetail()` / `getExamResults()` | GET | `/users/my_detail` |
| `listContacts()` | GET | `/contacts` |
| `getContact(id)` | GET | `/contacts/:id` |
| `listUserNotifications()` | GET | `/user_notifications` |
| `listFullUserNotifications()` | GET | `/user_notifications/full` |
| `listHandouts()` | GET | `/handouts` |
| `getHandoutFile(id)` | GET | `/handouts/:id/file` |
| `listHandoutCategories()` | GET | `/handout_categories/list` |
| `listHandoutTags()` | GET | `/handout_tags/list` |
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

`fromDate` および `toDate` には `YYYYMMDD` 形式の日付、`subjectId` には科目IDを指定する。`getHandoutFile()` はJSONではなく `Response`（通常はPDF）を返す。

ライブラリには `markContactRead()`、`markChatRead()`、`updateSurvey()` などの**状態変更メソッド**も存在する。CLIからは呼び出されないが、プログラムから直接実行した場合はアカウントの状態が変更される。

## セキュリティ

- セッションJSON、`.env`、エクスポートした成績やお知らせ本文を公開しない。
- CLIが作成するファイルはUnix系OSでは `0600` に設定される。ただし認証情報を入力した端末自体の安全性も必要。
- `.gitignore` では**あらゆる名前の機密ファイルを自動検知できない**。pushする前に必ず差分を確認する。
- APIには個人情報が含まれるため、ログやCIの標準出力にも生レスポンスを出さない。
- 学生本人が利用できるエンドポイントのみを使い、管理者向けのAPIや第三者の情報は扱わない。
- 短い間隔での大量アクセスを避ける。監視タイマーなどのバックグラウンドサービスはこのリポジトリには含まない。

## テスト・開発

```bash
bun install
bun run check
bun test
```

テストにはモックレスポンスを使用するため、**駿台アカウントは不要**。pushおよびPull Request時には、[GitHub Actions](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml) により型チェックとテストが実行される。

## ライセンス

本クライアントのソースコードは [MIT License](LICENSE) で提供される。駿台LMS、API、関連する商標およびコンテンツの権利は各権利者に帰属する。
