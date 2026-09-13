-- =============================================================================
-- 在庫・ロット・入出庫・棚卸・廃棄・発注スキーマ
--
-- 在庫の一貫性:
--   * 在庫の実体は inventory_lots（ロット別残数）
--   * inventory_balances はロット残数の合計をトリガーで自動集計する（手動更新しない）
--   * inventory_transactions は after = before + quantity を CHECK 制約で保証
--   * 書き込みはすべて SECURITY DEFINER の RPC 経由で 1 トランザクションとして行う
-- =============================================================================

-- 伝票番号採番
create table public.document_sequences (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  prefix text not null,
  period text not null,
  last_value integer not null default 0,
  primary key (organization_id, prefix, period)
);

-- -----------------------------------------------------------------------------
-- purchase_orders / purchase_order_items（発注）
-- -----------------------------------------------------------------------------
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  order_number text not null,
  supplier_id uuid not null,
  location_id uuid not null,
  status public.purchase_order_status not null default 'draft',
  order_date date not null default ((now() at time zone 'Asia/Tokyo')::date),
  expected_delivery_date date,
  subtotal numeric(14, 2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14, 2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  ordered_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number),
  unique (organization_id, id),
  check (expected_delivery_date is null or expected_delivery_date >= order_date),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id)
);

create index purchase_orders_supplier_status_idx on public.purchase_orders (organization_id, supplier_id, status);
create index purchase_orders_status_date_idx on public.purchase_orders (organization_id, status, order_date desc);
create index purchase_orders_location_status_idx on public.purchase_orders (organization_id, location_id, status);

create trigger purchase_orders_set_updated_at
  before update on public.purchase_orders
  for each row execute function private.set_updated_at();

create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  purchase_order_id uuid not null,
  product_id uuid not null,
  ordered_quantity numeric(14, 3) not null check (ordered_quantity > 0),
  received_quantity numeric(14, 3) not null default 0,
  unit_cost numeric(12, 2) not null check (unit_cost >= 0),
  tax_rate numeric(5, 2) not null default 8 check (tax_rate in (0, 8, 10)),
  subtotal numeric(14, 2) generated always as (round(ordered_quantity * unit_cost, 2)) stored,
  ai_recommended_quantity numeric(14, 3) check (ai_recommended_quantity is null or ai_recommended_quantity >= 0),
  ai_reason text check (ai_reason is null or char_length(ai_reason) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (purchase_order_id, product_id),
  unique (organization_id, id),
  check (received_quantity >= 0 and received_quantity <= ordered_quantity),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id)
);

create index purchase_order_items_product_idx on public.purchase_order_items (organization_id, product_id);

create trigger purchase_order_items_set_updated_at
  before update on public.purchase_order_items
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- receipts（入庫伝票） / stock_issues（出庫伝票）
-- -----------------------------------------------------------------------------
create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  receipt_number text not null,
  location_id uuid not null,
  supplier_id uuid,
  purchase_order_id uuid,
  received_date date not null,
  total_quantity numeric(14, 3) not null default 0 check (total_quantity >= 0),
  total_amount numeric(14, 2) not null default 0 check (total_amount >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, receipt_number),
  unique (organization_id, id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id)
);

create index receipts_org_date_idx on public.receipts (organization_id, received_date desc, created_at desc);
create index receipts_po_idx on public.receipts (organization_id, purchase_order_id);

create table public.stock_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  issue_number text not null,
  location_id uuid not null,
  issue_type public.issue_type not null,
  destination_location_id uuid,
  total_quantity numeric(14, 3) not null default 0 check (total_quantity >= 0),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, issue_number),
  unique (organization_id, id),
  check (
    (issue_type = 'transfer' and destination_location_id is not null and destination_location_id <> location_id)
    or (issue_type <> 'transfer' and destination_location_id is null)
  ),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, destination_location_id) references public.locations (organization_id, id)
);

create index stock_issues_org_date_idx on public.stock_issues (organization_id, created_at desc);

