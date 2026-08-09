-- DIMPRO Árutér - induló Supabase tesztadatok
-- Ezt az `aruter-schema.sql` lefuttatása után futtasd Supabase SQL Editorban.

insert into aruter_shops (
  name,
  slug,
  template_type,
  tagline,
  description,
  address,
  phone,
  email,
  public_url
) values (
  'Kovács Kertészet',
  'kovacs-kerteszet',
  'kertészet',
  'Minőségi növények szeretettel.',
  'Saját digitális ajánlatoldal online foglalással, előkészítéssel és személyes átvétellel.',
  '6723 Szeged, Kertész utca 12.',
  '+36 30 123 4567',
  'info@kovacskerteszet.hu',
  'aruter.hu/kovacskerteszet'
)
on conflict (slug) do nothing;

insert into aruter_categories (shop_id, name, sort_order)
select id, 'Virágok', 10 from aruter_shops where slug = 'kovacs-kerteszet'
on conflict do nothing;

insert into aruter_categories (shop_id, name, sort_order)
select id, 'Örökzöldek', 20 from aruter_shops where slug = 'kovacs-kerteszet'
on conflict do nothing;

insert into aruter_categories (shop_id, name, sort_order)
select id, 'Föld és mulcs', 30 from aruter_shops where slug = 'kovacs-kerteszet'
on conflict do nothing;

insert into aruter_storage_zones (shop_id, name, code)
select id, 'Külső árutér', 'K-01' from aruter_shops where slug = 'kovacs-kerteszet'
on conflict do nothing;

insert into aruter_products (
  shop_id,
  category_id,
  storage_zone_id,
  sku,
  name,
  description,
  template,
  unit,
  price_net,
  vat_rate,
  stock_quantity,
  is_public_offer
)
select
  shop.id,
  category.id,
  zone.id,
  'KERT-MUSKATLI-001',
  'Muskátli',
  'Piros, álló',
  'kertészet',
  'db',
  779.53,
  27,
  120,
  true
from aruter_shops shop
left join aruter_categories category on category.shop_id = shop.id and category.name = 'Virágok'
left join aruter_storage_zones zone on zone.shop_id = shop.id and zone.code = 'K-01'
where shop.slug = 'kovacs-kerteszet'
on conflict (shop_id, sku) do nothing;

insert into aruter_products (
  shop_id,
  category_id,
  storage_zone_id,
  sku,
  name,
  description,
  template,
  unit,
  price_net,
  vat_rate,
  stock_quantity,
  is_public_offer
)
select
  shop.id,
  category.id,
  zone.id,
  'KERT-CIPRUS-001',
  'Leylandi ciprus',
  '120–140 cm',
  'kertészet',
  'db',
  1960.63,
  27,
  40,
  true
from aruter_shops shop
left join aruter_categories category on category.shop_id = shop.id and category.name = 'Örökzöldek'
left join aruter_storage_zones zone on zone.shop_id = shop.id and zone.code = 'K-01'
where shop.slug = 'kovacs-kerteszet'
on conflict (shop_id, sku) do nothing;

insert into aruter_products (
  shop_id,
  category_id,
  storage_zone_id,
  sku,
  name,
  description,
  template,
  unit,
  price_net,
  vat_rate,
  stock_quantity,
  is_public_offer
)
select
  shop.id,
  category.id,
  zone.id,
  'KERT-FOLD-050L',
  'Virágföld',
  '50 liter',
  'kertészet',
  'zsák',
  1251.97,
  27,
  75,
  true
from aruter_shops shop
left join aruter_categories category on category.shop_id = shop.id and category.name = 'Föld és mulcs'
left join aruter_storage_zones zone on zone.shop_id = shop.id and zone.code = 'K-01'
where shop.slug = 'kovacs-kerteszet'
on conflict (shop_id, sku) do nothing;
