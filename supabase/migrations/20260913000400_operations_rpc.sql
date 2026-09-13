-- =============================================================================
-- 業務処理 RPC（原子的な在庫操作）
--
--   create_organization          オンボーディング（組織・オーナー・初期拠点・標準カテゴリ）
--   receive_stock                入庫（ロット作成/更新・在庫・履歴・発注残・発注状態）
--   issue_stock                  出庫 / 拠点間移動（FEFO 自動割当）
--   record_waste                 廃棄（在庫減算・廃棄記録・履歴）
--   create_stocktake 他           棚卸（開始・カウント保存・確定・中止）
--   create_purchase_order 他      発注（作成・下書き編集・状態遷移・AI提案から仕入先別に一括作成）
--   set_lot_quarantine           ロット隔離
--   add/update/remove member     メンバー管理
--
-- すべて SECURITY DEFINER + search_path = '' + 関数内でロール検証。
-- 関数全体が 1 トランザクションで実行され、途中のエラーはすべてロールバックされる。
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 内部ヘルパー
-- -----------------------------------------------------------------------------
create or replace function private.next_document_number(p_org uuid, p_prefix text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period text := to_char(now() at time zone 'Asia/Tokyo', 'YYYYMM');
  v_value integer;
begin
  insert into public.document_sequences as s (organization_id, prefix, period, last_value)
  values (p_org, p_prefix, v_period, 1)
  on conflict (organization_id, prefix, period)
  do update set last_value = s.last_value + 1
  returning s.last_value into v_value;

  return p_prefix || '-' || v_period || '-' || lpad(v_value::text, 5, '0');
end;
$$;

create or replace function private.product_label(p_product uuid)
returns text
language sql stable
security definer
set search_path = ''
as $$
  select coalesce((select p.sku || ' ' || p.product_name from public.products p where p.id = p_product), '不明な商品')
$$;

-- 在庫行をロック（無ければ 0 で作成）
create or replace function private.lock_balance(p_org uuid, p_location uuid, p_product uuid)
returns public.inventory_balances
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance public.inventory_balances;
begin
  insert into public.inventory_balances (organization_id, location_id, product_id)
  values (p_org, p_location, p_product)
  on conflict (location_id, product_id) do nothing;

  select * into v_balance
    from public.inventory_balances b
   where b.location_id = p_location and b.product_id = p_product
   for update;

  return v_balance;
end;
$$;

-- ロット残数を増減し、在庫履歴を 1 行記録する
create or replace function private.apply_lot_change(
  p_org uuid,
  p_lot_id uuid,
  p_delta numeric,
  p_type public.transaction_type,
  p_reference_type text,
  p_reference_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.inventory_lots;
  v_before numeric;
  v_after numeric;
  v_tx_id uuid;
begin
  select * into v_lot
    from public.inventory_lots l
   where l.id = p_lot_id and l.organization_id = p_org
   for update;
  if not found then
    raise exception 'ロットが見つかりません。' using errcode = 'P0001';
  end if;
  if v_lot.quantity_remaining + p_delta < 0 then
    raise exception 'ロット「%」の残数が不足しています。', v_lot.lot_number using errcode = 'P0001';
  end if;

  perform private.lock_balance(p_org, v_lot.location_id, v_lot.product_id);
  select b.quantity_on_hand into v_before
    from public.inventory_balances b
   where b.location_id = v_lot.location_id and b.product_id = v_lot.product_id;

  update public.inventory_lots
     set quantity_remaining = quantity_remaining + p_delta
   where id = p_lot_id;

  select b.quantity_on_hand into v_after
    from public.inventory_balances b
   where b.location_id = v_lot.location_id and b.product_id = v_lot.product_id;

  insert into public.inventory_transactions (
    organization_id, location_id, product_id, lot_id, transaction_type, quantity,
    before_quantity, after_quantity, unit_cost, reference_type, reference_id, reason, performed_by
  )
  values (
    p_org, v_lot.location_id, v_lot.product_id, p_lot_id, p_type, p_delta,
    v_before, v_after, v_lot.unit_cost, p_reference_type, p_reference_id, left(p_reason, 500), (select auth.uid())
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

-- 在庫を減算する（ロット割当）
--   p_mode = 'issue'  : FEFO。使用可能ロット（期限内・隔離なし）のみ。利用可能在庫で判定
--   p_mode = 'remove' : 廃棄・棚卸差異。期限切れ・隔離ロットも含め、期限の早い順
create or replace function private.consume_stock(
  p_org uuid,
  p_location uuid,
  p_product uuid,
  p_quantity numeric,
  p_lot_id uuid,
  p_type public.transaction_type,
  p_mode text,
  p_reference_type text,
  p_reference_id uuid,
  p_reason text
)
returns table (
  o_lot_id uuid,
  o_quantity numeric,
  o_unit_cost numeric,
  o_transaction_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := private.today_jst();
  v_remaining numeric := p_quantity;
  v_take numeric;
  v_lot record;
  v_balance public.inventory_balances;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception '数量は0より大きい値を指定してください。' using errcode = 'P0001';
  end if;
  if p_mode not in ('issue', 'remove') then
    raise exception 'invalid consume mode' using errcode = 'P0001';
  end if;

  v_balance := private.lock_balance(p_org, p_location, p_product);

  if p_mode = 'issue' and v_balance.quantity_available < p_quantity then
    raise exception '在庫が不足しています（%／利用可能 %、指定 %）。',
      private.product_label(p_product), trim_scale(v_balance.quantity_available), trim_scale(p_quantity)
      using errcode = 'P0001';
  elsif v_balance.quantity_on_hand < p_quantity then
    raise exception '在庫が不足しています（%／現在庫 %、指定 %）。',
      private.product_label(p_product), trim_scale(v_balance.quantity_on_hand), trim_scale(p_quantity)
      using errcode = 'P0001';
  end if;

  for v_lot in
    select l.id, l.quantity_remaining, l.unit_cost
      from public.inventory_lots l
     where l.organization_id = p_org
       and l.location_id = p_location
       and l.product_id = p_product
       and l.quantity_remaining > 0
       and (p_lot_id is null or l.id = p_lot_id)
       and (
         p_mode = 'remove'
         or (l.status = 'available' and (l.expiration_date is null or l.expiration_date >= v_today))
       )
     order by l.expiration_date asc nulls last, l.received_date asc, l.created_at asc, l.id asc
     for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_remaining, v_lot.quantity_remaining);
    o_transaction_id := private.apply_lot_change(
      p_org, v_lot.id, -v_take, p_type, p_reference_type, p_reference_id, p_reason
    );
    v_remaining := v_remaining - v_take;
    o_lot_id := v_lot.id;
    o_quantity := v_take;
    o_unit_cost := v_lot.unit_cost;
    return next;
  end loop;

  if v_remaining > 0 then
    if p_lot_id is not null then
      raise exception '指定したロットの残数が不足しているか、出庫できない状態（期限切れ・隔離中）です（%）。',
        private.product_label(p_product) using errcode = 'P0001';
    end if;
    raise exception '出庫可能なロット在庫が不足しています（%／不足 %）。期限切れ・隔離中のロットは出庫対象外です。',
      private.product_label(p_product), trim_scale(v_remaining) using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.require_active_location(p_org uuid, p_location uuid, p_label text)
returns public.locations
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_location public.locations;
begin
  select * into v_location from public.locations l where l.id = p_location and l.organization_id = p_org;
  if not found or not v_location.is_active then
    raise exception '%が見つからないか、無効になっています。', p_label using errcode = 'P0001';
  end if;
  return v_location;
end;
$$;

create or replace function private.require_items_array(p_items jsonb, p_max integer)
returns void
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '明細を1件以上指定してください。' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_items) > p_max then
    raise exception '明細は%件までです。', p_max using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- オンボーディング: 組織作成
-- -----------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_location_code text,
  p_location_name text,
  p_location_type public.location_type
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
  v_parent uuid;
  v_cat record;
  v_sub text;
  v_sort integer;
begin
  if v_user is null then
    raise exception 'ログインが必要です。' using errcode = '28000';
  end if;
  if private.is_demo_user() then
    raise exception 'デモユーザーは組織を作成できません。' using errcode = '42501';
  end if;
  if (select count(*) from public.organization_members m where m.user_id = v_user) >= 5 then
    raise exception '所属できる組織は5つまでです。' using errcode = 'P0001';
  end if;

  insert into public.profiles (id) values (v_user) on conflict (id) do nothing;

  insert into public.organizations (name, created_by)
  values (btrim(p_name), v_user)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (v_org, v_user, 'owner');

  insert into public.locations (organization_id, code, name, type)
  values (v_org, upper(btrim(p_location_code)), btrim(p_location_name), coalesce(p_location_type, 'store'));

  -- 標準カテゴリ（食品小売向け）
  v_sort := 0;
  for v_cat in
    select * from (values
      ('DRINK', '飲料', array['水', 'お茶', 'コーヒー', '炭酸飲料', 'ジュース', 'エナジードリンク']),
      ('DAIRY', '乳製品', array['牛乳', '乳飲料', 'ヨーグルト', 'チーズ', 'バター']),
      ('FROZEN', '冷凍食品', array['冷凍惣菜', '冷凍麺', '冷凍デザート']),
      ('MEAT', '精肉', array['精肉加工品']),
      ('FISH', '鮮魚', array['水産加工品']),
      ('VEG', '野菜', array['野菜加工品']),
      ('FRUIT', '果物', array['果物加工品']),
      ('PROCESSED', '加工食品', array['レトルト', '缶詰', '惣菜']),
      ('SEASONING', '調味料', array['基礎調味料', 'たれ・ソース']),
      ('SNACK', '菓子', array['スナック', 'チョコレート', 'デザート']),
      ('BREAD', 'パン', array['食パン', '菓子パン']),
      ('RICE', '米・麺', array['米', '麺']),
      ('GENERAL', '一般食品', array['乾物', 'シリアル']),
      ('OTHER', 'その他', array['その他'])
    ) as t(code, name, subs)
  loop
    v_sort := v_sort + 10;
    insert into public.categories (organization_id, code, name, sort_order)
    values (v_org, v_cat.code, v_cat.name, v_sort)
    returning id into v_parent;

    for i in 1 .. array_length(v_cat.subs, 1) loop
      v_sub := v_cat.subs[i];
      insert into public.categories (organization_id, parent_id, code, name, sort_order)
      values (v_org, v_parent, v_cat.code || '-' || lpad(i::text, 2, '0'), v_sub, i * 10);
    end loop;
  end loop;

  return v_org;
end;
$$;

-- -----------------------------------------------------------------------------
-- 入庫
-- p_items: [{product_id, quantity, lot_number?, manufacture_date?, expiration_date?, unit_cost?}]
-- -----------------------------------------------------------------------------
create or replace function public.receive_stock(
  p_organization_id uuid,
  p_location_id uuid,
  p_received_date date,
  p_items jsonb,
  p_supplier_id uuid default null,
  p_purchase_order_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := p_organization_id;
  v_po public.purchase_orders;
  v_supplier uuid := p_supplier_id;
  v_receipt_id uuid;
  v_number text;
  v_item jsonb;
  v_idx integer := 0;
  v_product public.products;
  v_po_item public.purchase_order_items;
  v_qty numeric;
  v_cost numeric;
  v_mfg date;
  v_exp date;
  v_lot_number text;
  v_lot_id uuid;
  v_total_qty numeric := 0;
  v_total_amount numeric := 0;
begin
  perform private.require_role(v_org, private.roles_staff());
  perform private.require_writable(v_org);
  perform private.require_active_location(v_org, p_location_id, '入庫先の拠点');
  perform private.require_items_array(p_items, 200);

  if p_received_date is null or p_received_date > private.today_jst() then
    raise exception '入庫日を正しく指定してください（未来日は指定できません）。' using errcode = 'P0001';
  end if;

  if p_purchase_order_id is not null then
    select * into v_po
      from public.purchase_orders po
     where po.id = p_purchase_order_id and po.organization_id = v_org
     for update;
    if not found then
      raise exception '発注書が見つかりません。' using errcode = 'P0001';
    end if;
    if v_po.status not in ('ordered', 'partially_received') then
      raise exception '発注済み・一部入荷の発注書のみ入庫できます。' using errcode = 'P0001';
    end if;
    if v_po.location_id <> p_location_id then
      raise exception '発注書の納品先拠点と入庫先が一致しません。' using errcode = 'P0001';
    end if;
    if v_supplier is not null and v_supplier <> v_po.supplier_id then
      raise exception '発注書の仕入先と入庫の仕入先が一致しません。' using errcode = 'P0001';
    end if;
    v_supplier := v_po.supplier_id;
  end if;

  if v_supplier is not null and not exists (
    select 1 from public.suppliers s where s.id = v_supplier and s.organization_id = v_org
  ) then
    raise exception '仕入先が見つかりません。' using errcode = 'P0001';
  end if;

  v_number := private.next_document_number(v_org, 'RC');
  insert into public.receipts (
    organization_id, receipt_number, location_id, supplier_id, purchase_order_id, received_date, notes, created_by
  )
  values (
    v_org, v_number, p_location_id, v_supplier, p_purchase_order_id, p_received_date,
    nullif(btrim(p_notes), ''), (select auth.uid())
  )
  returning id into v_receipt_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_idx := v_idx + 1;

    select * into v_product
      from public.products p
     where p.id = (v_item ->> 'product_id')::uuid and p.organization_id = v_org;
    if not found then
      raise exception '明細%: 商品が見つかりません。', v_idx using errcode = 'P0001';
    end if;

    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception '明細%: 数量は0より大きい値を指定してください。', v_idx using errcode = 'P0001';
    end if;

    v_mfg := nullif(v_item ->> 'manufacture_date', '')::date;
    v_exp := nullif(v_item ->> 'expiration_date', '')::date;
    if v_mfg is not null and v_mfg > p_received_date then
      raise exception '明細%: 製造日が入庫日より後になっています。', v_idx using errcode = 'P0001';
    end if;
    if v_mfg is not null and v_exp is not null and v_exp < v_mfg then
      raise exception '明細%: 賞味期限が製造日より前になっています。', v_idx using errcode = 'P0001';
    end if;

    if p_purchase_order_id is not null then
      select * into v_po_item
        from public.purchase_order_items i
       where i.purchase_order_id = p_purchase_order_id and i.product_id = v_product.id
       for update;
      if not found then
        raise exception '明細%: 「%」はこの発注書に含まれていません。', v_idx, v_product.product_name using errcode = 'P0001';
      end if;
      if v_po_item.received_quantity + v_qty > v_po_item.ordered_quantity then
        raise exception '明細%: 「%」の入庫数が発注残（%）を超えています。',
          v_idx, v_product.product_name, trim_scale(v_po_item.ordered_quantity - v_po_item.received_quantity)
          using errcode = 'P0001';
      end if;
      update public.purchase_order_items
         set received_quantity = received_quantity + v_qty
       where id = v_po_item.id;
      v_cost := coalesce(nullif(v_item ->> 'unit_cost', '')::numeric, v_po_item.unit_cost);
    else
      v_cost := coalesce(nullif(v_item ->> 'unit_cost', '')::numeric, v_product.cost_price);
    end if;

    if v_cost < 0 then
      raise exception '明細%: 単価に負の値は指定できません。', v_idx using errcode = 'P0001';
    end if;

    v_lot_number := nullif(btrim(v_item ->> 'lot_number'), '');
    if v_lot_number is null then
      v_lot_number := v_number || '-' || v_idx;
    end if;

    perform private.lock_balance(v_org, p_location_id, v_product.id);

    -- 同一拠点・同一ロット番号・同一期限・同一単価のロットがあれば加算（ロット更新）
    select l.id into v_lot_id
      from public.inventory_lots l
     where l.location_id = p_location_id
       and l.product_id = v_product.id
       and l.lot_number = v_lot_number
       and l.expiration_date is not distinct from v_exp
       and l.unit_cost = v_cost
       and l.status <> 'quarantined'
     order by l.created_at
     limit 1
     for update;

    if v_lot_id is null then
      insert into public.inventory_lots (
        organization_id, location_id, product_id, lot_number, received_date, manufacture_date, expiration_date,
        quantity_received, quantity_remaining, unit_cost, supplier_id, purchase_order_id, receipt_id
      )
      values (
        v_org, p_location_id, v_product.id, v_lot_number, p_received_date, v_mfg, v_exp,
        v_qty, 0, v_cost, v_supplier, p_purchase_order_id, v_receipt_id
      )
      returning id into v_lot_id;
    else
      update public.inventory_lots
         set quantity_received = quantity_received + v_qty
       where id = v_lot_id;
    end if;

    perform private.apply_lot_change(v_org, v_lot_id, v_qty, 'receipt', 'receipt', v_receipt_id, null);

    v_total_qty := v_total_qty + v_qty;
    v_total_amount := v_total_amount + round(v_qty * v_cost, 2);
    v_lot_id := null;
  end loop;

  update public.receipts
     set total_quantity = v_total_qty, total_amount = v_total_amount
   where id = v_receipt_id;

  if p_purchase_order_id is not null then
    if exists (
      select 1 from public.purchase_order_items i
       where i.purchase_order_id = p_purchase_order_id and i.received_quantity < i.ordered_quantity
    ) then
      update public.purchase_orders set status = 'partially_received' where id = p_purchase_order_id;
    else
      update public.purchase_orders set status = 'received', received_at = now() where id = p_purchase_order_id;
    end if;
  end if;

  return v_receipt_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 出庫 / 拠点間移動
-- p_items: [{product_id, quantity, lot_id?}]
-- -----------------------------------------------------------------------------
create or replace function public.issue_stock(
  p_organization_id uuid,
  p_location_id uuid,
  p_issue_type public.issue_type,
  p_items jsonb,
  p_destination_location_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := p_organization_id;
  v_source public.locations;
  v_dest public.locations;
  v_issue_id uuid;
  v_number text;
  v_tx_type public.transaction_type;
  v_item jsonb;
  v_idx integer := 0;
  v_product_id uuid;
  v_qty numeric;
  v_lot_id uuid;
  v_alloc record;
  v_src_lot public.inventory_lots;
  v_new_lot uuid;
  v_total numeric := 0;
  v_notes text := nullif(btrim(p_notes), '');
begin
  perform private.require_role(v_org, private.roles_staff());
  perform private.require_writable(v_org);
  v_source := private.require_active_location(v_org, p_location_id, '出庫元の拠点');
  perform private.require_items_array(p_items, 200);

  if p_issue_type is null then
    raise exception '出庫区分を指定してください。' using errcode = 'P0001';
  end if;

  if p_issue_type = 'transfer' then
    if p_destination_location_id is null or p_destination_location_id = p_location_id then
      raise exception '移動先には出庫元と異なる拠点を指定してください。' using errcode = 'P0001';
    end if;
    v_dest := private.require_active_location(v_org, p_destination_location_id, '移動先の拠点');
    v_tx_type := 'transfer_out';
    v_number := private.next_document_number(v_org, 'TR');
  else
    if p_destination_location_id is not null then
      raise exception '移動先は拠点間移動の場合のみ指定できます。' using errcode = 'P0001';
    end if;
    v_tx_type := p_issue_type::text::public.transaction_type;
    v_number := private.next_document_number(v_org, 'IS');
  end if;

  insert into public.stock_issues (
    organization_id, issue_number, location_id, issue_type, destination_location_id, notes, created_by
  )
  values (v_org, v_number, p_location_id, p_issue_type, p_destination_location_id, v_notes, (select auth.uid()))
  returning id into v_issue_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_idx := v_idx + 1;
    v_product_id := (v_item ->> 'product_id')::uuid;
    if not exists (select 1 from public.products p where p.id = v_product_id and p.organization_id = v_org) then
      raise exception '明細%: 商品が見つかりません。', v_idx using errcode = 'P0001';
    end if;
    v_qty := (v_item ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception '明細%: 数量は0より大きい値を指定してください。', v_idx using errcode = 'P0001';
    end if;
    v_lot_id := nullif(v_item ->> 'lot_id', '')::uuid;

    for v_alloc in
      select * from private.consume_stock(
        v_org, p_location_id, v_product_id, v_qty, v_lot_id, v_tx_type, 'issue', 'issue', v_issue_id,
        case when p_issue_type = 'transfer' then '移動先: ' || v_dest.name else v_notes end
      )
    loop
      if p_issue_type = 'transfer' then
        select * into v_src_lot from public.inventory_lots l where l.id = v_alloc.o_lot_id;
        perform private.lock_balance(v_org, p_destination_location_id, v_product_id);
        insert into public.inventory_lots (
          organization_id, location_id, product_id, lot_number, received_date, manufacture_date, expiration_date,
          quantity_received, quantity_remaining, unit_cost, supplier_id, purchase_order_id, source_lot_id
        )
        values (
          v_org, p_destination_location_id, v_product_id, v_src_lot.lot_number, private.today_jst(),
          v_src_lot.manufacture_date, v_src_lot.expiration_date, v_alloc.o_quantity, 0, v_src_lot.unit_cost,
          v_src_lot.supplier_id, v_src_lot.purchase_order_id, v_src_lot.id
        )
        returning id into v_new_lot;
        perform private.apply_lot_change(
          v_org, v_new_lot, v_alloc.o_quantity, 'transfer_in', 'issue', v_issue_id, '移動元: ' || v_source.name
        );
      end if;
    end loop;

    v_total := v_total + v_qty;
  end loop;

  update public.stock_issues set total_quantity = v_total where id = v_issue_id;
  return v_issue_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 廃棄
-- -----------------------------------------------------------------------------
create or replace function public.record_waste(
  p_organization_id uuid,
  p_location_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_reason public.waste_reason,
  p_waste_date date,
  p_lot_id uuid default null,
  p_notes text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := p_organization_id;
  v_alloc record;
  v_waste_id uuid;
  v_count integer := 0;
  v_reason_label text;
begin
  perform private.require_role(v_org, private.roles_manager());
  perform private.require_writable(v_org);
  perform private.require_active_location(v_org, p_location_id, '拠点');

  if not exists (select 1 from public.products p where p.id = p_product_id and p.organization_id = v_org) then
    raise exception '商品が見つかりません。' using errcode = 'P0001';
  end if;
  if p_reason is null then
    raise exception '廃棄理由を指定してください。' using errcode = 'P0001';
  end if;
  if p_waste_date is null or p_waste_date > private.today_jst() then
    raise exception '廃棄日を正しく指定してください（未来日は指定できません）。' using errcode = 'P0001';
  end if;

  v_reason_label := case p_reason
    when 'expired' then '期限切れ'
    when 'damaged' then '破損'
    when 'quality_issue' then '品質不良'
    when 'overstock' then '過剰在庫'
    else 'その他'
  end;

  for v_alloc in
    select * from private.consume_stock(
      v_org, p_location_id, p_product_id, p_quantity, p_lot_id, 'waste', 'remove', 'waste', null,
      '廃棄: ' || v_reason_label || coalesce('（' || nullif(btrim(p_notes), '') || '）', '')
    )
  loop
    insert into public.waste_records (
      organization_id, location_id, product_id, lot_id, quantity, reason, cost_amount, waste_date, notes, created_by
    )
    values (
      v_org, p_location_id, p_product_id, v_alloc.o_lot_id, v_alloc.o_quantity, p_reason,
      round(v_alloc.o_quantity * v_alloc.o_unit_cost, 2), p_waste_date, nullif(btrim(p_notes), ''), (select auth.uid())
    )
    returning id into v_waste_id;

    update public.inventory_transactions set reference_id = v_waste_id where id = v_alloc.o_transaction_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 棚卸
-- -----------------------------------------------------------------------------
create or replace function public.create_stocktake(
  p_organization_id uuid,
  p_location_id uuid,
  p_category_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := p_organization_id;
  v_id uuid;
  v_count integer;
begin
  perform private.require_role(v_org, private.roles_manager());
  perform private.require_writable(v_org);
  perform private.require_active_location(v_org, p_location_id, '棚卸対象の拠点');

  if p_category_id is not null and not exists (
    select 1 from public.categories c where c.id = p_category_id and c.organization_id = v_org
  ) then
    raise exception 'カテゴリが見つかりません。' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.stocktakes s where s.location_id = p_location_id and s.status = 'in_progress') then
    raise exception 'この拠点には進行中の棚卸があります。完了または中止してから開始してください。' using errcode = 'P0001';
  end if;

  insert into public.stocktakes (organization_id, stocktake_number, location_id, category_id, notes, created_by)
  values (
    v_org, private.next_document_number(v_org, 'ST'), p_location_id, p_category_id,
    nullif(btrim(p_notes), ''), (select auth.uid())
  )
  returning id into v_id;

  insert into public.stocktake_items (organization_id, stocktake_id, product_id, expected_quantity)
  select v_org, v_id, p.id, coalesce(b.quantity_on_hand, 0)
    from public.products p
    left join public.inventory_balances b on b.product_id = p.id and b.location_id = p_location_id
   where p.organization_id = v_org
     and p.is_active
     and (p_category_id is null or p.category_id = p_category_id or p.subcategory_id = p_category_id)
     -- 拠点で取扱実績がある商品、または全拠点で在庫記録のない新規商品
     and (
       b.product_id is not null
       or not exists (select 1 from public.inventory_balances b2 where b2.product_id = p.id)
     );

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception '棚卸対象の商品がありません。' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

-- p_items: [{item_id, actual_quantity (null で未カウントに戻す), reason?}]
create or replace function public.save_stocktake_counts(p_stocktake_id uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_st public.stocktakes;
  v_item jsonb;
  v_actual numeric;
  v_count integer := 0;
begin
  select * into v_st from public.stocktakes s where s.id = p_stocktake_id;
  if not found then
    raise exception '棚卸が見つかりません。' using errcode = 'P0001';
  end if;
  perform private.require_role(v_st.organization_id, private.roles_staff());
  perform private.require_writable(v_st.organization_id);
  if v_st.status <> 'in_progress' then
    raise exception '進行中の棚卸のみカウントを保存できます。' using errcode = 'P0001';
  end if;
  perform private.require_items_array(p_items, 500);

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_actual := nullif(v_item ->> 'actual_quantity', '')::numeric;
    if v_actual is not null and v_actual < 0 then
      raise exception '実数に負の値は指定できません。' using errcode = 'P0001';
    end if;
    update public.stocktake_items
       set actual_quantity = v_actual,
           reason = left(nullif(btrim(v_item ->> 'reason'), ''), 500),
           counted_by = case when v_actual is null then null else (select auth.uid()) end,
           counted_at = case when v_actual is null then null else now() end
     where id = (v_item ->> 'item_id')::uuid
       and stocktake_id = p_stocktake_id;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  update public.stocktakes set updated_at = now() where id = p_stocktake_id;
  return v_count;
end;
$$;

create or replace function public.complete_stocktake(p_stocktake_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_st public.stocktakes;
  v_item record;
  v_balance public.inventory_balances;
  v_delta numeric;
  v_lot_id uuid;
  v_adjusted integer := 0;
  v_today date := private.today_jst();
begin
  select * into v_st from public.stocktakes s where s.id = p_stocktake_id for update;
  if not found then
    raise exception '棚卸が見つかりません。' using errcode = 'P0001';
  end if;
  perform private.require_role(v_st.organization_id, private.roles_manager());
  perform private.require_writable(v_st.organization_id);
  if v_st.status <> 'in_progress' then
    raise exception '進行中の棚卸のみ確定できます。' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.stocktake_items i where i.stocktake_id = p_stocktake_id and i.actual_quantity is not null) then
    raise exception 'カウント済みの商品がありません。実数を入力してから確定してください。' using errcode = 'P0001';
  end if;

  for v_item in
    select i.id, i.product_id, i.actual_quantity, i.reason, p.cost_price, p.shelf_life_days
      from public.stocktake_items i
      join public.products p on p.id = i.product_id
     where i.stocktake_id = p_stocktake_id and i.actual_quantity is not null
     order by p.sku
  loop
    v_balance := private.lock_balance(v_st.organization_id, v_st.location_id, v_item.product_id);
    -- 棚卸中の入出庫を考慮し、確定時点の現在庫との差で調整する
    v_delta := v_item.actual_quantity - v_balance.quantity_on_hand;

    if v_delta < 0 then
      perform * from private.consume_stock(
        v_st.organization_id, v_st.location_id, v_item.product_id, -v_delta, null,
        'stocktake_adjustment', 'remove', 'stocktake', p_stocktake_id,
        '棚卸差異 ' || v_st.stocktake_number || coalesce('：' || v_item.reason, '')
      );
      v_adjusted := v_adjusted + 1;
    elsif v_delta > 0 then
      insert into public.inventory_lots (
        organization_id, location_id, product_id, lot_number, received_date, expiration_date,
        quantity_received, quantity_remaining, unit_cost
      )
      values (
        v_st.organization_id, v_st.location_id, v_item.product_id, v_st.stocktake_number || '-ADJ', v_today,
        case when v_item.shelf_life_days is not null then v_today + v_item.shelf_life_days end,
        v_delta, 0, v_item.cost_price
      )
      returning id into v_lot_id;
      perform private.apply_lot_change(
        v_st.organization_id, v_lot_id, v_delta, 'stocktake_adjustment', 'stocktake', p_stocktake_id,
        '棚卸差異 ' || v_st.stocktake_number || coalesce('：' || v_item.reason, '')
      );
      v_adjusted := v_adjusted + 1;
    end if;

    update public.stocktake_items set adjusted_quantity = v_delta where id = v_item.id;
  end loop;

  update public.stocktakes
     set status = 'completed', completed_at = now(), completed_by = (select auth.uid())
   where id = p_stocktake_id;

  return v_adjusted;
end;
$$;

create or replace function public.cancel_stocktake(p_stocktake_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_st public.stocktakes;
begin
  select * into v_st from public.stocktakes s where s.id = p_stocktake_id for update;
  if not found then
    raise exception '棚卸が見つかりません。' using errcode = 'P0001';
  end if;
  perform private.require_role(v_st.organization_id, private.roles_manager());
  perform private.require_writable(v_st.organization_id);
  if v_st.status <> 'in_progress' then
    raise exception '進行中の棚卸のみ中止できます。' using errcode = 'P0001';
  end if;
  update public.stocktakes set status = 'cancelled', completed_at = now(), completed_by = (select auth.uid())
   where id = p_stocktake_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 発注
-- -----------------------------------------------------------------------------
create or replace function private.recalculate_purchase_order(p_po_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric;
  v_tax numeric;
begin
  -- 消費税は税率ごとに合計してから端数切り捨て（インボイス方式）
  select coalesce(sum(r.amount), 0), coalesce(sum(floor(r.amount * r.tax_rate / 100)), 0)
    into v_subtotal, v_tax
    from (
      select i.tax_rate, sum(i.subtotal) as amount
        from public.purchase_order_items i
       where i.purchase_order_id = p_po_id
       group by i.tax_rate
    ) r;

  update public.purchase_orders
     set subtotal = v_subtotal, tax_amount = v_tax, total_amount = v_subtotal + v_tax
   where id = p_po_id;
end;
$$;

-- 発注単位・最小発注数量の検証
create or replace function private.validate_order_quantity(
  p_product public.products,
  p_supplier uuid,
  p_quantity numeric
)
returns void
language plpgsql stable
security definer
set search_path = ''
as $$
declare
  v_lot numeric;
  v_moq numeric;
begin
  select coalesce(ps.order_lot_size, p_product.order_lot_size),
         coalesce(ps.minimum_order_quantity, p_product.minimum_order_quantity)
    into v_lot, v_moq
    from (select 1) dummy
    left join public.product_suppliers ps on ps.product_id = p_product.id and ps.supplier_id = p_supplier;

  if p_quantity is null or p_quantity <= 0 then
    raise exception '「%」の発注数量は0より大きい値を指定してください。', p_product.product_name using errcode = 'P0001';
  end if;
  if v_lot > 0 and mod(p_quantity, v_lot) <> 0 then
    raise exception '「%」の発注数量は発注単位（%）の倍数で指定してください。',
      p_product.product_name, trim_scale(v_lot) using errcode = 'P0001';
  end if;
  if p_quantity < v_moq then
    raise exception '「%」の発注数量が最小発注数量（%）を下回っています。',
      p_product.product_name, trim_scale(v_moq) using errcode = 'P0001';
  end if;
end;
$$;

-- p_items: [{product_id, ordered_quantity, unit_cost?, ai_recommended_quantity?, ai_reason?}]
create or replace function private.insert_purchase_order(
  p_org uuid,
  p_supplier_id uuid,
  p_location_id uuid,
  p_expected_delivery_date date,
  p_notes text,
  p_status public.purchase_order_status,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_supplier public.suppliers;
  v_po_id uuid;
  v_item jsonb;
  v_product public.products;
  v_qty numeric;
  v_cost numeric;
  v_ps public.product_suppliers;
  v_max_lead integer := 0;
  v_today date := private.today_jst();
begin
  select * into v_supplier from public.suppliers s where s.id = p_supplier_id and s.organization_id = p_org;
  if not found or not v_supplier.is_active then
    raise exception '仕入先が見つからないか、無効になっています。' using errcode = 'P0001';
  end if;
  perform private.require_active_location(p_org, p_location_id, '納品先の拠点');
  perform private.require_items_array(p_items, 300);

  if (
    select count(*) <> count(distinct e.value ->> 'product_id') from jsonb_array_elements(p_items) e
  ) then
    raise exception '同じ商品が複数行に含まれています。1商品1行にまとめてください。' using errcode = 'P0001';
  end if;

  if p_expected_delivery_date is not null and p_expected_delivery_date < v_today then
    raise exception '納品予定日に過去の日付は指定できません。' using errcode = 'P0001';
  end if;

  insert into public.purchase_orders (
    organization_id, order_number, supplier_id, location_id, status, order_date, expected_delivery_date,
    notes, created_by, ordered_at
  )
  values (
    p_org, private.next_document_number(p_org, 'PO'), p_supplier_id, p_location_id, p_status, v_today,
    p_expected_delivery_date, nullif(btrim(p_notes), ''), (select auth.uid()),
    case when p_status = 'ordered' then now() end
  )
  returning id into v_po_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    select * into v_product
      from public.products p
     where p.id = (v_item ->> 'product_id')::uuid and p.organization_id = p_org;
    if not found then
      raise exception '発注明細の商品が見つかりません。' using errcode = 'P0001';
    end if;
    if not v_product.is_active then
      raise exception '「%」は無効な商品のため発注できません。', v_product.product_name using errcode = 'P0001';
    end if;

    v_qty := (v_item ->> 'ordered_quantity')::numeric;
    perform private.validate_order_quantity(v_product, p_supplier_id, v_qty);

    select * into v_ps from public.product_suppliers ps
     where ps.product_id = v_product.id and ps.supplier_id = p_supplier_id;

    v_cost := coalesce(nullif(v_item ->> 'unit_cost', '')::numeric, v_ps.purchase_price, v_product.cost_price);
    if v_cost < 0 then
      raise exception '「%」の単価に負の値は指定できません。', v_product.product_name using errcode = 'P0001';
    end if;

    v_max_lead := greatest(v_max_lead, coalesce(v_ps.lead_time_days, v_product.lead_time_days, v_supplier.standard_lead_time_days));

    insert into public.purchase_order_items (
      organization_id, purchase_order_id, product_id, ordered_quantity, unit_cost, tax_rate,
      ai_recommended_quantity, ai_reason
    )
    values (
      p_org, v_po_id, v_product.id, v_qty, v_cost, v_product.tax_rate,
      nullif(v_item ->> 'ai_recommended_quantity', '')::numeric,
      left(nullif(btrim(v_item ->> 'ai_reason'), ''), 2000)
    );
    v_ps := null;
  end loop;

  if p_expected_delivery_date is null then
    update public.purchase_orders set expected_delivery_date = v_today + v_max_lead where id = v_po_id;
  end if;

  perform private.recalculate_purchase_order(v_po_id);
  return v_po_id;
end;
$$;

create or replace function public.create_purchase_order(
  p_organization_id uuid,
  p_supplier_id uuid,
  p_location_id uuid,
  p_items jsonb,
  p_submit boolean default false,
  p_expected_delivery_date date default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_role(p_organization_id, private.roles_manager());
  perform private.require_writable(p_organization_id);
  return private.insert_purchase_order(
    p_organization_id, p_supplier_id, p_location_id, p_expected_delivery_date, p_notes,
    case when coalesce(p_submit, false) then 'ordered' else 'draft' end::public.purchase_order_status,
    p_items
  );
end;
$$;

-- AI 発注提案から仕入先ごとに発注書（下書き）を分割作成
-- p_items: [{product_id, ordered_quantity, ai_recommended_quantity, ai_reason}]
create or replace function public.create_purchase_orders_from_recommendations(
  p_organization_id uuid,
  p_location_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := p_organization_id;
  v_missing text;
  v_group record;
  v_po_id uuid;
  v_result jsonb := '[]'::jsonb;
begin
  perform private.require_role(v_org, private.roles_manager());
  perform private.require_writable(v_org);
  perform private.require_items_array(p_items, 1000);

  select string_agg(coalesce(p.sku, e.value ->> 'product_id'), '、')
    into v_missing
    from jsonb_array_elements(p_items) e
    left join public.products p on p.id = (e.value ->> 'product_id')::uuid and p.organization_id = v_org
   where p.id is null or p.primary_supplier_id is null;
  if v_missing is not null then
    raise exception '主要仕入先が未設定、または存在しない商品が含まれています: %', v_missing using errcode = 'P0001';
  end if;

  for v_group in
    select p.primary_supplier_id as supplier_id, jsonb_agg(e.value order by p.sku) as items
      from jsonb_array_elements(p_items) e
      join public.products p on p.id = (e.value ->> 'product_id')::uuid and p.organization_id = v_org
     group by p.primary_supplier_id
     order by p.primary_supplier_id
  loop
    v_po_id := private.insert_purchase_order(
      v_org, v_group.supplier_id, p_location_id, null, 'AI発注提案から作成', 'draft', v_group.items
    );
    v_result := v_result || (
      select jsonb_build_object(
        'id', po.id,
        'order_number', po.order_number,
        'supplier_name', s.company_name,
        'item_count', jsonb_array_length(v_group.items),
        'total_amount', po.total_amount
      )
      from public.purchase_orders po
      join public.suppliers s on s.id = po.supplier_id
      where po.id = v_po_id
    );
  end loop;

  return v_result;
end;
$$;

-- 下書き編集 p_items: [{item_id, ordered_quantity}]（0 で明細削除）
create or replace function public.update_purchase_order_draft(
  p_purchase_order_id uuid,
  p_items jsonb,
  p_expected_delivery_date date default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
  v_item jsonb;
  v_row public.purchase_order_items;
  v_product public.products;
  v_qty numeric;
begin
  select * into v_po from public.purchase_orders po where po.id = p_purchase_order_id for update;
  if not found then
    raise exception '発注書が見つかりません。' using errcode = 'P0001';
  end if;
  perform private.require_role(v_po.organization_id, private.roles_manager());
  perform private.require_writable(v_po.organization_id);
  if v_po.status <> 'draft' then
    raise exception '下書きの発注書のみ編集できます。' using errcode = 'P0001';
  end if;
  if p_expected_delivery_date is not null and p_expected_delivery_date < v_po.order_date then
    raise exception '納品予定日は発注日以降を指定してください。' using errcode = 'P0001';
  end if;

  if p_items is not null and jsonb_typeof(p_items) = 'array' then
    for v_item in select value from jsonb_array_elements(p_items)
    loop
      select * into v_row from public.purchase_order_items i
       where i.id = (v_item ->> 'item_id')::uuid and i.purchase_order_id = p_purchase_order_id
       for update;
      if not found then
        raise exception '発注明細が見つかりません。' using errcode = 'P0001';
      end if;
      v_qty := (v_item ->> 'ordered_quantity')::numeric;
      if v_qty is null or v_qty < 0 then
        raise exception '発注数量は0以上で指定してください。' using errcode = 'P0001';
      elsif v_qty = 0 then
        delete from public.purchase_order_items where id = v_row.id;
      else
        select * into v_product from public.products p where p.id = v_row.product_id;
        perform private.validate_order_quantity(v_product, v_po.supplier_id, v_qty);
        update public.purchase_order_items set ordered_quantity = v_qty where id = v_row.id;
      end if;
    end loop;
  end if;

  if not exists (select 1 from public.purchase_order_items i where i.purchase_order_id = p_purchase_order_id) then
    raise exception '発注明細を1件以上残してください。不要な場合は発注書をキャンセルしてください。' using errcode = 'P0001';
  end if;

  update public.purchase_orders
     set expected_delivery_date = coalesce(p_expected_delivery_date, expected_delivery_date),
         notes = nullif(btrim(p_notes), '')
   where id = p_purchase_order_id;

  perform private.recalculate_purchase_order(p_purchase_order_id);
end;
$$;

-- 状態遷移: draft → ordered / cancelled、ordered → cancelled（未入荷のみ）
create or replace function public.set_purchase_order_status(
  p_purchase_order_id uuid,
  p_status public.purchase_order_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
begin
  select * into v_po from public.purchase_orders po where po.id = p_purchase_order_id for update;
  if not found then
    raise exception '発注書が見つかりません。' using errcode = 'P0001';
  end if;
  perform private.require_role(v_po.organization_id, private.roles_manager());
  perform private.require_writable(v_po.organization_id);

  if v_po.status = 'draft' and p_status = 'ordered' then
    update public.purchase_orders set status = 'ordered', ordered_at = now() where id = p_purchase_order_id;
  elsif v_po.status in ('draft', 'ordered') and p_status = 'cancelled' then
    if exists (
      select 1 from public.purchase_order_items i
       where i.purchase_order_id = p_purchase_order_id and i.received_quantity > 0
    ) then
      raise exception '入荷済みの明細がある発注書はキャンセルできません。' using errcode = 'P0001';
    end if;
    update public.purchase_orders set status = 'cancelled', cancelled_at = now() where id = p_purchase_order_id;
  else
    raise exception 'この状態の発注書は指定した状態に変更できません。' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- ロット隔離（品質確認中など。出庫対象から除外）
-- -----------------------------------------------------------------------------
create or replace function public.set_lot_quarantine(p_lot_id uuid, p_quarantined boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot public.inventory_lots;
begin
  select * into v_lot from public.inventory_lots l where l.id = p_lot_id for update;
  if not found then
    raise exception 'ロットが見つかりません。' using errcode = 'P0001';
  end if;
  perform private.require_role(v_lot.organization_id, private.roles_manager());
  perform private.require_writable(v_lot.organization_id);

  if p_quarantined then
    if v_lot.quantity_remaining <= 0 then
      raise exception '残数のないロットは隔離できません。' using errcode = 'P0001';
    end if;
    update public.inventory_lots
       set status = 'quarantined', quarantine_reason = left(nullif(btrim(p_reason), ''), 500)
     where id = p_lot_id;
  else
    if v_lot.status <> 'quarantined' then
      raise exception '隔離中のロットではありません。' using errcode = 'P0001';
    end if;
    update public.inventory_lots
       set status = case when quantity_remaining > 0 then 'available' else 'depleted' end::public.lot_status,
           quarantine_reason = null
     where id = p_lot_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- メンバー管理
-- -----------------------------------------------------------------------------
create or replace function public.add_organization_member(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform private.require_role(p_organization_id, private.roles_admin());
  perform private.require_writable(p_organization_id);
  perform private.require_not_demo_user();

  if p_role = 'owner' and not private.has_org_role(p_organization_id, array['owner']::public.member_role[]) then
    raise exception 'オーナー権限を付与できるのはオーナーのみです。' using errcode = '42501';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'このメールアドレスのユーザーは登録されていません。先にサインアップを依頼してください。' using errcode = 'P0001';
  end if;

  insert into public.profiles (id) values (v_user) on conflict (id) do nothing;

  if exists (select 1 from public.organization_members m where m.organization_id = p_organization_id and m.user_id = v_user) then
    raise exception 'このユーザーはすでにメンバーです。' using errcode = 'P0001';
  end if;

  insert into public.organization_members (organization_id, user_id, role)
  values (p_organization_id, v_user, p_role);

  return v_user;
end;
$$;

create or replace function public.update_organization_member_role(
  p_organization_id uuid,
  p_user_id uuid,
  p_role public.member_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.member_role;
  v_is_owner boolean;
begin
  perform private.require_role(p_organization_id, private.roles_admin());
  perform private.require_writable(p_organization_id);
  perform private.require_not_demo_user();
  v_is_owner := private.has_org_role(p_organization_id, array['owner']::public.member_role[]);

  select m.role into v_current
    from public.organization_members m
   where m.organization_id = p_organization_id and m.user_id = p_user_id
   for update;
  if v_current is null then
    raise exception 'メンバーが見つかりません。' using errcode = 'P0001';
  end if;
  if (v_current = 'owner' or p_role = 'owner') and not v_is_owner then
    raise exception 'オーナー権限の変更はオーナーのみ行えます。' using errcode = '42501';
  end if;
  if v_current = 'owner' and p_role <> 'owner' and (
    select count(*) from public.organization_members m
     where m.organization_id = p_organization_id and m.role = 'owner'
  ) <= 1 then
    raise exception '最後のオーナーの権限は変更できません。' using errcode = 'P0001';
  end if;

  update public.organization_members set role = p_role
   where organization_id = p_organization_id and user_id = p_user_id;
end;
$$;

create or replace function public.remove_organization_member(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.member_role;
begin
  perform private.require_role(p_organization_id, private.roles_admin());
  perform private.require_writable(p_organization_id);
  perform private.require_not_demo_user();

  select m.role into v_current
    from public.organization_members m
   where m.organization_id = p_organization_id and m.user_id = p_user_id
   for update;
  if v_current is null then
    raise exception 'メンバーが見つかりません。' using errcode = 'P0001';
  end if;
  if v_current = 'owner' and not private.has_org_role(p_organization_id, array['owner']::public.member_role[]) then
    raise exception 'オーナーを削除できるのはオーナーのみです。' using errcode = '42501';
  end if;
  if v_current = 'owner' and (
    select count(*) from public.organization_members m
     where m.organization_id = p_organization_id and m.role = 'owner'
  ) <= 1 then
    raise exception '最後のオーナーは削除できません。' using errcode = 'P0001';
  end if;

  delete from public.organization_members
   where organization_id = p_organization_id and user_id = p_user_id;
end;
$$;
