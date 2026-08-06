-- ============================================================
-- Fase 8 — Limpieza de la taxonomía de categorías y objetivos
-- ============================================================
-- Migración IDEMPOTENTE y NO destructiva con los productos: no borra ni un
-- producto, solo reordena categorías, borra las que están vacías Y muertas, y
-- normaliza texto.
--
-- Aplicar en Supabase → SQL Editor DESPUÉS de revisarla (misma convención que
-- fase3-categorias.sql). Contexto completo en docs/analisis-categorias.md.
--
-- QUÉ **NO** HACE, a propósito:
--   No borra las subcategorías vacías de Quemadores, Pre-entrenos, Aminoácidos
--   y Salud y bienestar. Están vacías porque sus 58 productos cuelgan de la
--   familia — y son exactamente el destino al que hay que moverlos. Borrarlas
--   ahora dejaría el reparto sin destino. Se limpian DESPUÉS del reparto, con
--   el bloque opcional del final.
-- ============================================================

-- ------------------------------------------------------------
-- RESPALDO — correr ANTES de la migración. `goals` y `category` se reescriben
-- de forma irreversible, así que el snapshot vive en la propia base.
-- ------------------------------------------------------------
-- drop table if exists public.categories_backup_fase8;
-- drop table if exists public.products_backup_fase8;
-- create table public.categories_backup_fase8 as select * from public.categories;
-- create table public.products_backup_fase8 as
--   select id, category_id, category, goals from public.products;
--
-- RESTAURAR (si algo salió mal):
-- insert into public.categories select * from public.categories_backup_fase8
--   on conflict (id) do update set name = excluded.name, slug = excluded.slug,
--     sort_order = excluded.sort_order, is_active = excluded.is_active,
--     parent_id = excluded.parent_id;
-- update public.products p set category_id = b.category_id, category = b.category,
--   goals = b.goals from public.products_backup_fase8 b where p.id = b.id;

begin;

-- ------------------------------------------------------------
-- 1) Duplicado real: "ISO" (creado a mano) vs "ISO (aislada)".
--    Cualquier producto que apunte al duplicado se reasigna antes de borrarlo.
-- ------------------------------------------------------------
update public.products p
set category_id = (select id from public.categories where slug = 'tipo-iso')
where p.category_id = (select id from public.categories where slug = 'tipo-iso-mrt88w1c');

delete from public.categories where slug = 'tipo-iso-mrt88w1c';

-- ------------------------------------------------------------
-- 2) Las 4 categorías planas heredadas de antes de la fase 3. Están inactivas
--    desde entonces (el público no las ve) pero ensucian el panel, y una de
--    ellas hace que "Quemadores" aparezca dos veces en la lista.
--    El guard de category_id es defensivo: no deberían tener productos.
-- ------------------------------------------------------------
delete from public.categories c
where c.slug in ('proteinas', 'creatinas', 'pre-entrenos', 'quemadores',
                 'vitaminas', 'aminoacidos', 'accesorios', 'otros')
  and c.parent_id is null
  and c.is_active = false
  and not exists (select 1 from public.products p where p.category_id = c.id);

-- ------------------------------------------------------------
-- 3) Subcategorías vacías SIN destino pendiente: sus familias no tienen
--    productos colgados sueltos, así que nadie las va a llenar en el reparto.
-- ------------------------------------------------------------
delete from public.categories c
where c.slug in ('tipo-beef', 'tipo-vegana', 'tipo-lean-gainer')
  and not exists (select 1 from public.products p where p.category_id = c.id);

-- ------------------------------------------------------------
-- 4) "Energía y rendimiento" (4 productos) pasa a ser parte de Pre-entrenos.
--    Dos familias flacas compitiendo con Proteínas (27) y Salud (28) diluyen
--    la grilla del home; como subcategorías siguen siendo encontrables.
-- ------------------------------------------------------------
update public.categories
set parent_id = (select id from public.categories where slug = 'fam-pre-entrenos'),
    updated_at = now()
where slug in ('tipo-bebidas', 'tipo-cafeina', 'tipo-carbohidratos');

-- Los productos asignados a la familia Energía pasan a la familia Pre-entrenos.
update public.products
set category_id = (select id from public.categories where slug = 'fam-pre-entrenos')
where category_id = (select id from public.categories where slug = 'fam-energia');

update public.categories
set name = 'Pre-entrenos y energía', updated_at = now()
where slug = 'fam-pre-entrenos';

delete from public.categories c
where c.slug = 'fam-energia'
  and not exists (select 1 from public.categories h where h.parent_id = c.id)
  and not exists (select 1 from public.products p where p.category_id = c.id);

