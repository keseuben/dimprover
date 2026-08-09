-- DIMPRO Árutér - PostgreSQL / Supabase adatbázis séma váz
-- Cél: saját ajánlatoldal, foglalás, előkészítés, átvétel, belső árufelvevő és pénztár adatainak tartós tárolása.
-- Megjegyzés: ezt éles adatbázisban csak külön ellenőrzés után futtasd.

create extension if not exists pgcrypto;

-- 1. Üzlet / telephely
create table if not exists aruter_shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  template_type text not null check (template_type in ('kertészet', 'tüzép', 'húsbolt', 'egyedi')),
  tagline text,
  description text,
  address text,
  phone text,
  email text,
  public_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Felhasználók / szerepkörök
create table if not exists aruter_users (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references aruter_shops(id) on delete cascade,
  name text not null,
  email text,
  role text not null check (role in ('admin', 'goods_recorder', 'cashier', 'warehouse_issuer', 'loyal_customer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Kategóriák
create table if not exists aruter_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references aruter_shops(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4. Áruterületi helyek
create table if not exists aruter_storage_zones (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references aruter_shops(id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5. Termékek
create table if not exists aruter_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references aruter_shops(id) on delete cascade,
  category_id uuid references aruter_categories(id) on delete set null,
  storage_zone_id uuid references aruter_storage_zones(id) on delete set null,
  sku text not null,
  barcode text,
  name text not null,
  description text,
  template text not null check (template in ('kertészet', 'tüzép', 'húsbolt', 'egyedi')),
  unit text not null,
  price_net numeric(12,2) not null default 0,
  vat_rate numeric(5,2) not null default 27,
  stock_quantity numeric(12,3) not null default 0,
  image_url text,
  is_public_offer boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, sku)
);

-- 6. Belső rendelések / pénztárra küldött kosarak
create table if not exists aruter_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references aruter_shops(id) on delete cascade,
  order_number text not null,
  template text not null check (template in ('kertészet', 'tüzép', 'húsbolt', 'egyedi')),
  status text not null check (status in ('draft', 'sent_to_cashier', 'paid', 'issued', 'cancelled')),
  customer_name text not null,
  customer_type text not null check (customer_type in ('walk_in', 'loyal_customer', 'contractor')),
  recorder_user_id uuid references aruter_users(id) on delete set null,
  cashier_user_id uuid references aruter_users(id) on delete set null,
  issuer_user_id uuid references aruter_users(id) on delete set null,
  payment_method text,
  pickup_time timestamptz,
  note text,
  created_at timestamptz not null default now(),
  sent_to_cashier_at timestamptz,
  paid_at timestamptz,
  issued_at timestamptz,
  unique (shop_id, order_number)
);

-- 7. Belső rendelési tételek snapshot mezőkkel
create table if not exists aruter_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references aruter_orders(id) on delete cascade,
  product_id uuid references aruter_products(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text not null,
  unit_snapshot text not null,
  quantity numeric(12,3) not null,
  price_net_snapshot numeric(12,2) not null,
  vat_rate_snapshot numeric(5,2) not null,
  storage_zone_snapshot text,
  created_at timestamptz not null default now()
);

-- 8. Nyilvános ajánlatoldali foglalások
create table if not exists aruter_public_reservations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references aruter_shops(id) on delete set null,
  business_slug text not null,
  product_id text not null,
  product_name text not null,
  product_description text,
  product_price numeric(12,2) not null,
  product_unit text not null,
  quantity numeric(12,3) not null default 1,
  pickup_slot_id text not null,
  pickup_slot_label text not null,
  customer_name text not null,
  phone text not null,
  email text,
  note text,
  accepted_privacy boolean not null default false,
  status text not null default 'new' check (status in ('new', 'confirmed', 'preparing', 'ready', 'picked_up', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 9. Eseménynapló / realtime alap
create table if not exists aruter_realtime_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references aruter_shops(id) on delete cascade,
  order_id uuid,
  public_reservation_id uuid references aruter_public_reservations(id) on delete cascade,
  type text not null check (type in ('cart_created', 'cart_sent', 'payment_registered', 'goods_issued', 'stock_changed', 'public_reservation_created', 'public_reservation_status_changed')),
  title text not null,
  description text,
  created_by_user_id uuid references aruter_users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Indexek
create index if not exists idx_aruter_products_shop on aruter_products(shop_id);
create index if not exists idx_aruter_products_public_offer on aruter_products(shop_id, is_public_offer, is_active);
create index if not exists idx_aruter_orders_shop_status on aruter_orders(shop_id, status);
create index if not exists idx_aruter_public_reservations_slug_status on aruter_public_reservations(business_slug, status);
create index if not exists idx_aruter_public_reservations_created_at on aruter_public_reservations(created_at desc);
create index if not exists idx_aruter_events_created_at on aruter_realtime_events(created_at desc);
