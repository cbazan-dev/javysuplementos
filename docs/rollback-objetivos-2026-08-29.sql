-- ============================================================
-- Rollback — normalización de objetivos, 29 de agosto de 2026
-- ============================================================
-- Qué se corrigió: 1 producto había vuelto a quedar con el objetivo
-- "Ganar masa muscular", que fase8-taxonomia.sql ya había colapsado a
-- "Ganar masa". Reapareció porque el panel admin seguía ofreciendo la lista
-- vieja de sugerencias (js/admin/config.js → GOAL_SUGGESTIONS), con los
-- sinónimos que esa migración justamente había eliminado. Se corrigió el dato
-- Y la lista del panel; si no, vuelve a pasar en la próxima edición.
--
-- Migración aplicada (idempotente; `array_agg(distinct ...)` evita dejar
-- "Ganar masa" repetido si el producto ya lo tenía):
--
--   update public.products
--   set goals = (
--     select array_agg(distinct case when g = 'Ganar masa muscular'
--                                    then 'Ganar masa' else g end)
--     from unnest(goals) g
--   )
--   where 'Ganar masa muscular' = any(goals);
--
-- Estado ANTES de la migración (para restaurar):
update public.products
set goals = '{"Ganar masa muscular","Definición"}'::text[]
where id = 'dc9dddfc-6890-4dd0-8d9d-6a711b61f767';  -- King Whey Sport Protein (Ronnie Coleman)

-- Verificación (deben quedar los 8 objetivos canónicos de fase8, sin sinónimos):
-- select g, count(*) from public.products, unnest(goals) g
-- where is_active is not false group by 1 order by 2 desc;
