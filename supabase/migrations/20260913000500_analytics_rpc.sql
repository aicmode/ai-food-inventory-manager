-- =============================================================================
-- 参照系 RPC（検索・AI発注入力・ダッシュボード集計）と関数権限
--
--   search_products          商品検索（全文・カテゴリ・保存区分・仕入先・在庫状態・ページング）
--   search_inventory         拠点別在庫一覧（同上）
--   get_reorder_inputs       AI発注判定の入力データ（数値判断は TypeScript の決定論的ロジックで行う）
--   get_dashboard_summary    ダッシュボード KPI・チャート・一覧
--
-- 大量データでも N+1 にならないよう、1 回の RPC で集計済みの結果を返す。
-- =============================================================================

create or replace function private.like_pattern(p_query text)
returns text
language sql immutable
set search_path = ''
as $$
  select case
    when p_query is null or btrim(p_query) = '' then null
    else '%' || replace(replace(replace(lower(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end
$$;

create or replace function private.jst_start_of(p_date date)
returns timestamptz
language sql immutable
set search_path = ''
as $$ select (p_date::timestamp at time zone 'Asia/Tokyo') $$;

-- -----------------------------------------------------------------------------
-- 商品検索
--   p_stock_status: out_of_stock（欠品） | low（発注点以下） | normal（適正） | overstock（過剰）
-- -----------------------------------------------------------------------------
create or replace function public.search_products(
  p_organization_id uuid,
  p_query text default null,
  p_query_alt text default null,
  p_category_id uuid default null,
  p_storage_type public.storage_type default null,
  p_supplier_id uuid default null,
  p_stock_status text default null,
  p_is_active boolean default null,
  p_location_id uuid default null,
  p_sort text default 'sku',
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  sku text,
  jan_code text,
  product_name text,
  product_name_kana text,
  manufacturer text,
  brand text,
  category_name text,
  subcategory_name text,
  supplier_name text,
  storage_type public.storage_type,
  sales_unit text,
  cost_price numeric,
  selling_price numeric,
  safety_stock numeric,
  reorder_point numeric,
  is_active boolean,
  quantity_on_hand numeric,
  quantity_available numeric,
  avg_daily_usage numeric,
  stock_status text,
  total_count bigint
)
language plpgsql stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pattern text := private.like_pattern(p_query);
  v_pattern_alt text := private.like_pattern(p_query_alt);
  v_overstock_days integer;
  v_from timestamptz := private.jst_start_of(private.today_jst() - 30);
  v_to timestamptz := private.jst_start_of(private.today_jst());
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    p_limit := 50;
  end if;
  if p_offset is null or p_offset < 0 then
    p_offset := 0;
  end if;

  select o.overstock_days into v_overstock_days from public.organizations o where o.id = p_organization_id;
  if v_overstock_days is null then
    return;
  end if;

  return query
  with base as (
    select p.*
      from public.products p
     where p.organization_id = p_organization_id
       and (p_is_active is null or p.is_active = p_is_active)
       and (p_category_id is null or p.category_id = p_category_id or p.subcategory_id = p_category_id)
       and (p_storage_type is null or p.storage_type = p_storage_type)
       and (
         p_supplier_id is null
         or p.primary_supplier_id = p_supplier_id
         or exists (select 1 from public.product_suppliers ps where ps.product_id = p.id and ps.supplier_id = p_supplier_id)
       )
       and (
         v_pattern is null
         or p.search_text like v_pattern
         or (v_pattern_alt is not null and p.search_text like v_pattern_alt)
         or exists (
           select 1 from public.suppliers s
            where s.id = p.primary_supplier_id and lower(s.company_name) like v_pattern
         )
         or exists (
           select 1 from public.categories c
            where c.id in (p.category_id, p.subcategory_id) and lower(c.name) like v_pattern
         )
       )
  ),
  stock as (
    select b.product_id, sum(b.quantity_on_hand) as on_hand, sum(b.quantity_available) as available
      from public.inventory_balances b
     where b.organization_id = p_organization_id
       and (p_location_id is null or b.location_id = p_location_id)
       and b.product_id in (select base.id from base)
     group by b.product_id
  ),
  usage as (
    select t.product_id, sum(-t.quantity) / 30.0 as avg_daily
      from public.inventory_transactions t
     where t.organization_id = p_organization_id
       and t.created_at >= v_from and t.created_at < v_to
       and (
         t.transaction_type in ('sale', 'usage')
         or (p_location_id is not null and t.transaction_type = 'transfer_out')
       )
       and (p_location_id is null or t.location_id = p_location_id)
     group by t.product_id
  ),
  classified as (
    select b.*,
           coalesce(s.on_hand, 0) as on_hand,
           coalesce(s.available, 0) as available,
           round(coalesce(u.avg_daily, 0), 2) as avg_daily,
           case
             when coalesce(s.available, 0) <= 0 then 'out_of_stock'
             when coalesce(s.available, 0) <= greatest(b.reorder_point, b.safety_stock) then 'low'
             when coalesce(u.avg_daily, 0) > 0 and coalesce(s.available, 0) / u.avg_daily > v_overstock_days then 'overstock'
             else 'normal'
           end as status
      from base b
      left join stock s on s.product_id = b.id
      left join usage u on u.product_id = b.id
  )
  select c.id, c.sku, c.jan_code, c.product_name, c.product_name_kana, c.manufacturer, c.brand,
         cat.name, sub.name, sup.company_name, c.storage_type, c.sales_unit, c.cost_price, c.selling_price,
         c.safety_stock, c.reorder_point, c.is_active, c.on_hand, c.available, c.avg_daily, c.status,
         count(*) over ()
    from classified c
    left join public.categories cat on cat.id = c.category_id
    left join public.categories sub on sub.id = c.subcategory_id
    left join public.suppliers sup on sup.id = c.primary_supplier_id
   where p_stock_status is null or c.status = p_stock_status
   order by
     case when p_sort = 'name' then c.product_name end asc,
     case when p_sort = 'stock_asc' then c.available end asc,
     case when p_sort = 'stock_desc' then c.available end desc,
     case when p_sort = 'updated' then c.updated_at end desc,
     c.sku asc
   limit p_limit offset p_offset;
end;
$$;

-- -----------------------------------------------------------------------------
-- 拠点別在庫一覧
-- -----------------------------------------------------------------------------
create or replace function public.search_inventory(
  p_organization_id uuid,
  p_query text default null,
  p_query_alt text default null,
  p_location_id uuid default null,
  p_category_id uuid default null,
  p_storage_type public.storage_type default null,
  p_stock_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  location_id uuid,
  location_name text,
  product_id uuid,
  sku text,
  product_name text,
  category_name text,
  storage_type public.storage_type,
  sales_unit text,
  safety_stock numeric,
  reorder_point numeric,
  quantity_on_hand numeric,
  quantity_reserved numeric,
  quantity_available numeric,
  inventory_value numeric,
  nearest_expiration_date date,
  expiring_quantity numeric,
  expired_quantity numeric,
  avg_daily_usage numeric,
  stock_status text,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pattern text := private.like_pattern(p_query);
  v_pattern_alt text := private.like_pattern(p_query_alt);
  v_overstock_days integer;
  v_today date := private.today_jst();
  v_from timestamptz := private.jst_start_of(private.today_jst() - 30);
  v_to timestamptz := private.jst_start_of(private.today_jst());
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    p_limit := 50;
  end if;
  if p_offset is null or p_offset < 0 then
    p_offset := 0;
  end if;

  select o.overstock_days into v_overstock_days from public.organizations o where o.id = p_organization_id;
  if v_overstock_days is null then
    return;
  end if;

  return query
  with rows as (
    select b.location_id, l.name as location_name, p.id as product_id, p.sku, p.product_name, p.category_id,
           p.storage_type, p.sales_unit, p.safety_stock, p.reorder_point, p.expiration_warning_days,
           b.quantity_on_hand, b.quantity_reserved, b.quantity_available, b.updated_at
      from public.inventory_balances b
      join public.products p on p.id = b.product_id
      join public.locations l on l.id = b.location_id
     where b.organization_id = p_organization_id
       and (p_location_id is null or b.location_id = p_location_id)
       and (p_category_id is null or p.category_id = p_category_id or p.subcategory_id = p_category_id)
       and (p_storage_type is null or p.storage_type = p_storage_type)
       and (
         v_pattern is null
         or p.search_text like v_pattern
         or (v_pattern_alt is not null and p.search_text like v_pattern_alt)
       )
  ),
  lots as (
    select il.location_id, il.product_id,
           sum(il.quantity_remaining * il.unit_cost) as value,
           min(il.expiration_date) filter (where il.expiration_date >= v_today and il.status = 'available') as nearest_exp,
           sum(il.quantity_remaining) filter (
             where il.expiration_date >= v_today and il.expiration_date <= v_today + r.expiration_warning_days
           ) as expiring_qty,
           sum(il.quantity_remaining) filter (where il.expiration_date < v_today) as expired_qty
      from public.inventory_lots il
      join rows r on r.location_id = il.location_id and r.product_id = il.product_id
     where il.organization_id = p_organization_id and il.quantity_remaining > 0
     group by il.location_id, il.product_id
  ),
  usage as (
    select t.location_id, t.product_id, sum(-t.quantity) / 30.0 as avg_daily
      from public.inventory_transactions t
     where t.organization_id = p_organization_id
       and t.created_at >= v_from and t.created_at < v_to
       and t.transaction_type in ('sale', 'usage', 'transfer_out')
       and (p_location_id is null or t.location_id = p_location_id)
     group by t.location_id, t.product_id
  ),
  classified as (
    select r.*, coalesce(lt.value, 0) as value, lt.nearest_exp, coalesce(lt.expiring_qty, 0) as expiring_qty,
           coalesce(lt.expired_qty, 0) as expired_qty, round(coalesce(u.avg_daily, 0), 2) as avg_daily,
           case
             when r.quantity_available <= 0 then 'out_of_stock'
             when r.quantity_available <= greatest(r.reorder_point, r.safety_stock) then 'low'
             when coalesce(u.avg_daily, 0) > 0 and r.quantity_available / u.avg_daily > v_overstock_days then 'overstock'
             else 'normal'
           end as status
      from rows r
      left join lots lt on lt.location_id = r.location_id and lt.product_id = r.product_id
      left join usage u on u.location_id = r.location_id and u.product_id = r.product_id
  )
  select c.location_id, c.location_name, c.product_id, c.sku, c.product_name, cat.name, c.storage_type,
         c.sales_unit, c.safety_stock, c.reorder_point, c.quantity_on_hand, c.quantity_reserved,
         c.quantity_available, c.value, c.nearest_exp, c.expiring_qty, c.expired_qty, c.avg_daily, c.status,
         c.updated_at, count(*) over ()
    from classified c
    left join public.categories cat on cat.id = c.category_id
   where p_stock_status is null
      or c.status = p_stock_status
      or (p_stock_status = 'expiring' and c.expiring_qty > 0)
      or (p_stock_status = 'expired' and c.expired_qty > 0)
   order by c.sku asc, c.location_name asc
   limit p_limit offset p_offset;
end;
$$;

-- -----------------------------------------------------------------------------
-- ロット一覧（賞味期限アラートは商品ごとの expiration_warning_days で判定）
--   p_status: active（残数あり） | available | expiring_soon | expired | quarantined | depleted | all
-- -----------------------------------------------------------------------------
create or replace function public.search_lots(
  p_organization_id uuid,
  p_query text default null,
  p_query_alt text default null,
  p_location_id uuid default null,
  p_status text default 'active',
  p_storage_type public.storage_type default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  lot_number text,
  received_date date,
  manufacture_date date,
  expiration_date date,
  quantity_received numeric,
  quantity_remaining numeric,
  unit_cost numeric,
  status public.lot_status,
  effective_status text,
  quarantine_reason text,
  location_id uuid,
  location_name text,
  product_id uuid,
  sku text,
  product_name text,
  sales_unit text,
  storage_type public.storage_type,
  supplier_name text,
  days_until_expiration integer,
  total_count bigint
)
language plpgsql stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_pattern text := private.like_pattern(p_query);
  v_pattern_alt text := private.like_pattern(p_query_alt);
  v_today date := private.today_jst();
begin
  if p_limit is null or p_limit < 1 or p_limit > 200 then
    p_limit := 50;
  end if;
  if p_offset is null or p_offset < 0 then
    p_offset := 0;
  end if;

  return query
  with base as (
    select l.*, p.sku, p.product_name, p.sales_unit, p.storage_type as p_storage_type, p.expiration_warning_days,
           loc.name as location_name, s.company_name,
           case
             when l.status = 'quarantined' then 'quarantined'
             when l.quantity_remaining <= 0 then 'depleted'
             when l.expiration_date is null then 'available'
             when l.expiration_date < v_today then 'expired'
             when l.expiration_date <= v_today + p.expiration_warning_days then 'expiring_soon'
             else 'available'
           end as eff
      from public.inventory_lots l
      join public.products p on p.id = l.product_id
      join public.locations loc on loc.id = l.location_id
      left join public.suppliers s on s.id = l.supplier_id
     where l.organization_id = p_organization_id
       and (p_location_id is null or l.location_id = p_location_id)
       and (p_storage_type is null or p.storage_type = p_storage_type)
       and (p_status in ('all', 'depleted') or l.quantity_remaining > 0)
       and (
         v_pattern is null
         or p.search_text like v_pattern
         or (v_pattern_alt is not null and p.search_text like v_pattern_alt)
         or lower(l.lot_number) like v_pattern
       )
  )
  select b.id, b.lot_number, b.received_date, b.manufacture_date, b.expiration_date, b.quantity_received,
         b.quantity_remaining, b.unit_cost, b.status, b.eff, b.quarantine_reason, b.location_id, b.location_name,
         b.product_id, b.sku, b.product_name, b.sales_unit, b.p_storage_type, b.company_name,
         case when b.expiration_date is null then null else b.expiration_date - v_today end,
         count(*) over ()
    from base b
   where p_status is null
      or p_status in ('all', 'active')
      or b.eff = p_status
   order by b.expiration_date asc nulls last, b.sku asc, b.received_date asc
   limit p_limit offset p_offset;
end;
$$;

-- -----------------------------------------------------------------------------
-- AI 発注判定の入力データ
--   対象: 有効商品のうち「拠点に在庫記録がある」「拠点向けの未完了発注がある」
--         「どの拠点にも在庫記録がない新規商品」のいずれか
-- -----------------------------------------------------------------------------
create or replace function public.get_reorder_inputs(
  p_organization_id uuid,
  p_location_id uuid default null,
  p_product_id uuid default null
)
returns table (
  location_id uuid,
  location_name text,
  product_id uuid,
  sku text,
  product_name text,
  jan_code text,
  category_name text,
  sales_unit text,
  storage_type public.storage_type,
  units_per_case integer,
  cost_price numeric,
  safety_stock numeric,
  reorder_point numeric,
  standard_order_quantity numeric,
  minimum_order_quantity numeric,
  order_lot_size numeric,
  lead_time_days integer,
  shelf_life_days integer,
  expiration_warning_days integer,
  supplier_id uuid,
  supplier_name text,
  quantity_on_hand numeric,
  quantity_reserved numeric,
  quantity_available numeric,
  expired_quantity numeric,
  quarantined_quantity numeric,
  usable_lots jsonb,
  usage_7d numeric,
  usage_30d numeric,
  usage_by_weekday numeric[],
  first_received_date date,
  waste_30d numeric,
  incoming_quantity numeric,
  next_delivery_date date
)
language plpgsql stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date := private.today_jst();
  v_to timestamptz := private.jst_start_of(private.today_jst());
  v_from7 timestamptz := private.jst_start_of(private.today_jst() - 7);
  v_from28 timestamptz := private.jst_start_of(private.today_jst() - 28);
  v_from30 timestamptz := private.jst_start_of(private.today_jst() - 30);
begin
  if p_organization_id is null or p_organization_id not in (select private.user_organization_ids()) then
    raise exception 'この組織のデータを参照する権限がありません。' using errcode = '42501';
  end if;

  return query
  with loc as (
    select l.id, l.name
      from public.locations l
     where l.organization_id = p_organization_id
       and l.is_active
       and (p_location_id is null or l.id = p_location_id)
  ),
  pairs as (
    select loc.id as location_id, loc.name as location_name, p.id as product_id
      from loc
      cross join public.products p
     where p.organization_id = p_organization_id
       and p.is_active
       and (p_product_id is null or p.id = p_product_id)
       and (
         exists (select 1 from public.inventory_balances b where b.location_id = loc.id and b.product_id = p.id)
         or exists (
           select 1
             from public.purchase_order_items i
             join public.purchase_orders po on po.id = i.purchase_order_id
            where po.location_id = loc.id and i.product_id = p.id
              and po.status in ('draft', 'ordered', 'partially_received')
         )
         or not exists (select 1 from public.inventory_balances b2 where b2.product_id = p.id)
       )
  ),
  lot_agg as (
    select il.location_id, il.product_id,
           coalesce(sum(il.quantity_remaining) filter (
             where il.status <> 'quarantined' and il.expiration_date < v_today
           ), 0) as expired_qty,
           coalesce(sum(il.quantity_remaining) filter (where il.status = 'quarantined'), 0) as quarantined_qty,
           coalesce(
             jsonb_agg(
               jsonb_build_object('quantity', il.quantity_remaining, 'expiration_date', il.expiration_date)
               order by il.expiration_date nulls last
             ) filter (
               where il.status = 'available' and (il.expiration_date is null or il.expiration_date >= v_today)
             ),
             '[]'::jsonb
           ) as lots
      from public.inventory_lots il
     where il.organization_id = p_organization_id
       and il.quantity_remaining > 0
       and (p_location_id is null or il.location_id = p_location_id)
       and (p_product_id is null or il.product_id = p_product_id)
     group by il.location_id, il.product_id
  ),
  first_lot as (
    select il.location_id, il.product_id, min(il.received_date) as first_date
      from public.inventory_lots il
     where il.organization_id = p_organization_id
       and (p_location_id is null or il.location_id = p_location_id)
       and (p_product_id is null or il.product_id = p_product_id)
     group by il.location_id, il.product_id
  ),
  usage as (
    select t.location_id, t.product_id,
           coalesce(sum(-t.quantity) filter (where t.created_at >= v_from7), 0) as u7,
           coalesce(sum(-t.quantity), 0) as u30,
           array[
             coalesce(sum(-t.quantity) filter (where t.created_at >= v_from28 and extract(dow from t.created_at at time zone 'Asia/Tokyo') = 0), 0),
             coalesce(sum(-t.quantity) filter (where t.created_at >= v_from28 and extract(dow from t.created_at at time zone 'Asia/Tokyo') = 1), 0),
             coalesce(sum(-t.quantity) filter (where t.created_at >= v_from28 and extract(dow from t.created_at at time zone 'Asia/Tokyo') = 2), 0),
             coalesce(sum(-t.quantity) filter (where t.created_at >= v_from28 and extract(dow from t.created_at at time zone 'Asia/Tokyo') = 3), 0),
             coalesce(sum(-t.quantity) filter (where t.created_at >= v_from28 and extract(dow from t.created_at at time zone 'Asia/Tokyo') = 4), 0),
             coalesce(sum(-t.quantity) filter (where t.created_at >= v_from28 and extract(dow from t.created_at at time zone 'Asia/Tokyo') = 5), 0),
             coalesce(sum(-t.quantity) filter (where t.created_at >= v_from28 and extract(dow from t.created_at at time zone 'Asia/Tokyo') = 6), 0)
           ]::numeric[] as by_dow
      from public.inventory_transactions t
     where t.organization_id = p_organization_id
       and t.transaction_type in ('sale', 'usage', 'transfer_out')
       and t.created_at >= v_from30 and t.created_at < v_to
       and (p_location_id is null or t.location_id = p_location_id)
       and (p_product_id is null or t.product_id = p_product_id)
     group by t.location_id, t.product_id
  ),
  waste as (
    select w.location_id, w.product_id, sum(w.quantity) as qty
      from public.waste_records w
     where w.organization_id = p_organization_id
       and w.waste_date >= v_today - 30
       and (p_location_id is null or w.location_id = p_location_id)
       and (p_product_id is null or w.product_id = p_product_id)
     group by w.location_id, w.product_id
  ),
  incoming as (
    select po.location_id, i.product_id,
           sum(i.ordered_quantity - i.received_quantity) as qty,
           min(po.expected_delivery_date) as next_date
      from public.purchase_order_items i
      join public.purchase_orders po on po.id = i.purchase_order_id
     where po.organization_id = p_organization_id
       and po.status in ('ordered', 'partially_received')
       and (p_location_id is null or po.location_id = p_location_id)
       and (p_product_id is null or i.product_id = p_product_id)
     group by po.location_id, i.product_id
  )
  select pr.location_id, pr.location_name, p.id, p.sku, p.product_name, p.jan_code, cat.name, p.sales_unit,
         p.storage_type, p.units_per_case, coalesce(ps.purchase_price, p.cost_price),
         p.safety_stock, p.reorder_point, p.standard_order_quantity,
         coalesce(ps.minimum_order_quantity, p.minimum_order_quantity),
         coalesce(ps.order_lot_size, p.order_lot_size),
         coalesce(ps.lead_time_days, p.lead_time_days),
         p.shelf_life_days, p.expiration_warning_days, s.id, s.company_name,
         coalesce(b.quantity_on_hand, 0), coalesce(b.quantity_reserved, 0), coalesce(b.quantity_available, 0),
         coalesce(la.expired_qty, 0), coalesce(la.quarantined_qty, 0), coalesce(la.lots, '[]'::jsonb),
         coalesce(u.u7, 0), coalesce(u.u30, 0), coalesce(u.by_dow, array[0, 0, 0, 0, 0, 0, 0]::numeric[]),
         fl.first_date, coalesce(w.qty, 0), coalesce(inc.qty, 0), inc.next_date
    from pairs pr
    join public.products p on p.id = pr.product_id
    left join public.categories cat on cat.id = p.category_id
    left join public.suppliers s on s.id = p.primary_supplier_id
    left join public.product_suppliers ps on ps.product_id = p.id and ps.supplier_id = p.primary_supplier_id
    left join public.inventory_balances b on b.location_id = pr.location_id and b.product_id = p.id
    left join lot_agg la on la.location_id = pr.location_id and la.product_id = p.id
    left join first_lot fl on fl.location_id = pr.location_id and fl.product_id = p.id
    left join usage u on u.location_id = pr.location_id and u.product_id = p.id
    left join waste w on w.location_id = pr.location_id and w.product_id = p.id
    left join incoming inc on inc.location_id = pr.location_id and inc.product_id = p.id
   order by p.sku, pr.location_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- ダッシュボード集計
-- -----------------------------------------------------------------------------
create or replace function public.get_dashboard_summary(p_organization_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_org uuid := p_organization_id;
  v_today date := private.today_jst();
  v_month_start date := date_trunc('month', private.today_jst())::date;
  v_result jsonb;
begin
  if v_org is null or v_org not in (select private.user_organization_ids()) then
    raise exception 'この組織のデータを参照する権限がありません。' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'active_sku_count', (select count(*) from public.products p where p.organization_id = v_org and p.is_active),
    'total_quantity', (select coalesce(sum(b.quantity_on_hand), 0) from public.inventory_balances b where b.organization_id = v_org),
    'total_value', (
      select coalesce(round(sum(l.quantity_remaining * l.unit_cost)), 0)
        from public.inventory_lots l where l.organization_id = v_org and l.quantity_remaining > 0
    ),
    'expiring_soon_product_count', (
      select count(distinct l.product_id)
        from public.inventory_lots l
        join public.products p on p.id = l.product_id
       where l.organization_id = v_org and l.quantity_remaining > 0
         and l.expiration_date >= v_today and l.expiration_date <= v_today + p.expiration_warning_days
    ),
    'expired_product_count', (
      select count(distinct l.product_id)
        from public.inventory_lots l
       where l.organization_id = v_org and l.quantity_remaining > 0 and l.expiration_date < v_today
    ),
    'expired_quantity', (
      select coalesce(sum(l.quantity_remaining), 0)
        from public.inventory_lots l
       where l.organization_id = v_org and l.quantity_remaining > 0 and l.expiration_date < v_today
    ),
    'waste_month_quantity', (
      select coalesce(sum(w.quantity), 0) from public.waste_records w
       where w.organization_id = v_org and w.waste_date >= v_month_start
    ),
    'waste_month_amount', (
      select coalesce(sum(w.cost_amount), 0) from public.waste_records w
       where w.organization_id = v_org and w.waste_date >= v_month_start
    ),
    'outbound_month_quantity', (
      select coalesce(sum(-t.quantity), 0) from public.inventory_transactions t
       where t.organization_id = v_org and t.transaction_type in ('sale', 'usage')
         and t.created_at >= private.jst_start_of(v_month_start)
    ),
    'open_purchase_order_count', (
      select count(*) from public.purchase_orders po
       where po.organization_id = v_org and po.status in ('draft', 'ordered', 'partially_received')
    ),
    'draft_purchase_order_count', (
      select count(*) from public.purchase_orders po where po.organization_id = v_org and po.status = 'draft'
    ),
    'today_receipt_count', (
      select count(*) from public.receipts r where r.organization_id = v_org and r.received_date = v_today
    ),
    'today_receipt_quantity', (
      select coalesce(sum(t.quantity), 0) from public.inventory_transactions t
       where t.organization_id = v_org and t.transaction_type = 'receipt'
         and t.created_at >= private.jst_start_of(v_today)
    ),
    'today_issue_quantity', (
      select coalesce(sum(-t.quantity), 0) from public.inventory_transactions t
       where t.organization_id = v_org and t.transaction_type in ('sale', 'usage', 'transfer_out')
         and t.created_at >= private.jst_start_of(v_today)
    ),
    'today_issue_count', (
      select count(*) from public.stock_issues si
       where si.organization_id = v_org and si.created_at >= private.jst_start_of(v_today)
    ),
    'daily_flow', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d.day::date, 'inbound', coalesce(f.inbound, 0), 'outbound', coalesce(f.outbound, 0), 'waste', coalesce(f.waste, 0)
             ) order by d.day), '[]'::jsonb)
        from generate_series((v_today - 29)::timestamp, v_today::timestamp, interval '1 day') as d(day)
        left join (
          select (t.created_at at time zone 'Asia/Tokyo')::date as day,
                 sum(t.quantity) filter (where t.transaction_type in ('receipt', 'transfer_in')) as inbound,
                 sum(-t.quantity) filter (where t.transaction_type in ('sale', 'usage', 'transfer_out')) as outbound,
                 sum(-t.quantity) filter (where t.transaction_type = 'waste') as waste
            from public.inventory_transactions t
           where t.organization_id = v_org and t.created_at >= private.jst_start_of(v_today - 29)
           group by 1
        ) f on f.day = d.day::date
    ),
    'category_values', (
      select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'value', x.value) order by x.value desc), '[]'::jsonb)
        from (
          select coalesce(c.name, '未分類') as name, round(sum(l.quantity_remaining * l.unit_cost)) as value
            from public.inventory_lots l
            join public.products p on p.id = l.product_id
            left join public.categories c on c.id = p.category_id
           where l.organization_id = v_org and l.quantity_remaining > 0
           group by 1
        ) x
    ),
    'location_values', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'name', x.name, 'type', x.type, 'quantity', x.quantity, 'value', x.value
             ) order by x.value desc), '[]'::jsonb)
        from (
          select loc.name, loc.type, coalesce(sum(l.quantity_remaining), 0) as quantity,
                 coalesce(round(sum(l.quantity_remaining * l.unit_cost)), 0) as value
            from public.locations loc
            left join public.inventory_lots l on l.location_id = loc.id and l.quantity_remaining > 0
           where loc.organization_id = v_org and loc.is_active
           group by loc.id, loc.name, loc.type
        ) x
    ),
    'waste_monthly', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'month', to_char(m.month, 'YYYY-MM'), 'amount', coalesce(w.amount, 0), 'quantity', coalesce(w.quantity, 0)
             ) order by m.month), '[]'::jsonb)
        from generate_series(date_trunc('month', v_today) - interval '5 months', date_trunc('month', v_today), interval '1 month') as m(month)
        left join (
          select date_trunc('month', wr.waste_date) as month, sum(wr.cost_amount) as amount, sum(wr.quantity) as quantity
            from public.waste_records wr
           where wr.organization_id = v_org and wr.waste_date >= (date_trunc('month', v_today) - interval '5 months')::date
           group by 1
        ) w on w.month = m.month
    ),
    'waste_by_reason', (
      select coalesce(jsonb_agg(jsonb_build_object('reason', x.reason, 'amount', x.amount, 'quantity', x.quantity) order by x.amount desc), '[]'::jsonb)
        from (
          select wr.reason, sum(wr.cost_amount) as amount, sum(wr.quantity) as quantity
            from public.waste_records wr
           where wr.organization_id = v_org and wr.waste_date >= v_month_start
           group by wr.reason
        ) x
    ),
    'expiring_lots', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.expiration_date, x.sku), '[]'::jsonb)
        from (
          select l.id, l.lot_number, l.expiration_date, l.quantity_remaining, p.id as product_id, p.sku,
                 p.product_name, p.sales_unit, loc.name as location_name
            from public.inventory_lots l
            join public.products p on p.id = l.product_id
            join public.locations loc on loc.id = l.location_id
           where l.organization_id = v_org and l.quantity_remaining > 0 and l.status <> 'quarantined'
             and l.expiration_date >= v_today and l.expiration_date <= v_today + p.expiration_warning_days
           order by l.expiration_date, p.sku
           limit 10
        ) x
    ),
    'recent_transactions', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
        from (
          select t.id, t.transaction_type, t.quantity, t.created_at, p.id as product_id, p.sku, p.product_name,
                 p.sales_unit, loc.name as location_name
            from public.inventory_transactions t
            join public.products p on p.id = t.product_id
            join public.locations loc on loc.id = t.location_id
           where t.organization_id = v_org
           order by t.created_at desc
           limit 10
        ) x
    ),
    'pending_purchase_orders', (
      select coalesce(jsonb_agg(to_jsonb(x) order by x.expected_delivery_date nulls last, x.order_number), '[]'::jsonb)
        from (
          select po.id, po.order_number, po.status, po.order_date, po.expected_delivery_date, po.total_amount,
                 s.company_name as supplier_name, loc.name as location_name
            from public.purchase_orders po
            join public.suppliers s on s.id = po.supplier_id
            join public.locations loc on loc.id = po.location_id
           where po.organization_id = v_org and po.status in ('ordered', 'partially_received')
           order by po.expected_delivery_date nulls last, po.order_number
           limit 10
        ) x
    )
  ) into v_result;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 関数の実行権限
--   anon は RPC を実行できない。認証済みユーザーは関数内のロール検証を通過した場合のみ操作可能。
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- auth.users 作成トリガーは supabase_auth_admin ロールで実行される
grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user() to supabase_auth_admin;
