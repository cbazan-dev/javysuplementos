-- ============================================================
-- Fase 10 — Impedir borrar categorías con productos asignados
-- ============================================================
-- Aplicar en Supabase → SQL Editor. La interfaz ya avisa antes de borrar,
-- pero esta regla protege también contra llamadas directas o simultáneas.
-- Una familia no se puede borrar si ella o cualquiera de sus subcategorías
-- conserva productos. Una subcategoría exige tener cero productos.
-- ============================================================

create or replace function public.prevent_category_delete_with_products()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.products p
    where p.category_id = old.id
       or p.category_id in (
         select child.id
         from public.categories child
         where child.parent_id = old.id
       )
  ) then
    raise exception 'No se puede eliminar la categoría "%": primero reasigna todos sus productos.', old.name
      using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_category_delete_with_products on public.categories;
create trigger prevent_category_delete_with_products
before delete on public.categories
for each row
execute function public.prevent_category_delete_with_products();
