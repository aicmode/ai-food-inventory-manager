-- =============================================================================
-- セキュリティ: RLS ヘルパー / ロール / ポリシー / 権限
--
-- ロール:
--   owner             全操作
--   admin             全般管理（拠点・メンバー・設定）
--   inventory_manager 商品・在庫・入出庫・棚卸・廃棄・発注
--   staff             入出庫・棚卸カウント・閲覧
--   viewer            閲覧のみ
--
-- 在庫台帳系テーブル（ロット・在庫・履歴・伝票・発注）はクライアントから直接
-- INSERT/UPDATE/DELETE できない。すべて権限チェック付き RPC 経由で更新する。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ヘルパー関数（SECURITY DEFINER: organization_members の RLS 再帰を避ける）
-- -----------------------------------------------------------------------------
create or replace function private.roles_admin()
returns public.member_role[]
language sql immutable
set search_path = ''
as $$ select array['owner', 'admin']::public.member_role[] $$;

create or replace function private.roles_manager()
returns public.member_role[]
language sql immutable
set search_path = ''
as $$ select array['owner', 'admin', 'inventory_manager']::public.member_role[] $$;

create or replace function private.roles_staff()
returns public.member_role[]
language sql immutable
set search_path = ''
as $$ select array['owner', 'admin', 'inventory_manager', 'staff']::public.member_role[] $$;

create or replace function private.user_organization_ids()
returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.organization_members m
   where m.user_id = (select auth.uid())
$$;

create or replace function private.user_organization_ids_with_roles(p_roles public.member_role[])
returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.organization_members m
   where m.user_id = (select auth.uid())
     and m.role = any (p_roles)
$$;

create or replace function private.has_org_role(p_org uuid, p_roles public.member_role[])
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.organization_members m
     where m.organization_id = p_org
       and m.user_id = (select auth.uid())
       and m.role = any (p_roles)
  )
$$;

create or replace function private.is_demo_user()
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_demo from public.profiles p where p.id = (select auth.uid())), false)
$$;

-- 書き込み可能な組織（デモ読み取り専用でない所属組織）
create or replace function private.writable_organization_ids_with_roles(p_roles public.member_role[])
returns setof uuid
language sql stable
security definer
set search_path = ''
as $$
  select m.organization_id
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
   where m.user_id = (select auth.uid())
     and m.role = any (p_roles)
     and not o.is_demo_readonly
$$;

create or replace function private.today_jst()
returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Tokyo')::date $$;

create or replace function private.require_role(p_org uuid, p_roles public.member_role[])
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;
  if p_org is null or not private.has_org_role(p_org, p_roles) then
    raise exception 'この操作を行う権限がありません。' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_writable(p_org uuid)
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.organizations o where o.id = p_org and o.is_demo_readonly) then
    raise exception 'デモ環境は閲覧専用のため、この操作は実行できません。' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_not_demo_user()
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
begin
  if private.is_demo_user() then
    raise exception 'デモユーザーはこの操作を実行できません。' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 権限（anon は業務データに一切アクセスできない）
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- 台帳系: authenticated は SELECT のみ
revoke insert, update, delete, truncate on
  public.organization_members,
  public.document_sequences,
  public.inventory_balances,
  public.inventory_lots,
  public.inventory_transactions,
  public.receipts,
  public.stock_issues,
  public.stocktakes,
  public.stocktake_items,
  public.waste_records,
  public.purchase_orders,
  public.purchase_order_items
from authenticated;

revoke all on public.document_sequences from authenticated;

-- 組織: 作成は RPC、更新は一部列のみ
revoke insert, update, delete, truncate on public.organizations from authenticated;
grant update (name, review_period_days, overstock_days) on public.organizations to authenticated;

-- プロフィール: 表示名のみ本人が更新可能（is_demo は変更不可）
revoke insert, update, delete, truncate on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- マスタ系: TRUNCATE は不可
revoke truncate on public.locations, public.categories, public.suppliers, public.products, public.product_suppliers
  from authenticated;

