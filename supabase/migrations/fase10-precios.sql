-- ============================================================
-- Fase 10 — Precios internos (revendedor y Javy)
-- ============================================================
-- Migración IDEMPOTENTE y NO destructiva.
-- Aplicar en Supabase → SQL Editor DESPUÉS de revisarla.
--
-- Agrega DOS precios internos por producto, además del precio de venta que ya
-- vive en products.price:
--
--   reseller_price → Precio revendedor
--   javy_price     → Precio Javy
--
-- Van en una tabla APARTE y no como columnas de products a propósito: la
-- política de lectura de products es pública (`using (true)` para anon), así que
-- cualquier columna que se agregue ahí queda legible con la clave publishable.
-- Estos precios son internos, así que necesitan su propia tabla con RLS.
--
-- Ambos son NULLABLE: null = "todavía no asignado". No hay que rellenar nada
-- para los productos que ya existen; sin fila en esta tabla, un producto
-- simplemente no tiene precios internos y todo sigue funcionando igual.
--
-- Permisos (ver "Roles y usuarios" en el README):
--   leer     → cualquier perfil activo  (public.is_staff)
--   escribir → solo Admin               (public.can_manage_pricing, se crea aquí)
--
-- Requiere public.is_staff() y public.set_updated_at(), ya creadas en
-- schema.sql. Si no existieran, esta migración falla a propósito en vez de
-- crear versiones distintas por su cuenta.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Permiso de escritura: solo Admin
-- ------------------------------------------------------------
-- NO se reutiliza can_manage_users(): significa otra cosa. La Fase 9 ya dejó la
-- lección de que reciclar un nombre de permiso (is_admin, que en realidad es
-- can_write) confunde para siempre. Una función por permiso, con su nombre real.
create or replace function public.can_manage_pricing()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles
    where user_id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

grant execute on function public.can_manage_pricing() to authenticated;

-- ------------------------------------------------------------
-- 2) Tabla de precios internos (1:1 con producto)
-- ------------------------------------------------------------
-- product_id es la PRIMARY KEY (no una columna más): garantiza una sola fila de
-- precios por producto y hace que el upsert por product_id sea trivial.
create table if not exists public.product_pricing (
  product_id     uuid primary key references public.products(id) on delete cascade,
  reseller_price numeric,
  javy_price     numeric,
  updated_at     timestamptz not null default now(),
  updated_by     text
);

-- Por si la tabla ya existía de una corrida anterior e incompleta.
alter table public.product_pricing add column if not exists reseller_price numeric;
alter table public.product_pricing add column if not exists javy_price     numeric;
alter table public.product_pricing add column if not exists updated_at     timestamptz not null default now();
alter table public.product_pricing add column if not exists updated_by     text;

-- Precios no negativos. products.price no tiene este check (deuda vieja); acá
-- se arranca bien: la UI valida, pero la base es la que manda.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_pricing_reseller_nonneg'
      and conrelid = 'public.product_pricing'::regclass
  ) then
    alter table public.product_pricing
      add constraint product_pricing_reseller_nonneg
      check (reseller_price is null or reseller_price >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'product_pricing_javy_nonneg'
      and conrelid = 'public.product_pricing'::regclass
  ) then
    alter table public.product_pricing
      add constraint product_pricing_javy_nonneg
      check (javy_price is null or javy_price >= 0);
  end if;
end $$;

drop trigger if exists set_product_pricing_updated_at on public.product_pricing;
create trigger set_product_pricing_updated_at
before update on public.product_pricing
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3) Seguridad
-- ------------------------------------------------------------
alter table public.product_pricing enable row level security;

-- Sin GRANT no hay acceso, ni siquiera con una policy que diga que sí.
-- anon queda deliberadamente afuera: el sitio público nunca ve estos precios.
revoke all on public.product_pricing from anon;
grant select, insert, update, delete on public.product_pricing to authenticated;

drop policy if exists "Staff can read product pricing"    on public.product_pricing;
drop policy if exists "Owner can insert product pricing"  on public.product_pricing;
drop policy if exists "Owner can update product pricing"  on public.product_pricing;
drop policy if exists "Owner can delete product pricing"  on public.product_pricing;

-- Leer: cualquier perfil activo del panel (Admin, Editor y Lector).
create policy "Staff can read product pricing"
on public.product_pricing
for select
to authenticated
using (public.is_staff());

-- Escribir: solo Admin.
create policy "Owner can insert product pricing"
on public.product_pricing
for insert
to authenticated
with check (public.can_manage_pricing());

create policy "Owner can update product pricing"
on public.product_pricing
for update
to authenticated
using (public.can_manage_pricing())
with check (public.can_manage_pricing());

create policy "Owner can delete product pricing"
on public.product_pricing
for delete
to authenticated
using (public.can_manage_pricing());

commit;

-- ============================================================
-- Comprobación rápida después de aplicar:
--
--   -- debe fallar con "permission denied" usando la clave publishable (anon):
--   select * from public.product_pricing;
--
--   -- desde el panel, con sesión de Admin, debe funcionar:
--   insert into public.product_pricing (product_id, reseller_price)
--   values ('<uuid-de-un-producto>', 40)
--   on conflict (product_id) do update set reseller_price = excluded.reseller_price;
--
-- No hay backfill: los productos existentes arrancan sin fila acá, que es lo
-- mismo que "sin precio interno asignado".
-- ============================================================
