-- ============================================================
-- Fase 11 — Eliminar los combos
-- ============================================================
-- Migración DESTRUCTIVA e IRREVERSIBLE. Aplicar en Supabase → SQL Editor
-- DESPUÉS de revisarla, y solo cuando el código que los usaba ya no esté
-- desplegado.
--
-- Los combos (fase4-combos.sql) se retiran del producto: se eliminaron la
-- sección del inicio, la pestaña del panel, su drawer y toda la API de
-- js/db.js. Sin código que las lea, estas tablas solo quedaban ocupando
-- lugar y confundiendo a quien abra el esquema.
--
-- Al momento de escribir esta migración había 1 combo (inactivo) con 2
-- ítems. Ese dato se pierde y no hay forma de recuperarlo: si algún día se
-- vuelven a necesitar combos, hay que crearlos de cero.
--
-- combo_items tiene FK a combos, a products y a product_flavors. Se borra
-- primero la tabla hija para no depender del orden del CASCADE, y el DROP
-- lleva IF EXISTS para que la migración se pueda correr dos veces sin error.
-- ============================================================

begin;

-- Las políticas RLS y los triggers se van con la tabla; no hay que tocarlos.
drop table if exists public.combo_items;
drop table if exists public.combos;

commit;

-- Verificación (debe devolver 0 filas):
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name in ('combos', 'combo_items');
