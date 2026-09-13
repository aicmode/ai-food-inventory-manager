-- =============================================================================
-- AI食品在庫・発注管理: コアスキーマ
--   組織 / メンバー / プロフィール / 拠点 / カテゴリ / 仕入先 / 商品
--
-- 設計方針:
--   * すべての業務テーブルは organization_id を持ち、RLS で組織単位に分離する
--   * 組織を跨いだ参照を DB レベルで禁止するため、(organization_id, id) の
--     複合外部キーを使う（別組織の UUID を指定すると FK 違反になる）
--   * 数量は numeric(14,3)（重量・容量商品にも対応できる汎用設計）
-- =============================================================================

create extension if not exists pg_trgm with schema extensions;

-- RLS ヘルパーや内部関数を置くスキーマ（PostgREST には公開しない）
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enum
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'admin', 'inventory_manager', 'staff', 'viewer');
create type public.location_type as enum ('store', 'warehouse');
create type public.storage_type as enum ('room_temperature', 'refrigerated', 'frozen');
create type public.lot_status as enum ('available', 'expiring_soon', 'expired', 'depleted', 'quarantined');
create type public.transaction_type as enum (
  'receipt', 'sale', 'usage', 'transfer_in', 'transfer_out',
  'adjustment_plus', 'adjustment_minus', 'waste', 'stocktake_adjustment'
);
create type public.waste_reason as enum ('expired', 'damaged', 'quality_issue', 'overstock', 'other');
create type public.purchase_order_status as enum ('draft', 'ordered', 'partially_received', 'received', 'cancelled');
create type public.stocktake_status as enum ('in_progress', 'completed', 'cancelled');
create type public.issue_type as enum ('sale', 'usage', 'transfer');

-- -----------------------------------------------------------------------------
-- 共通トリガー関数
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 100),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- auth.users 作成時にプロフィールを自動作成
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1), ''), 100)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- organizations / organization_members
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- AI発注: 発注サイクル（次回発注までの日数）
  review_period_days integer not null default 3 check (review_period_days between 0 and 60),
  -- 過剰在庫とみなす在庫日数
  overstock_days integer not null default 45 check (overstock_days between 7 and 365),
  -- デモ組織を読み取り専用にするフラグ（service role のみ変更可能）
  is_demo_readonly boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index organization_members_user_id_idx on public.organization_members (user_id);

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- locations（拠点: 店舗 / 倉庫）
-- -----------------------------------------------------------------------------
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  type public.location_type not null default 'store',
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{3}-?[0-9]{4}$'),
  prefecture text check (prefecture is null or char_length(prefecture) <= 10),
  city text check (city is null or char_length(city) <= 100),
  address text check (address is null or char_length(address) <= 200),
  phone text check (phone is null or phone ~ '^[0-9+() -]{6,20}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- categories（2階層: 大分類 / 小分類）
-- -----------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  parent_id uuid,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, code),
  check (parent_id is null or parent_id <> id),
  foreign key (organization_id, parent_id)
    references public.categories (organization_id, id)
);

create index categories_parent_idx on public.categories (organization_id, parent_id, sort_order);

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function private.set_updated_at();

create or replace function private.validate_category_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if exists (select 1 from public.categories c where c.id = new.parent_id and c.parent_id is not null) then
      raise exception 'カテゴリは2階層（大分類・小分類）までです。' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.categories c where c.parent_id = new.id) then
      raise exception '小分類を持つカテゴリは、他のカテゴリの下に移動できません。' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger categories_validate_hierarchy
  before insert or update of parent_id on public.categories
  for each row execute function private.validate_category_hierarchy();

