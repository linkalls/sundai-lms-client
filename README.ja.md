# sundai-lms-client 🇯🇵

[English](README.md)

**駿台LMSの学生本人向けAPIを、BunとTypeScriptから扱う非公式クライアント。** ExpoやReact Nativeなどのアプリ部分を含まない、独立した実装だよ。

> [!WARNING]
> 駿台公式のライブラリではない。2026年10月23日時点のLMS配信JavaScriptと本人アカウントの通信から確認したAPIを使っている。仕様変更で動かなくなる可能性がある。利用は自分のアカウントのデータだけに限定し、利用規約や適切なアクセス間隔を守ってね。

## 動作確認

- `GET /users/my_detail`：模試成績を `exam_results.items` から取得
- `GET /contacts`：お知らせ
- `GET /handouts`：配布資料
- `GET /user_surveys`：アンケート
- `GET /calendar_entries?from_date=YYYYMMDD&to_date=YYYYMMDD`：カレンダー
- `GET /al_activity_stats/me?subject_id=...`：科目別学習統計
- その他、通知・科目・講師・面談予約枠・チャットなど

## セットアップ

```bash
bun install
bun run check
bun test
```

## ログインと模試成績の取得

SSOログイン用ヘルパーはLMS側の認証仕様に依存するため、動作保証はない。

```bash
export SUNDAI_LMS_EMAIL='your-account@example.com'
export SUNDAI_LMS_PASSWORD='your-password'
bun run bin/sundai-lms.ts login
unset SUNDAI_LMS_PASSWORD
bun run bin/sundai-lms.ts exams
```

`exams.json` に自分の模試成績が書き出される。**このファイルとセッションJSONは絶対にGitHubに載せないでね。** `.gitignore` で既定のファイル名は除外されている。

## TypeScriptから使う

```ts
import { SundaiLmsClient, loadSession } from "./src/index.ts";

// 自分のログイン済みセッションをローカルから取得する。
const session = await loadSession("sundai-lms-session.json");
const client = SundaiLmsClient.fromSession(session);

// 模試成績（科目別得点・偏差値・志望校判定）を取得する。
const exams = await client.getExamResults();
console.log(`模試結果: ${exams.length}件`);

// カレンダーはYYYYMMDD形式の日付を指定する。
const calendar = await client.listCalendarEntries("20261001", "20261115");
console.log(`予定: ${calendar.items.length}件`);
```

`getMyDetail()` の戻り値では、APIの `exam_results.items` が `examResults.items` に変換される。

他のコマンド：`bun run bin/sundai-lms.ts profile`、`bun run bin/sundai-lms.ts export`。

## セキュリティ

本人以外の情報へのアクセス、管理者API、自動予約、メッセージ送信は対象外。CLIは読み取り専用。認証トークンや取得した個人情報は公開・共有しないこと。

## ライセンス

MIT。APIやLMSそのものの権利は各権利者に帰属する。