-- ------------------------------------------------------------
-- 5) Orden de familias por inventario: lo que más se busca, primero.
--    Antes era 1,2,3,4,6,8,9,11,13 (con huecos por compartir la secuencia con
--    las planas) y dejaba Creatina (11 productos) delante de Proteínas (27).
-- ------------------------------------------------------------
update public.categories c
set sort_order = v.orden, updated_at = now()
from (values
  ('fam-proteinas',     1),
  ('fam-salud',         2),
  ('fam-creatina',      3),
  ('fam-quemadores',    4),
  ('fam-pre-entrenos',  5),
  ('fam-aminoacidos',   6),
  ('fam-ganadores',     7),
  ('fam-potenciadores', 8)
) as v(slug, orden)
where c.slug = v.slug;

-- ------------------------------------------------------------
-- 6) Productos sin category_id.
--    NO se asignan acá a propósito: al momento de escribir esta migración el
--    único que queda es «Producto sin nombre» (category = 'Producto'), un
--    registro incompleto al que adivinarle una categoría sería inventar dato.
--    Se detecta con el filtro "Sin categoría" del panel y se resuelve a mano.
--    Query para listarlos:
--      select id, name, category from public.products where category_id is null;
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 7) `products.category` (texto) se deriva de category_id. Había 30 valores
--    distintos para 37 subcategorías, con "Salud y Bienestar" (13 productos) y
--    "Salud y bienestar" (9) conviviendo y apuntando a la misma categoría.
--    A partir de acá el panel lo mantiene derivado al guardar.
-- ------------------------------------------------------------
update public.products p
set category = c.name
from public.categories c
where p.category_id = c.id
  and p.category is distinct from c.name;

-- ------------------------------------------------------------
-- 8) Objetivos: 34 valores con sinónimos ("Masa muscular" / "Ganar masa
--    muscular" / "Volumen") se colapsan a 8. El filtro Objetivo muestra 6
--    opciones antes de "Ver más", así que la fragmentación lo volvía inusable.
-- ------------------------------------------------------------
update public.products p
set goals = sub.nuevos
from (
  select p2.id,
         array_agg(distinct case g
           when 'Masa muscular'         then 'Ganar masa'
           when 'Ganar masa muscular'   then 'Ganar masa'
           when 'Volumen'               then 'Ganar masa'
           when 'Ganar peso'            then 'Ganar masa'
           when 'Subir calorías'        then 'Ganar masa'
           when 'Definición'            then 'Definición'
           when 'Metabolismo'           then 'Definición'
           when 'Fuerza'                then 'Fuerza y rendimiento'
           when 'Rendimiento'           then 'Fuerza y rendimiento'
           when 'Resistencia'           then 'Fuerza y rendimiento'
           when 'Energía'               then 'Energía y enfoque'
           when 'Enfoque'               then 'Energía y enfoque'
           when 'Pump'                  then 'Energía y enfoque'
           when 'Recuperación'          then 'Recuperación'
           when 'Recuperación nocturna' then 'Recuperación'
           when 'Sueño'                 then 'Descanso y estrés'
           when 'Relajación'            then 'Descanso y estrés'
           when 'Estrés'                then 'Descanso y estrés'
           when 'Bienestar mental'      then 'Descanso y estrés'
           when 'Piel'                  then 'Belleza'
           when 'Cabello'               then 'Belleza'
           when 'Uñas'                  then 'Belleza'
           else 'Salud general'
         end) as nuevos
  from public.products p2, unnest(coalesce(p2.goals, '{}')) g
  group by p2.id
) as sub
where p.id = sub.id;

commit;

-- ============================================================
-- VERIFICACIÓN (correr por separado, NO es parte de la migración).
-- ============================================================

-- A) Familias con su inventario real (directos + subcategorías).
--    OJO: no unir contra las subcategorías como filas (`join categories t`) y
--    contar ahí — cada producto suelto se contaría una vez por subcategoría y
--    los totales salen inflados. La subconsulta evita ese fan-out.
-- select f.name, f.sort_order,
--        count(*) filter (where p.category_id = f.id) as sueltos,
--        count(*) as total
-- from public.categories f
-- join public.products p
--   on p.category_id = f.id
--   or p.category_id in (select t.id from public.categories t where t.parent_id = f.id)
-- where f.parent_id is null
-- group by f.id, f.name, f.sort_order
-- order by f.sort_order;

-- B) Objetivos tras normalizar (deberían quedar 8):
-- select g, count(*) from public.products p, unnest(coalesce(p.goals,'{}')) g
-- group by 1 order by 2 desc;

-- C) Texto desincronizado (debería dar 0 filas):
-- select p.name, p.category, c.name from public.products p
-- join public.categories c on c.id = p.category_id where p.category <> c.name;

-- ============================================================
-- OPCIONAL — correr SOLO DESPUÉS de repartir los productos sueltos.
-- Borra las subcategorías que sigan vacías cuando ya no queden productos
-- colgados de una familia esperando destino.
-- ============================================================
-- delete from public.categories c
-- where c.parent_id is not null
--   and not exists (select 1 from public.products p where p.category_id = c.id);