-- -----------------------------------------------------------------------------
-- suppliers（仕入先）
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  company_name text not null check (char_length(btrim(company_name)) between 1 and 120),
  contact_name text check (contact_name is null or char_length(contact_name) <= 60),
  email text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone text check (phone is null or phone ~ '^[0-9+() -]{6,20}$'),
  postal_code text check (postal_code is null or postal_code ~ '^[0-9]{3}-?[0-9]{4}$'),
  prefecture text check (prefecture is null or char_length(prefecture) <= 10),
  city text check (city is null or char_length(city) <= 100),
  address text check (address is null or char_length(address) <= 200),
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 100),
  minimum_order_amount numeric(12, 2) not null default 0 check (minimum_order_amount >= 0),
  standard_lead_time_days integer not null default 2 check (standard_lead_time_days between 0 and 180),
  notes text check (notes is null or char_length(notes) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

create index suppliers_org_name_idx on public.suppliers (organization_id, company_name);

create trigger suppliers_set_updated_at
  before update on public.suppliers
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- products（商品マスタ）
-- -----------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$'),
  jan_code text check (jan_code is null or jan_code ~ '^([0-9]{8}|[0-9]{13})$'),
  product_name text not null check (char_length(btrim(product_name)) between 1 and 200),
  product_name_kana text check (product_name_kana is null or char_length(product_name_kana) <= 200),
  manufacturer text check (manufacturer is null or char_length(manufacturer) <= 100),
  brand text check (brand is null or char_length(brand) <= 100),
  category_id uuid,
  subcategory_id uuid,
  specification text check (specification is null or char_length(specification) <= 200),
  content_amount numeric(12, 3) check (content_amount is null or content_amount > 0),
  content_unit text check (content_unit is null or char_length(content_unit) <= 20),
  sales_unit text not null default '個' check (char_length(sales_unit) between 1 and 20),
  purchase_unit text not null default 'ケース' check (char_length(purchase_unit) between 1 and 20),
  units_per_case integer not null default 1 check (units_per_case between 1 and 10000),
  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  selling_price numeric(12, 2) not null default 0 check (selling_price >= 0),
  tax_rate numeric(5, 2) not null default 8 check (tax_rate in (0, 8, 10)),
  storage_type public.storage_type not null default 'room_temperature',
  storage_temperature_min numeric(5, 1),
  storage_temperature_max numeric(5, 1),
  shelf_life_days integer check (shelf_life_days is null or shelf_life_days between 1 and 3650),
  expiration_warning_days integer not null default 3 check (expiration_warning_days between 0 and 365),
  safety_stock numeric(14, 3) not null default 0 check (safety_stock >= 0),
  reorder_point numeric(14, 3) not null default 0 check (reorder_point >= 0),
  standard_order_quantity numeric(14, 3) not null default 0 check (standard_order_quantity >= 0),
  minimum_order_quantity numeric(14, 3) not null default 1 check (minimum_order_quantity >= 0),
  order_lot_size numeric(14, 3) not null default 1 check (order_lot_size > 0),
  lead_time_days integer not null default 2 check (lead_time_days between 0 and 180),
  primary_supplier_id uuid,
  storage_location_note text check (storage_location_note is null or char_length(storage_location_note) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  is_active boolean not null default true,
  search_text text generated always as (
    lower(
      sku || ' ' || coalesce(jan_code, '') || ' ' || product_name || ' ' ||
      coalesce(product_name_kana, '') || ' ' || coalesce(manufacturer, '') || ' ' || coalesce(brand, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku),
  unique (organization_id, id),
  check (
    storage_temperature_min is null or storage_temperature_max is null
    or storage_temperature_min <= storage_temperature_max
  ),
  check (subcategory_id is null or category_id is not null),
  foreign key (organization_id, category_id) references public.categories (organization_id, id),
  foreign key (organization_id, subcategory_id) references public.categories (organization_id, id),
  foreign key (organization_id, primary_supplier_id) references public.suppliers (organization_id, id)
);

create unique index products_org_jan_uidx on public.products (organization_id, jan_code) where jan_code is not null;
create index products_org_idx on public.products (organization_id, is_active, sku);
create index products_category_idx on public.products (organization_id, category_id);
create index products_subcategory_idx on public.products (organization_id, subcategory_id);
create index products_supplier_idx on public.products (organization_id, primary_supplier_id);
create index products_storage_type_idx on public.products (organization_id, storage_type);
create index products_search_trgm_idx on public.products using gin (search_text extensions.gin_trgm_ops);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

create or replace function private.validate_product_category()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.category_id is not null and exists (
    select 1 from public.categories c where c.id = new.category_id and c.parent_id is not null
  ) then
    raise exception 'カテゴリには大分類を指定してください。' using errcode = 'P0001';
  end if;
  if new.subcategory_id is not null and not exists (
    select 1 from public.categories c where c.id = new.subcategory_id and c.parent_id = new.category_id
  ) then
    raise exception '小分類が選択した大分類に属していません。' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger products_validate_category
  before insert or update of category_id, subcategory_id on public.products
  for each row execute function private.validate_product_category();

-- -----------------------------------------------------------------------------
-- product_suppliers（商品×仕入先: 1商品に複数仕入先）
-- -----------------------------------------------------------------------------
create table public.product_suppliers (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  product_id uuid not null,
  supplier_id uuid not null,
  supplier_product_code text check (supplier_product_code is null or char_length(supplier_product_code) <= 40),
  purchase_price numeric(12, 2) check (purchase_price is null or purchase_price >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 180),
  minimum_order_quantity numeric(14, 3) check (minimum_order_quantity is null or minimum_order_quantity >= 0),
  order_lot_size numeric(14, 3) check (order_lot_size is null or order_lot_size > 0),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, supplier_id),
  foreign key (organization_id, product_id) references public.products (organization_id, id) on delete cascade,
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id) on delete cascade
);

create unique index product_suppliers_primary_uidx on public.product_suppliers (product_id) where is_primary;
create index product_suppliers_supplier_idx on public.product_suppliers (organization_id, supplier_id);

create trigger product_suppliers_set_updated_at
  before update on public.product_suppliers
  for each row execute function private.set_updated_at();

-- products.primary_supplier_id と product_suppliers.is_primary を同期する
create or replace function private.sync_primary_supplier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.primary_supplier_id is distinct from old.primary_supplier_id then
    update public.product_suppliers
       set is_primary = false
     where product_id = new.id
       and is_primary
       and supplier_id is distinct from new.primary_supplier_id;

    if new.primary_supplier_id is not null then
      insert into public.product_suppliers (organization_id, product_id, supplier_id, is_primary)
      values (new.organization_id, new.id, new.primary_supplier_id, true)
      on conflict (product_id, supplier_id) do update set is_primary = true;
    end if;
  end if;
  return new;
end;
$$;

create trigger products_sync_primary_supplier
  after insert or update of primary_supplier_id on public.products
  for each row execute function private.sync_primary_supplier();