-- -----------------------------------------------------------------------------
-- RLS 有効化
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.locations enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.product_suppliers enable row level security;
alter table public.document_sequences enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.receipts enable row level security;
alter table public.stock_issues enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.stocktakes enable row level security;
alter table public.stocktake_items enable row level security;
alter table public.waste_records enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy "profiles: 本人と同じ組織のメンバーを参照"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select m.user_id from public.organization_members m
       where m.organization_id in (select private.user_organization_ids())
    )
  );

create policy "profiles: 本人のみ更新"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- organizations / organization_members
-- -----------------------------------------------------------------------------
create policy "organizations: 所属組織を参照"
  on public.organizations for select to authenticated
  using (id in (select private.user_organization_ids()));

create policy "organizations: 管理者が更新"
  on public.organizations for update to authenticated
  using (
    id in (select private.writable_organization_ids_with_roles(private.roles_admin()))
    and not (select private.is_demo_user())
  )
  with check (
    id in (select private.writable_organization_ids_with_roles(private.roles_admin()))
    and not (select private.is_demo_user())
  );

create policy "organization_members: 所属組織のメンバーを参照"
  on public.organization_members for select to authenticated
  using (organization_id in (select private.user_organization_ids()));

-- -----------------------------------------------------------------------------
-- マスタ系（SELECT: メンバー / INSERT・UPDATE: 在庫管理者以上 / DELETE: 管理者）
-- -----------------------------------------------------------------------------
create policy "locations: 参照" on public.locations for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "locations: 管理者が作成" on public.locations for insert to authenticated
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_admin())));
create policy "locations: 管理者が更新" on public.locations for update to authenticated
  using (organization_id in (select private.writable_organization_ids_with_roles(private.roles_admin())))
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_admin())));

create policy "categories: 参照" on public.categories for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "categories: 在庫管理者以上が作成" on public.categories for insert to authenticated
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())));
create policy "categories: 在庫管理者以上が更新" on public.categories for update to authenticated
  using (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())))
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())));
create policy "categories: 管理者が削除" on public.categories for delete to authenticated
  using (
    organization_id in (select private.writable_organization_ids_with_roles(private.roles_admin()))
    and not (select private.is_demo_user())
  );

create policy "suppliers: 参照" on public.suppliers for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "suppliers: 在庫管理者以上が作成" on public.suppliers for insert to authenticated
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())));
create policy "suppliers: 在庫管理者以上が更新" on public.suppliers for update to authenticated
  using (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())))
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())));

create policy "products: 参照" on public.products for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "products: 在庫管理者以上が作成" on public.products for insert to authenticated
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())));
create policy "products: 在庫管理者以上が更新" on public.products for update to authenticated
  using (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())))
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())));

create policy "product_suppliers: 参照" on public.product_suppliers for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "product_suppliers: 在庫管理者以上が作成" on public.product_suppliers for insert to authenticated
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())));
create policy "product_suppliers: 在庫管理者以上が更新" on public.product_suppliers for update to authenticated
  using (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())))
  with check (organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager())));
create policy "product_suppliers: 在庫管理者以上が削除" on public.product_suppliers for delete to authenticated
  using (
    organization_id in (select private.writable_organization_ids_with_roles(private.roles_manager()))
    and not is_primary
  );

-- -----------------------------------------------------------------------------
-- 台帳系（SELECT のみ。書き込みは RPC）
-- -----------------------------------------------------------------------------
create policy "purchase_orders: 参照" on public.purchase_orders for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "purchase_order_items: 参照" on public.purchase_order_items for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "receipts: 参照" on public.receipts for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "stock_issues: 参照" on public.stock_issues for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "inventory_lots: 参照" on public.inventory_lots for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "inventory_balances: 参照" on public.inventory_balances for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "inventory_transactions: 参照" on public.inventory_transactions for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "stocktakes: 参照" on public.stocktakes for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "stocktake_items: 参照" on public.stocktake_items for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
create policy "waste_records: 参照" on public.waste_records for select to authenticated
  using (organization_id in (select private.user_organization_ids()));
-- document_sequences はポリシーなし（RPC 内部でのみ使用）
