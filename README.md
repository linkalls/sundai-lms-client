<div align="center">

# sundai-lms-client

**駿台LMSの自分のデータを、Bun + TypeScriptから扱う非公式APIクライアント**

[![CI](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml/badge.svg)](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml)
![Bun](https://img.shields.io/badge/runtime-Bun-14151A?logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.en.md) · [使い方](#クイックスタート) · [API一覧](#api一覧) · [セキュリティ](#セキュリティ)

</div>

> [!IMPORTANT]
> **非公式・実験的なプロジェクト。** 駿台および駿台LMSの運営元とは無関係だよ。公開フロントエンドから確認したAPIを利用しており、仕様変更により突然動作しなくなる場合がある。**自分のアカウントで閲覧を許可されたデータだけ**を扱い、サービスの利用規約を守ってね。

## できること

- **模試成績の取得** — 得点、満点、偏差値、志望校判定を取得
- **お知らせ・通知の取得** — 一覧、本文、添付資料の情報
- **配布資料の取得** — 一覧やPDFダウンロード
- **学習情報の取得** — 科目、講師、学習活動、アンケート
- **予定の取得** — カレンダー、面談予約枠
- **個人データのエクスポート** — JSONとしてローカル保存

このリポジトリは**APIクライアントとCLIのみ**。Expo / React Native / Androidアプリは含まない。npmへの公開もまだ行っていないよ。

## クイックスタート

### 1. インストール

[Bun](https://bun.sh/) 1.2以降が必要。

```bash
git clone https://github.com/linkalls/sundai-lms-client.git
cd sundai-lms-client
bun install
```

### 2. ログインセッションを用意

LMSにアクセスするには、**本人の有効な認証セッション**が必要。メールアドレスとパスワードを使うSSOヘルパーを同梱しているけど、**現行のログイン画面との互換性は未検証**なので、動作保証はない。

```bash
# Bashで実行。秘密情報をコマンド履歴に残さないよう対話入力する。
read -r -p 'LMS email: ' SUNDAI_LMS_EMAIL
read -r -s -p 'LMS password: ' SUNDAI_LMS_PASSWORD
printf '\n'
export SUNDAI_LMS_EMAIL SUNDAI_LMS_PASSWORD

# 成功すると sundai-lms-session.json が生成される
bun run bin/sundai-lms.ts login

# 認証情報をシェル環境から消す
unset SUNDAI_LMS_EMAIL SUNDAI_LMS_PASSWORD
```

セッションファイルには認証トークンが保存される。**パスワードと同じ強さで保護**してね。作成されるセッションファイルは所有者のみアクセス可能な `0600` 権限になる（Unix系OS）。SSOが使えない場合は、有効な本人用 `SundaiLmsSession` をプログラムから渡すこともできる。

### 3. 模試成績を取得

```bash
bun run bin/sundai-lms.ts exams
```

成功すると、本人の `exam_results.items` を `exams.json` に出力する。データは`camelCase`に正規化される。

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

<sub>上のJSONは**構造の説明用に作った架空データ**。実際の成績、個人情報、セッショントークンはこのリポジトリに含まない。</sub>

## CLIコマンド

| コマンド | 動作 | 既定の出力 |
| --- | --- | --- |
| `bun run bin/sundai-lms.ts login` | 自分のSSOセッションを作成（未検証） | `sundai-lms-session.json` |
| `bun run bin/sundai-lms.ts exams` | 模試成績を取得 | `exams.json` |
| `bun run bin/sundai-lms.ts profile` | プロフィール詳細を取得（模試を含む） | `profile.json` |
| `bun run bin/sundai-lms.ts export` | お知らせ、配布資料などをまとめて取得 | `export.json` |

`exams`、`profile`、`export` は既存セッションを使用し、**読み取りのみ**を行う。引数で保存先を変更できるよ。

```bash
# [session.json] [output.json] の順で指定
bun run bin/sundai-lms.ts exams sundai-lms-session.json my-exams.json
bun run bin/sundai-lms.ts profile sundai-lms-session.json my-profile.json
bun run bin/sundai-lms.ts export sundai-lms-session.json my-export.json
```

> [!WARNING]
> `exams.json` などの**既定のファイル名だけ**を `.gitignore` で除外している。任意の名前で出力した個人データは、自分でGit管理の対象外にしてね。また、`export` の対象は実装されているデータカテゴリに限定され、模試成績の取得は `exams` / `profile` を使う。カレンダーは既定で日本時間の当日から前後31日を対象とする。

## TypeScriptから使う

以下は、リポジトリ直下に `example.ts` として保存して実行できる例。

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

### JSONのキー名について

LMSが返す `snake_case` を、クライアントは再帰的に `camelCase` に変換する。

| LMSからの生レスポンス | TypeScriptでの取得値 |
| --- | --- |
| `exam_results.items` | `detail.examResults.items` |
| `subjects[].full_score` | `subjects[].fullScore` |
| `judgement_details[].judgement_rank` | `judgementDetails[].judgementRank` |

```ts
const detail = await client.getMyDetail();
const items = detail.examResults?.items ?? [];

// 同じ配列を直接取得する便利メソッド。
const exams = await client.getExamResults();
```

一覧APIは `{ items: [...] }` が基本だけど、カレンダーと面談予約枠は `{ entries: [...] }` を返す。クライアントは両方を `.items` に統一している。元のレスポンス構造は `.raw` から参照できる。`/chats/me` は一覧ではなく単一オブジェクトなので `getMyChat()` を使う。

## API一覧

ベースURL：`https://api.lms.sundai-edfu.com/api`

以下は主な学生本人向けの**読み取りメソッド**。2026年10月23日に行った確認に基づくもの。`/documents/:id` など一部はフロントエンドの定義のみ確認できたもので、すべてのメソッドの実データ取得を保証するものではない。

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

`fromDate` / `toDate` は `YYYYMMDD` 形式、`subjectId` は科目のID。`getHandoutFile()` の戻り値はJSONではなく `Response`（通常PDF）になる。

`markContactRead()`、`markChatRead()`、`updateSurvey()` のような**状態変更メソッド**もライブラリにはある。CLIでは呼ばれないけど、アプリから使う場合は実際にアカウントの状態が変更されるので注意。

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

テストはモックレスポンスを使用するため、**駿台アカウントは不要**。push / Pull Request時は [GitHub Actions](https://github.com/linkalls/sundai-lms-client/actions/workflows/ci.yml) で型チェックとテストを実行する。

## ライセンス

このクライアントのソースコードは [MIT License](LICENSE)。駿台LMS、API、関連する商標やコンテンツは各権利者に帰属する。