-- -----------------------------------------------------------------------------
-- inventory_lots（ロット・賞味期限）
--   status には available / depleted / quarantined のみ保存する。
--   expiring_soon / expired は日付から導出する（保存すると日次で陳腐化するため）。
-- -----------------------------------------------------------------------------
create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  product_id uuid not null,
  lot_number text not null check (char_length(btrim(lot_number)) between 1 and 60),
  received_date date not null,
  manufacture_date date,
  expiration_date date,
  quantity_received numeric(14, 3) not null check (quantity_received >= 0),
  quantity_remaining numeric(14, 3) not null check (quantity_remaining >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  supplier_id uuid,
  purchase_order_id uuid,
  receipt_id uuid,
  source_lot_id uuid,
  status public.lot_status not null default 'available',
  quarantine_reason text check (quarantine_reason is null or char_length(quarantine_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (manufacture_date is null or expiration_date is null or expiration_date >= manufacture_date),
  check (status in ('available', 'depleted', 'quarantined')),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, supplier_id) references public.suppliers (organization_id, id),
  foreign key (organization_id, purchase_order_id) references public.purchase_orders (organization_id, id),
  foreign key (organization_id, receipt_id) references public.receipts (organization_id, id),
  foreign key (organization_id, source_lot_id) references public.inventory_lots (organization_id, id)
);

create index inventory_lots_fefo_idx on public.inventory_lots
  (location_id, product_id, expiration_date nulls last, received_date)
  where quantity_remaining > 0;
create index inventory_lots_expiration_idx on public.inventory_lots (organization_id, expiration_date)
  where quantity_remaining > 0;
create index inventory_lots_product_idx on public.inventory_lots (organization_id, product_id, location_id);
create index inventory_lots_receipt_idx on public.inventory_lots (receipt_id) where receipt_id is not null;
create index inventory_lots_po_idx on public.inventory_lots (purchase_order_id) where purchase_order_id is not null;

create trigger inventory_lots_set_updated_at
  before update on public.inventory_lots
  for each row execute function private.set_updated_at();

-- 残数 0 で depleted、再入荷で available に戻す
create or replace function private.sync_lot_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quantity_remaining = 0 and new.status = 'available' then
    new.status := 'depleted';
  elsif new.quantity_remaining > 0 and new.status = 'depleted' then
    new.status := 'available';
  end if;
  return new;
end;
$$;

create trigger inventory_lots_sync_status
  before insert or update of quantity_remaining, status on public.inventory_lots
  for each row execute function private.sync_lot_status();

-- -----------------------------------------------------------------------------
-- inventory_balances（拠点×商品の在庫。ロットから自動集計）
-- -----------------------------------------------------------------------------
create table public.inventory_balances (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  product_id uuid not null,
  quantity_on_hand numeric(14, 3) not null default 0 check (quantity_on_hand >= 0),
  quantity_reserved numeric(14, 3) not null default 0 check (quantity_reserved >= 0),
  -- 利用可能在庫 = 現在庫 - 引当済（引当が現在庫を上回る場合も負値にはしない）
  quantity_available numeric(14, 3) generated always as (greatest(quantity_on_hand - quantity_reserved, 0)) stored,
  updated_at timestamptz not null default now(),
  primary key (location_id, product_id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id)
);

create index inventory_balances_org_product_idx on public.inventory_balances (organization_id, product_id);
create index inventory_balances_org_location_idx on public.inventory_balances (organization_id, location_id);

create or replace function private.refresh_inventory_balance(p_org uuid, p_location uuid, p_product uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.inventory_balances as b (organization_id, location_id, product_id, quantity_on_hand, updated_at)
  select p_org, p_location, p_product, coalesce(sum(l.quantity_remaining), 0), now()
    from public.inventory_lots l
   where l.location_id = p_location and l.product_id = p_product
  on conflict (location_id, product_id)
  do update set quantity_on_hand = excluded.quantity_on_hand, updated_at = now();
end;
$$;

create or replace function private.inventory_lots_refresh_balance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.refresh_inventory_balance(new.organization_id, new.location_id, new.product_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and (old.location_id, old.product_id) <> (new.location_id, new.product_id)) then
    -- 削除時は在庫行を新規作成しない（組織の一括削除中に、削除済み組織の在庫行を作らないため）
    update public.inventory_balances b
       set quantity_on_hand = coalesce((
             select sum(l.quantity_remaining)
               from public.inventory_lots l
              where l.location_id = old.location_id and l.product_id = old.product_id
           ), 0),
           updated_at = now()
     where b.location_id = old.location_id and b.product_id = old.product_id;
  end if;
  return null;
end;
$$;

create trigger inventory_lots_refresh_balance
  after insert or update of quantity_remaining, location_id, product_id or delete on public.inventory_lots
  for each row execute function private.inventory_lots_refresh_balance();

-- -----------------------------------------------------------------------------
-- inventory_transactions（入出庫履歴。quantity は符号付き増減量）
-- -----------------------------------------------------------------------------
create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  product_id uuid not null,
  lot_id uuid,
  transaction_type public.transaction_type not null,
  quantity numeric(14, 3) not null,
  before_quantity numeric(14, 3) not null check (before_quantity >= 0),
  after_quantity numeric(14, 3) not null check (after_quantity >= 0),
  unit_cost numeric(12, 2) check (unit_cost is null or unit_cost >= 0),
  reference_type text check (reference_type in ('receipt', 'issue', 'waste', 'stocktake', 'seed')),
  reference_id uuid,
  reason text check (reason is null or char_length(reason) <= 500),
  performed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (after_quantity = before_quantity + quantity),
  check (
    case
      when transaction_type in ('receipt', 'transfer_in', 'adjustment_plus') then quantity > 0
      when transaction_type in ('sale', 'usage', 'transfer_out', 'adjustment_minus', 'waste') then quantity < 0
      else quantity <> 0
    end
  ),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, lot_id) references public.inventory_lots (organization_id, id)
);

