# AI食品在庫・発注管理

**食品在庫・発注業務を、もっとシンプルに。**

在庫、賞味期限、廃棄、発注を一元管理し、欠品・過剰在庫・廃棄リスクを踏まえた発注判断を支援する、食品事業者向け業務システムです。食品スーパー、食品小売、飲食店、カフェ、食品卸、惣菜店、ベーカリーなど、小〜中規模事業者を想定しています。

このリポジトリは、外部DBなしで営業利用できる `Demo Mode` と、顧客専用Supabaseへ接続する `Client Production Mode` を同じUI・業務ロジックで提供します。ログイン、新規登録、オンボーディング画面はありません。

## 解決する課題

- 複数店舗・倉庫の在庫を横断して把握しづらい
- 賞味期限やロットの確認が担当者依存になりやすい
- 欠品を避けながら過剰発注も抑える判断に時間がかかる
- 廃棄数量・金額・理由を継続的に振り返りにくい
- 入庫、出庫、移動、棚卸、発注の履歴が分散する

効果を保証するものではなく、業務データを一か所へ集約し、判断材料と操作導線を提供するシステムです。

## 主な機能

| 領域 | 内容 |
| --- | --- |
| ダッシュボード | KPI、30日入出庫推移、カテゴリ・拠点別在庫、期限間近、最近の履歴、未着発注 |
| 商品 | 約1,000 SKUを前提とした検索、絞り込み、ページング、商品詳細、仕入条件 |
| 在庫・ロット | 拠点別在庫、賞味期限、隔離、FEFO、在庫金額、在庫状態 |
| 業務操作 | 入庫、販売・使用出庫、拠点間移動、棚卸、廃棄 |
| 購買 | 仕入先、発注書、入荷残、仕入先別の発注書分割 |
| AI発注提案 | 欠品・過剰・廃棄リスク、推奨数量、候補選択、説明表示 |
| 複数拠点 | 東京、大阪、福岡、札幌の全国4拠点サンプル |

発注数量は直近需要、安全在庫、発注点、リードタイム、入荷予定、賞味期限、廃棄傾向、発注単位などから決定論的に計算します。生成AIは説明文だけに使用し、数量を変更しません。`OPENAI_API_KEY` 未設定時は日本語テンプレート説明へ安全にフォールバックします。

## 2つの動作モード

### Demo Mode（公開販売デモ）

- `NEXT_PUBLIC_APP_MODE=demo`、または環境変数未設定で有効
- Vercel Hobby単体で動作し、Supabase、Docker、API keyは不要
- 固定seed `20260913` から同じデータをプロセス内で一度だけ生成
- 1,000商品、4拠点、40仕入先、約12,000ロット、8,200入出庫履歴、480発注、620入庫、920出庫、1,280廃棄相当
- 一覧はサーバー側で検索・絞り込み・ページングして返し、全履歴をブラウザへ送らない
- 主要フォームは本番と同じZod validationを通り、成功結果を疑似表示
- 登録・更新・入出庫などの疑似操作は共有fixtureを一切変更せず、成功時に「デモ環境のため、この変更はこのブラウザ内のみ保持されます」と表示
- 疑似操作履歴はブラウザのlocalStorageだけに保持し、設定画面の「このブラウザでのデモ操作」に表示
- 設定画面の「デモデータを初期状態へ戻す」（確認dialog付き）で、そのブラウザの状態だけを消去。他の閲覧者には影響しない
- Supabaseへの通信は行わない
- `OPENAI_API_KEY` が設定されていても外部AI APIを呼び出さず、定型文で説明（第三者の操作で利用料金が発生しない）
- 業務画面はリクエスト時に描画し（ビルド時の静的HTMLに固定しない）、日本時間の「今日」を基準に期限・履歴を表示

### 第三者が公開URLを操作した場合の安全性

| 項目 | 挙動 |
| --- | --- |
| 共有データ | サーバーのメモリ上にある読み取り専用fixture。Server Actionを実行しても書き込まない |
| 結果の独立性 | adapterは結果をコピーして返すため、あるリクエストの処理が他の閲覧者の表示へ波及しない |
| 利用者ごとの状態 | ブラウザのlocalStorageのみ。cookie・サーバーセッション・共有キャッシュへ保存しない |
| リセット | 自分のブラウザの履歴だけを消去。サーバー側のデータは常に初期状態 |
| 外部サービス | Supabase / OpenAI / その他の有料サービスへ通信しない |

公開URLは `/` の営業用ランディングページから `/dashboard` の操作デモへ遷移します。ログインCTAはありません。

### Client Production Mode（顧客導入版）

`NEXT_PUBLIC_APP_MODE=production` を明示し、顧客専用Supabaseの接続情報を設定します。

- 既存PostgreSQL schema / migrations / RLS / RPCを使用
- JWTに基づくorganization isolation
- 入庫、出庫、移動、棚卸、廃棄、発注をRPC内の単一トランザクションで処理
- FEFO、行ロック、負在庫防止、発注残超過防止をDBで保証
- 認証UIは顧客要件に応じて別途構成する前提。公開版に固定アカウントや資格情報は持たせない

`src/lib/data/provider.ts` がモードを判定し、既存画面へDemo adapterまたはSupabase clientを渡します。既存Server Componentsと決定論的ドメインロジックは両モードで共有します。

```text
UI / Server Actions
        |
        v
src/lib/data/provider.ts
   |                 |
   v                 v
Demo adapter      Supabase client
fixed fixtures    PostgreSQL / RLS / RPC
```

## 技術構成

