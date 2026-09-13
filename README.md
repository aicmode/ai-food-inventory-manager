# AI食品在庫・発注管理

**在庫・賞味期限・発注を、ひとつの画面で。**

約1,000SKU・複数拠点の食品在庫を、ロット・賞味期限（FEFO）単位で管理し、
「今、何を、なぜ、何個発注すべきか」を判断できる業務支援システムです。
食品スーパー・食品小売・卸・カフェ・飲食店など、小〜中規模の食品事業者を想定しています。

- 発注数量・欠品リスク・廃棄リスクは **決定論的なロジック** で計算し、テストで検証しています
- 生成AIは計算結果の **説明文の作成のみ** に使用します（API キー未設定でも全機能が動作します）
- データは Supabase PostgreSQL に保存し、**Row Level Security で組織ごとに完全分離** しています
- ポートフォリオ版は **ログイン・新規登録不要**。URLを開くと固定デモ環境をすぐ閲覧できます

---

## 目次

1. [主な機能](#主な機能)
2. [技術スタック](#技術スタック)
3. [アーキテクチャ](#アーキテクチャ)
4. [セットアップ（ローカル）](#セットアップローカル)
5. [Supabase 設定（本番）](#supabase-設定本番)
6. [環境変数](#環境変数)
7. [マイグレーション](#マイグレーション)
8. [デモデータ（seed）](#デモデータseed)
9. [QA（テスト・静的解析）](#qaテスト静的解析)
10. [デプロイ（Vercel）](#デプロイvercel)
11. [AI発注提案の仕組み](#ai発注提案の仕組み)
12. [セキュリティ](#セキュリティ)
13. [画面一覧](#画面一覧)
14. [今後の拡張余地](#今後の拡張余地)

---

## 主な機能

| 領域 | 内容 |
| --- | --- |
| 商品マスタ | SKU / JAN（チェックデジット検証）/ 商品名・カナ / メーカー / ブランド / 2階層カテゴリ / 規格・内容量 / 販売・仕入単位・ケース入数 / 原価・売価・税率 / 保存区分・保存温度 / 賞味期間・期限アラート / 安全在庫・発注点・標準発注数・最小発注数量・発注単位・リードタイム / 主要仕入先・複数仕入先 |
| 商品検索 | 商品名・カナ（ひらがな入力可）・SKU・JAN・メーカー・ブランド・カテゴリ・仕入先を横断検索。カテゴリ・保存区分・仕入先・在庫状態・有効/無効で絞り込み、サーバーサイドページング |
| 複数拠点 | 店舗・倉庫を登録し、拠点×商品で在庫を管理 |
| ロット・賞味期限 | 入庫ごとにロットを作成。期限間近・期限切れ・隔離中・消化済を表示。隔離ロットは出庫対象外 |
| FEFO | 出庫時にロット未指定なら、期限切れ・隔離中を除き賞味期限の早いロットから自動引当（複数ロット跨ぎ可） |
| 入庫 | 発注書連携（発注残の自動入力・発注残超過の防止・発注状態の自動更新）、ロット番号・製造日・賞味期限・単価 |
| 出庫・移動 | 販売 / 使用・加工 / 拠点間移動（移動先に期限を引き継いだロットを作成）。在庫不足は失敗し負の在庫を作らない |
| 棚卸 | 開始時の理論在庫を記録 → ページ単位でカウント入力 → 確定時に差異を在庫・履歴へ反映（棚卸中の入出庫も考慮） |
| 廃棄 | 期限切れ・破損・品質不良・過剰在庫など。ロット原価で金額を計算し、今月の廃棄数量・金額・廃棄率を表示 |
| 入出庫履歴 | すべての在庫変動をロット単位で記録（処理前→処理後の在庫、担当者、参照伝票）。検索・絞り込み |
| 仕入先・発注 | 仕入先マスタ、発注書の作成・下書き編集・確定・キャンセル、仕入先ごとの発注書分割、消費税（税率ごと切り捨て）計算 |
| AI発注提案 | 拠点ごとに全商品を判定し、推奨数・欠品予測日・欠品/廃棄リスク・理由を表示。選択した商品から仕入先別に発注書（下書き）を一括作成。「説明を見る」で AI またはテンプレートによる解説 |
| ダッシュボード | 総SKU・総在庫数量/金額・欠品/欠品リスク/過剰在庫・期限間近/期限切れ・今月廃棄額・未処理発注・本日の入出庫、30日入出庫推移、カテゴリ別在庫金額、欠品リスク分布、廃棄推移、拠点別在庫、AI発注候補TOP10、期限間近、最近の入出庫、未着発注 |
| 公開デモ | 認証画面を介さずダッシュボードへ直接アクセス。RLS用の固定デモセッションはサーバー側で自動確立し、認証情報をブラウザへ渡しません |

## 技術スタック

| 分類 | 採用技術 |
| --- | --- |
| フレームワーク | Next.js 16（App Router / Server Components / Server Actions、開発は Turbopack・本番ビルドは Webpack）、React 19 |
| 言語 | TypeScript（strict） |
| スタイル | Tailwind CSS v4、lucide-react（アイコン） |
| DB / アクセス制御 | Supabase（PostgreSQL 17 / Auth セッション / RLS）、`@supabase/ssr` |
| バリデーション | Zod v4 |
| テスト | Vitest（ユニット）、Node スクリプトによる DB 統合テスト |
| デプロイ | Vercel |

ORM は使用していません。Supabase のマイグレーション（SQL）で制約・関数・RLS を一元管理し、
`supabase gen types` の生成型で TypeScript の型安全性を確保しています（在庫操作の原子性を PostgreSQL 関数で担保するため）。
チャートは依存ライブラリなしの軽量 SVG コンポーネントです。

## アーキテクチャ

```
ブラウザ
  │  （Server Components の HTML / Client Components は必要箇所のみ）
  ▼
Next.js（Vercel）
  ├─ src/proxy.ts                … 固定デモセッションの自動確立・更新
  ├─ src/app/(app)/**            … 業務画面（Server Components）と Server Actions
  │     └─ 各 Action: デモ組織確認 → 権限チェック → Zod 検証 → RPC / クエリ
  ├─ src/lib/domain              … 純粋関数（発注推奨・FEFO・リスク判定・金額計算・権限）
  ├─ src/lib/ai                  … AI Provider 抽象化（server-only）
  └─ src/lib/supabase            … サーバー/proxy 用クライアント・生成型
  │
  ▼  サーバー側で確立した固定デモセッションの JWT で接続（RLS 適用）
Supabase PostgreSQL
  ├─ テーブル・制約・複合外部キー（組織を跨ぐ参照を禁止）
  ├─ RLS ポリシー（組織分離・ロール別の書き込み制限）
  ├─ 在庫操作 RPC（SECURITY DEFINER + 関数内ロール検証、1トランザクション）
  └─ 参照系 RPC（検索・発注判定入力・ダッシュボード集計を1回で返す）
```

### 在庫の一貫性

- 在庫の実体は `inventory_lots`（ロット別残数）。`inventory_balances` はロット残数の合計を **トリガーで自動集計**
- 入庫・出庫・移動・廃棄・棚卸確定はすべて **PostgreSQL 関数（RPC）内の単一トランザクション**。途中でエラーになれば全体がロールバック
- `inventory_transactions` は `after_quantity = before_quantity + quantity` と取引区分ごとの符号を **CHECK 制約** で保証
- 在庫行を `FOR UPDATE` でロックし、同時出庫による二重引当を防止
- `quantity_on_hand >= 0` / `quantity_remaining >= 0` の制約で負の在庫を禁止

### 主なテーブル

`organizations` / `organization_members` / `profiles` / `locations` / `categories` / `suppliers` / `products` / `product_suppliers` /
`inventory_balances` / `inventory_lots` / `inventory_transactions` / `receipts` / `stock_issues` / `stocktakes` / `stocktake_items` /
`waste_records` / `purchase_orders` / `purchase_order_items` / `document_sequences`

## セットアップ（ローカル）

前提: Node.js 20.9 以上（24 で検証）、Docker、[Supabase CLI](https://supabase.com/docs/guides/cli)

```bash
npm install

# ローカル Supabase を起動（このプロジェクトは 55421〜55429 番ポートを使用）
supabase start

# マイグレーションを適用
supabase db reset

# 環境変数（supabase status -o env の API_URL / ANON_KEY / SERVICE_ROLE_KEY を転記）
cp .env.example .env.local

# デモデータ投入（約1,000SKU）
npm run seed

npm run dev
# http://localhost:3000
```

`.env.local` の `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` は、seed と固定デモセッションで同じ値を使います。
seed 後に `http://localhost:3000` を開くと、認証操作なしでダッシュボードが表示されます。

### Supabase 未設定時の挙動

Supabase の公開設定または固定デモセッション設定が未設定の場合、すべての画面は `/setup`（設定手順の案内）に誘導されます。
モックデータで動作するモードはありません。

## Supabase 設定（本番）

1. [Supabase](https://supabase.com) でプロジェクトを作成（リージョンは Tokyo 推奨）
2. マイグレーションを適用
   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```
3. 公開サインアップは無効のまま運用し、固定デモ実行主体は seed の Admin API で作成
4. ローカルから本番 URL と service role key を指定してデモデータを投入
   ```bash
   SEED_ALLOW_REMOTE=true SEED_HISTORY_DAYS=30 npm run seed
   ```
   Free プランの容量を考慮し、`SEED_HISTORY_DAYS=30` 程度を推奨します（既定 45 日で入出庫履歴 約13万件・DB 約90MB）。

## 環境変数

| 変数 | 必須 | 公開 | 用途 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ブラウザ可 | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ブラウザ可 | anon（publishable）キー。RLS で保護されるため公開可能 |
| `SUPABASE_SERVICE_ROLE_KEY` | seed のみ | **秘密** | seed / DB テスト専用。アプリ本体では使用せず、Vercel への登録も不要 |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | ✓ | **秘密** | 固定デモセッション用。proxy と seed だけがサーバー側で参照 |
| `DEMO_READONLY` | 任意 | – | `true` で seed 時にデモ組織を閲覧専用化 |
| `OPENAI_API_KEY` | 任意 | **秘密** | AI 説明生成。未設定時はテンプレート説明 |
| `OPENAI_MODEL` | 任意 | – | 既定 `gpt-4o-mini` |
| `OPENAI_BASE_URL` | 任意 | – | OpenAI 互換 API のベース URL |
| `SEED` / `SEED_PRODUCT_COUNT` / `SEED_SUPPLIER_COUNT` / `SEED_HISTORY_DAYS` | 任意 | – | seed の乱数シード・件数調整 |

`NEXT_PUBLIC_` には公開可能な値だけを設定してください。`.env*`（`.env.example` を除く）は `.gitignore` 済みです。

## マイグレーション

`supabase/migrations/` に順序付きで配置しています。

| ファイル | 内容 |
| --- | --- |
| `20260913000100_core_schema.sql` | enum、組織・メンバー・プロフィール、拠点、カテゴリ（2階層検証）、仕入先、商品（検索用生成列・trigram インデックス）、商品×仕入先、各種トリガー |
| `20260913000200_inventory_schema.sql` | 発注・入庫・出庫伝票、ロット、在庫（ロットから自動集計）、入出庫履歴（整合性 CHECK）、棚卸、廃棄、インデックス |
| `20260913000300_security_rls.sql` | RLS ヘルパー（`private` スキーマ）、ロール定義、テーブル権限、全テーブルの RLS ポリシー |
| `20260913000400_operations_rpc.sql` | 組織作成、入庫、出庫/移動（FEFO）、廃棄、棚卸（開始・カウント・確定・中止）、発注（作成・下書き編集・状態遷移・AI提案からの一括作成）、ロット隔離、メンバー管理 |
| `20260913000500_analytics_rpc.sql` | 商品検索、在庫一覧、ロット一覧、発注判定入力、ダッシュボード集計、関数実行権限 |

型の再生成: `npm run db:types`

## デモデータ（seed）

`npm run seed`（`scripts/seed/`）

- 固定シード（`SEED=20260913`）の擬似乱数で **毎回同じ内容** を生成（日付はシード実行日を基準にした相対日付）
- 商品 **1,000 SKU**（`SEED_PRODUCT_COUNT` で 50〜5,000 に調整可）: 水・お茶・コーヒー・炭酸・ジュース・エナジードリンク・牛乳・乳飲料・ヨーグルト・チーズ・バター・冷凍惣菜・冷凍麺・冷凍デザート・精肉加工品・水産加工品・野菜加工品・果物加工品・レトルト・缶詰・惣菜・調味料・たれ・スナック・チョコレート・デザート・食パン・菓子パン・米・麺・乾物・シリアル・その他
- メーカー・ブランド・仕入先は **すべて架空**。JAN はインストアコード帯（2始まり）で正しいチェックデジットを付与
- 14 大分類 / 33 小分類、全国4拠点（東京・大阪・福岡・札幌）、20都道府県に分散した40仕入先
- **日次在庫シミュレーション** で履歴を生成: 発注点発注 → リードタイム後に入荷（一部入荷・キャンセルあり）→ 曜日変動のある需要で FEFO 販売 → 期限切れ廃棄・破損 → 月次棚卸（差異あり）。需要が急増/急減する商品も含むため、欠品リスク・過剰在庫・廃棄リスクが自然に発生します
- 既定（45日）の生成件数の目安: ロット 約2万、入出庫履歴 約13万、発注 約1,800（明細 約1.9万）、入庫伝票 約1,700、廃棄 約2,600、棚卸 4件（明細 約2,700）
- 固定デモ実行主体の設定時は、本日分の入庫（発注連携）・販売出庫・拠点間移動・廃棄・進行中の棚卸・AI発注提案からの下書き発注を **実際の RPC 経由** で実行します
- 誤投入防止のため、リモート URL への投入には `SEED_ALLOW_REMOTE=true` が必要です

## QA（テスト・静的解析）

```bash
npm run typecheck   # next typegen + tsc --noEmit
npm run lint        # ESLint（eslint-config-next）
npm test            # Vitest ユニットテスト
npm run test:db     # DB 統合テスト（ローカル Supabase が必要）
npm run build       # 本番ビルド
```

### ユニットテスト（`src/**/*.test.ts`）

発注推奨数量の基本式・発注サイクル・入荷予定、発注単位の切り上げ・最小発注数量、欠品判定、過剰在庫判定、
賞味期限リスク（消化不能見込み・期限切れ除外・賞味期間上限と切り下げ）、廃棄率と廃棄傾向による補正、
曜日補正・新規商品の平均、FEFO 割当、利用可能在庫、ロット状態、廃棄金額、発注金額（税率別切り捨て）、
発注状態遷移、仕入先分割、Zod バリデーション（負数・NaN・JAN・SKU・日付・賞味期限<製造日・重複明細）、
ロール権限、組織分離ヘルパー、エラーメッセージ変換、AI 出力の数量改変ガード、日本向け日付・金額フォーマット。

### DB 統合テスト（`tests/db/run.ts`）

実際の PostgreSQL（RLS 有効）に対して、別組織データの参照・更新・登録の拒否、複合外部キーによる組織跨ぎ参照の拒否、
別組織 RPC の拒否、anon の拒否、台帳テーブルへの直接書き込み拒否、入庫→FEFO出庫→在庫不足時のロールバック→拠点間移動→
廃棄→棚卸確定、発注単位違反の拒否、発注状態遷移（下書き入庫不可・一部入荷・発注残超過拒否・入荷完了・キャンセル不可）、
仕入先別の一括発注、閲覧者ロールの書き込み拒否、最後のオーナー保護、閲覧専用組織の書き込み拒否を検証します。

## デプロイ（Vercel）

1. GitHub リポジトリを Vercel にインポート（Framework: Next.js、ビルドコマンドは既定）
2. Environment Variables に `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` を登録
   （任意で `OPENAI_API_KEY`）。**`SUPABASE_SERVICE_ROLE_KEY` は登録しない**
3. デプロイ後、ルートURLから認証操作なしでダッシュボードへ入れることを確認

## AI発注提案の仕組み

### 1. 数値判断（決定論的・`src/lib/domain/recommendation.ts`）

| ステップ | 計算 |
| --- | --- |
| 利用可能在庫 | 現在庫 − 引当済 |
| 販売可能在庫 | 利用可能在庫 − 期限切れ（未廃棄）− 隔離中 |
| 消化不能見込み | 日平均出庫でロットを FEFO 消化した場合に、賞味期限までに売り切れない数量 |
| 有効在庫 | 販売可能在庫 − 消化不能見込み |
| 日平均出庫 | 直近7日平均×0.6 ＋ 直近30日平均×0.4（取扱開始から日が浅い商品は実日数で平均） |
| 曜日補正 | 直近28日の曜日別出庫から、これからの期間の需要倍率（0.7〜1.4） |
| 需要期間 | リードタイム ＋ 発注サイクル（組織設定） |
| projected_demand | 日平均出庫 × 曜日補正 × 需要期間 |
| target_stock | projected_demand ＋ 安全在庫 |
| raw_recommended_qty | max(0, target_stock − 有効在庫 − 入荷予定) |
| 発注要否 | 在庫ポジション（有効在庫＋入荷予定）が発注点以下・安全在庫以下、または需要期間分に不足する場合のみ |
| 廃棄傾向補正 | 直近30日の廃棄率が10%以上なら最大30%抑制（期間需要は割り込まない） |
| 賞味期限上限 | 日平均 × (リードタイム ＋ 賞味期間×80%) − 有効在庫 − 入荷予定 を超えない |
| 丸め | 最小発注数量以上・発注単位（ケース）の倍数へ切り上げ。上限を超える場合は切り下げ、切り下げで発注できず欠品が迫る場合のみ最小単位で発注 |
| 欠品リスク | 緊急: リードタイム内に欠品し入荷予定でも補えない / 高: リードタイム内に欠品・安全在庫以下 / 中: 発注点以下・需要期間分に不足 / 低 |
| 廃棄リスク | 緊急: 期限切れ在庫あり・消化不能50%以上 / 高: 消化不能20%以上・廃棄率15%以上 / 中: 消化不能あり・廃棄率5%以上・過剰在庫 / 低 |
| 過剰在庫 | 在庫日数が過剰在庫の目安（組織設定・既定45日）または賞味期間を超える、動きのない商品が発注点の3倍超 |

判定理由は構造化データ（理由コード＋数値）として返し、`reason-text.ts` で日本語の定型文にします。

### 2. AI 説明（`src/lib/ai/provider.ts`）

- Provider abstraction（`AiProvider` インターフェース）。現在は OpenAI 互換 API を実装
- **API キーあり**: 計算結果（数値指標と理由コードのみ）を渡し、3〜4文の説明を生成。
  出力に推奨数量が正確に含まれない場合は採用せず定型文に切り替え（数量改変ガード）
- **API キーなし / タイムアウト / エラー**: 決定論的テンプレートで説明（理由を画面に明示）
- AI に送る情報は商品名・単位・リードタイム・数値指標のみ。組織名・ユーザー情報・仕入単価は送りません
- server-only モジュールのため API キーはブラウザに露出しません

## セキュリティ

- **公開導線**: ログイン・新規登録・オンボーディング画面は持たず、`proxy.ts` がサーバー側で固定デモセッションを自動確立
- **組織分離（RLS）**: 全業務テーブルで RLS を有効化し、所属組織のデータのみ参照可能。anon ロールはテーブル・関数とも権限なし
- **組織跨ぎ参照の防止**: `(organization_id, id)` の複合外部キーで、他組織の UUID を指定した登録・更新を DB が拒否
- **ロール**: owner / admin / inventory_manager / staff / viewer。書き込みポリシーと RPC 内の `require_role` で DB 側でも検証（UI の表示制御だけに頼らない）
  - staff: 入庫・出庫・棚卸カウント / inventory_manager: ＋商品・仕入先・廃棄・棚卸確定・発注 / admin: ＋拠点・メンバー・組織設定 / viewer: 閲覧のみ
- **台帳の保護**: ロット・在庫・履歴・伝票・発注は authenticated から直接 INSERT/UPDATE/DELETE 不可。すべて SECURITY DEFINER（`search_path=''`）の RPC 経由
- **入力検証**: Server Action で Zod 検証、DB で CHECK 制約・関数内検証の二重チェック。SQL はパラメータ化（supabase-js / plpgsql）、LIKE 検索はエスケープ
- **XSS**: React の自動エスケープのみを使用（`dangerouslySetInnerHTML` 不使用）
- **秘密情報**: service role key はアプリ本体で使用しない。AI キー・デモ認証情報は server-only。`.env.local` は gitignore
- **デモ保護**: 固定デモ実行主体は組織設定などの管理操作を実行不可。`organizations.is_demo_readonly` で組織全体を閲覧専用にもできる
- **エラー表示**: 業務エラー（在庫不足など）は日本語で表示、内部エラーは汎用メッセージ＋サーバーログ

## 画面一覧

| パス | 画面 |
| --- | --- |
| `/` | `/dashboard` へリダイレクト |
| `/dashboard` | ダッシュボード |
| `/ai-orders` | AI発注提案 |
| `/products` `/products/new` `/products/[id]` `/products/[id]/edit` | 商品 |
| `/inventory` `/inventory/lots` `/inventory/transactions` | 在庫一覧・ロット/賞味期限・入出庫履歴 |
| `/receipts` `/receipts/new` | 入庫 |
| `/issues` `/issues/new` | 出庫・拠点間移動 |
| `/stocktakes` `/stocktakes/new` `/stocktakes/[id]` | 棚卸 |
| `/waste` `/waste/new` | 廃棄 |
| `/suppliers` `/suppliers/new` `/suppliers/[id]` `/suppliers/[id]/edit` | 仕入先 |
| `/purchase-orders` `/purchase-orders/new` `/purchase-orders/[id]` | 発注 |
| `/locations` | 拠点 |
| `/settings` | 発注基準・カテゴリ・システム状態 |

## 今後の拡張余地

- 受注・取り置きによる引当（`quantity_reserved` の活用）
- POS / EC / 基幹システムとの売上連携（CSV 取込・API）
- 発注書の PDF 出力・メール / EDI 送信
- 需要予測モデルの高度化（天候・イベント・季節性）と予測精度のモニタリング
- 値引き・販促提案による廃棄削減
- バーコード / ハンディ端末での入出庫・棚卸
- 監査ログ・承認ワークフロー
- 別業種への応用（自動車部品など）: 商品・拠点・ロット・仕入先・発注の構造は食品に依存しない設計のため、賞味期限を「有効期限なし」とした部品在庫や、シリアル管理への拡張が可能