create index inventory_transactions_org_created_idx on public.inventory_transactions (organization_id, created_at desc);
create index inventory_transactions_type_created_idx on public.inventory_transactions (organization_id, transaction_type, created_at desc);
create index inventory_transactions_loc_product_idx on public.inventory_transactions (organization_id, location_id, product_id, created_at desc);
create index inventory_transactions_product_idx on public.inventory_transactions (organization_id, product_id, created_at desc);
create index inventory_transactions_reference_idx on public.inventory_transactions (reference_id) where reference_id is not null;
-- 外部キー参照元のインデックス（ロット履歴の参照と、ロット・組織削除時の FK 検査を高速化）
create index inventory_transactions_lot_idx on public.inventory_transactions (organization_id, lot_id) where lot_id is not null;
create index inventory_lots_source_lot_idx on public.inventory_lots (organization_id, source_lot_id) where source_lot_id is not null;
create index stock_issues_destination_idx on public.stock_issues (organization_id, destination_location_id) where destination_location_id is not null;

-- -----------------------------------------------------------------------------
-- stocktakes / stocktake_items（棚卸）
-- -----------------------------------------------------------------------------
create table public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stocktake_number text not null,
  location_id uuid not null,
  category_id uuid,
  status public.stocktake_status not null default 'in_progress',
  notes text check (notes is null or char_length(notes) <= 2000),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  completed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, stocktake_number),
  unique (organization_id, id),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, category_id) references public.categories (organization_id, id)
);

-- 同一拠点で進行中の棚卸は1件まで
create unique index stocktakes_one_in_progress_uidx on public.stocktakes (location_id) where status = 'in_progress';
create index stocktakes_org_started_idx on public.stocktakes (organization_id, started_at desc);

create trigger stocktakes_set_updated_at
  before update on public.stocktakes
  for each row execute function private.set_updated_at();

create table public.stocktake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  stocktake_id uuid not null,
  product_id uuid not null,
  expected_quantity numeric(14, 3) not null check (expected_quantity >= 0),
  actual_quantity numeric(14, 3) check (actual_quantity is null or actual_quantity >= 0),
  difference_quantity numeric(14, 3) generated always as (actual_quantity - expected_quantity) stored,
  -- 確定時に実際に在庫へ反映した増減量（棚卸中の入出庫を考慮した値）
  adjusted_quantity numeric(14, 3),
  reason text check (reason is null or char_length(reason) <= 500),
  counted_by uuid references public.profiles (id) on delete set null,
  counted_at timestamptz,
  unique (stocktake_id, product_id),
  foreign key (organization_id, stocktake_id) references public.stocktakes (organization_id, id) on delete cascade,
  foreign key (organization_id, product_id) references public.products (organization_id, id)
);

create index stocktake_items_stocktake_idx on public.stocktake_items (stocktake_id);
create index stocktake_items_product_idx on public.stocktake_items (organization_id, product_id);

-- -----------------------------------------------------------------------------
-- waste_records（廃棄）
-- -----------------------------------------------------------------------------
create table public.waste_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  location_id uuid not null,
  product_id uuid not null,
  lot_id uuid,
  quantity numeric(14, 3) not null check (quantity > 0),
  reason public.waste_reason not null,
  cost_amount numeric(14, 2) not null default 0 check (cost_amount >= 0),
  waste_date date not null,
  notes text check (notes is null or char_length(notes) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, location_id) references public.locations (organization_id, id),
  foreign key (organization_id, product_id) references public.products (organization_id, id),
  foreign key (organization_id, lot_id) references public.inventory_lots (organization_id, id)
);

create index waste_records_org_date_idx on public.waste_records (organization_id, waste_date desc);
create index waste_records_location_date_idx on public.waste_records (organization_id, location_id, waste_date desc);
create index waste_records_product_idx on public.waste_records (organization_id, product_id, waste_date desc);
create index waste_records_lot_idx on public.waste_records (organization_id, lot_id) where lot_id is not null;