- Next.js 16.3（App Router / Server Components / Server Actions）
- React 19 / TypeScript strict
- Tailwind CSS v4 / lucide-react
- Supabase PostgreSQL / Auth session / RLS（Client Productionのみ）
- Zod v4
- Vitest / DB integration test script
- Vercel

Next.jsのクエリパラメータ、`params`、Proxyなどは16系の非同期APIと規約に従っています。

## ローカルで販売デモを起動

```bash
npm install
npm run dev
```

環境変数は不要です。明示する場合だけ `.env.local` に以下を設定します。

```dotenv
NEXT_PUBLIC_APP_MODE=demo
NEXT_PUBLIC_CONTACT_URL=https://example.com/contact
```

問い合わせURLが未設定またはHTTP(S)以外の場合、「導入について相談する」CTAは安全に非表示になります。

## Vercelへ公開

1. GitHubリポジトリをVercelへImport
2. Framework PresetはNext.js、Build Commandは `npm run build`
3. Environment Variablesへ `NEXT_PUBLIC_APP_MODE=demo` を登録（未設定でもdemoが既定）
4. 必要な場合だけ `NEXT_PUBLIC_CONTACT_URL` を登録
5. Deploy

Demo Modeでは以下をVercelへ登録しません。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- seed用環境変数

localhost、ローカルSupabase、Docker、新規Supabase project、有料プランは不要です。

## Client Production導入

### 1. Supabase設定

顧客ごとに専用Supabase projectを用意し、CLIで接続します。既存の別projectを共用しないでください。

```bash
supabase link --project-ref <client-project-ref>
supabase db push
```

### 2. migrations

`supabase/migrations/` に順序付きで保持しています。

| ファイル | 内容 |
| --- | --- |
| `20260913000100_core_schema.sql` | 組織、メンバー、拠点、カテゴリ、仕入先、商品 |
| `20260913000200_inventory_schema.sql` | 発注、入出庫、ロット、在庫、履歴、棚卸、廃棄 |
| `20260913000300_security_rls.sql` | 組織分離、ロール、RLS、権限 |
| `20260913000400_operations_rpc.sql` | FEFOと原子的な在庫・発注操作 |
| `20260913000500_analytics_rpc.sql` | 検索、発注判定入力、ダッシュボード集計 |

### 3. Client Production環境変数

```dotenv
NEXT_PUBLIC_APP_MODE=production
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-key>
```

本番モードは認証済みSupabase sessionと所属組織を要求します。ログイン画面はこの公開版に含めていないため、顧客要件に合わせてSSO等の認証導線を構成してください。

### 4. seed（任意・ローカル管理者作業のみ）

`.env.local` に接続情報とservice role keyを設定します。service role keyはVercelやブラウザへ渡しません。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55421
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<local-service-role-key>
SEED=20260913
SEED_PRODUCT_COUNT=1000
SEED_SUPPLIER_COUNT=40
SEED_HISTORY_DAYS=45
```

```bash
npm run seed
```

リモートDBへのseedは誤投入防止のため `SEED_ALLOW_REMOTE=true` が必要です。本番顧客データへの実行前に対象projectを必ず確認してください。

## 環境変数一覧

| 変数 | Demo | Client Production | 用途 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_APP_MODE` | 任意（既定demo） | 必須（production） | data provider切替 |
| `NEXT_PUBLIC_CONTACT_URL` | 任意 | 任意 | 導入相談CTA |
| `NEXT_PUBLIC_SUPABASE_URL` | 不要 | 必須 | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 不要 | 必須 | RLS適用の公開可能key |
| `OPENAI_API_KEY` | 不要（設定しても使用しない） | 任意 | 説明文生成。未設定時はtemplate |
| `OPENAI_MODEL` / `OPENAI_BASE_URL` | 不要（使用しない） | 任意 | AI provider設定 |
| `SUPABASE_SERVICE_ROLE_KEY` | 不要 | seed/DB testのみ | 管理用秘密情報。Vercel不要 |
| `SEED*` | 不要 | seedのみ | 固定データ生成 |

## QA

```bash
npm run typecheck
npm run lint
npm test
npm run test:db
NEXT_PUBLIC_APP_MODE=demo npm run build
```

`npm run test:db` はローカルSupabaseが起動し、`.env.local` にローカル接続情報がある場合だけ実行します。スクリプトはURLがlocalhost / 127.0.0.1でない場合に停止し、明示許可なしでリモートDBへ接続しません。

## セキュリティ

- Demo Modeは外部DB、認証cookie、秘密情報を使用しない
- production以外の不明なmode値は安全側のdemoとして扱う
- 問い合わせCTAはHTTP(S) URLだけを許可
- `.env*` は `.env.example` を除きgitignore済み
- service role keyとOpenAI keyをclient bundleへ渡さない
- Client Productionは全業務テーブルでRLSを有効化
- 複合外部キーで組織を跨ぐ参照を拒否
- 在庫台帳の直接書き込みを禁止し、SECURITY DEFINER RPC内でもロールを検証
- Server ActionsとDB制約の両方で入力を検証
- Reactの自動エスケープを使用し、`dangerouslySetInnerHTML`は使用しない

## 画面一覧

| パス | 画面 |
| --- | --- |
| `/` | 営業用ランディングページ |
| `/dashboard` | ダッシュボード |
| `/ai-orders` | AI発注提案 |
| `/products` `/products/[id]` | 商品一覧・詳細 |
| `/inventory` `/inventory/lots` `/inventory/transactions` | 在庫・ロット・履歴 |
| `/receipts` `/issues` `/stocktakes` `/waste` | 入庫・出庫/移動・棚卸・廃棄 |
| `/purchase-orders` `/suppliers` | 発注・仕入先 |
| `/locations` `/settings` | 拠点・設定・デモリセット |
