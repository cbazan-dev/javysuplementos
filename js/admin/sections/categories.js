/* ============================================================================
   Sección Categorías: familias y tipos (jerarquía), editar, ocultar y borrar.
   ============================================================================ */
import { state, families, typesOf, catById } from "../state.js?v=adm-90d40885";
import { $, esc, ico } from "../helpers.js?v=adm-90d40885";
import { setView } from "../view.js?v=adm-90d40885";
import { emptyFeature, promptModal, confirmModal, toast, ensureMenuListeners } from "../ui.js?v=adm-90d40885";

export function renderCategories() {
  if (!state.categoriesSupported) {
    setView(emptyFeature("Categorías no disponibles", "Aplica la migración de categorías (Familia → Tipo) en Supabase para gestionarlas aquí."));
    return;
  }
  const fams = families();
  const productCountFor = (cat) => {
    const childIds = typesOf(cat.id).map((t) => t.id);
    const ids = [cat.id, ...childIds];
    return state.products.filter((p) => ids.includes(p.category_id)).length;
  };
  const typeCountFor = (type) =>
    state.products.filter((p) => String(p.category_id) === String(type.id)).length;

  const cards = fams.map((c) => {
    const subs = typesOf(c.id);
    return `
    <div class="ad-cat${c.is_active === false ? " is-hidden" : ""}" data-cat="${esc(c.id)}">
      <div class="ad-cat__head">
        <div class="ad-cat__title"><strong>${esc(c.name)}</strong><small>${productCountFor(c)} productos</small></div>
        <div class="ad-cat__actions" data-write-only>
          <button class="ad-icon-btn" type="button" title="Renombrar" data-cat-rename="${esc(c.id)}">${ico("pencil")}</button>
          <div class="ad-menu" data-menu>
            <button class="ad-icon-btn" type="button" data-menu-toggle title="Más opciones" aria-haspopup="menu" aria-expanded="false">${ico("more-horizontal")}</button>
            <div class="ad-menu__panel" role="menu" hidden>
              <button class="ad-menu__item" type="button" role="menuitem" data-cat-hide="${esc(c.id)}">${ico("power")}${c.is_active === false ? "Mostrar" : "Ocultar"}</button>
              <button class="ad-menu__item ad-menu__item--danger" type="button" role="menuitem" data-cat-del="${esc(c.id)}">${ico("trash")}Eliminar</button>
            </div>
          </div>
        </div>
      </div>
      <div class="ad-cat__types">
        <span class="ad-cat__sublabel">Subcategorías</span>
        <div class="ad-cat__chips">
          ${subs.map((t) => {
            const n = typeCountFor(t);
            // El nombre y el conteo se ocultan a lectores de pantalla y se
            // reemplazan por una sola etiqueta que incluye el número: antes el
            // conteo era aria-hidden y no llegaba a anunciarse nunca.
            const etiqueta = `${t.name}: ${n} producto${n === 1 ? "" : "s"}`;
            return `<span class="ad-type-chip${n ? "" : " is-empty"}">
              <button class="ad-type-chip__name" type="button" data-type-rename="${esc(t.id)}" title="Renombrar “${esc(t.name)}”">
                <span class="ad-type-chip__label" aria-hidden="true">${esc(t.name)}</span>
                <span class="ad-type-chip__count" aria-hidden="true">${n}</span>
                <span class="ad-sr-only">${esc(etiqueta)}. Renombrar</span>
              </button>
              <button class="ad-type-chip__del" data-write-only type="button" aria-label="Eliminar subcategoría ${esc(t.name)}" title="Eliminar “${esc(t.name)}”" data-type-del="${esc(t.id)}">${ico("x")}</button>
            </span>`;
          }).join("")}
          ${subs.length ? "" : `<span class="ad-cat__empty">Aún sin subcategorías.</span>`}
          <button class="ad-type-chip ad-type-chip--add" data-write-only type="button" data-type-add="${esc(c.id)}">${ico("plus")}Añadir</button>
        </div>
      </div>
    </div>`;
  }).join("");

  setView(`
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Catálogo</p><p>Catálogo de categorías y subcategorías.</p></div>
      <button class="ad-btn ad-btn--primary" type="button" data-fam-add data-write-only>${ico("plus")}Nueva categoría</button>
    </div>
    <div class="ad-panel">${cards || `<p class="ad-ops__empty">Todavía no hay categorías. Crea la primera.</p>`}</div>`);

  const view = $("#adminView");
  view.querySelector("[data-fam-add]").addEventListener("click", addFamily);
  view.querySelectorAll("[data-cat-rename]").forEach((b) => b.addEventListener("click", () => renameCategory(b.getAttribute("data-cat-rename"))));
  view.querySelectorAll("[data-cat-hide]").forEach((b) => b.addEventListener("click", () => toggleCategoryHidden(b.getAttribute("data-cat-hide"))));
  view.querySelectorAll("[data-cat-del]").forEach((b) => b.addEventListener("click", () => deleteFamily(b.getAttribute("data-cat-del"))));
  view.querySelectorAll("[data-type-add]").forEach((b) => b.addEventListener("click", () => addType(b.getAttribute("data-type-add"))));
  view.querySelectorAll("[data-type-del]").forEach((b) => b.addEventListener("click", () => deleteType(b.getAttribute("data-type-del"))));
  view.querySelectorAll("[data-type-rename]").forEach((b) => b.addEventListener("click", () => renameCategory(b.getAttribute("data-type-rename"))));
  ensureMenuListeners();
}

async function addFamily() {
  const name = await promptModal({ title: "Nueva categoría", label: "Nombre de la categoría (ej. Proteínas)" });
  if (!name) return;
  try {
    // max(sort_order)+1: cae al final sin chocar con valores existentes (p. ej. 100)
    const sortOrder = families().reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0) + 1;
    const created = await window.catalogDb.createCategory({ name, parentId: null, sortOrder });
    state.categories.push(created);
    toast({ tone: "ok", msg: "Categoría creada", sub: name });
    renderCategories();
  } catch (e) { toast({ tone: "err", msg: "No se pudo crear", sub: e.message }); }
}
async function addType(famId) {
  const name = await promptModal({ title: "Nueva subcategoría", label: "Nombre de la subcategoría (ej. Whey)" });
  if (!name) return;
  try {
    const created = await window.catalogDb.createCategory({ name, parentId: famId, sortOrder: typesOf(famId).length + 1 });
    state.categories.push(created);
    toast({ tone: "ok", msg: "Subcategoría creada", sub: name });
    renderCategories();
  } catch (e) { toast({ tone: "err", msg: "No se pudo crear", sub: e.message }); }
}
async function renameCategory(id) {
  const cat = catById(id);
  if (!cat) return;
  const name = await promptModal({ title: "Renombrar", label: "Nuevo nombre", value: cat.name });
  if (!name || name === cat.name) return;
  try {
    const updated = await window.catalogDb.updateCategory(id, { name });
    Object.assign(cat, updated);
    toast({ tone: "ok", msg: "Categoría renombrada", sub: name });
    renderCategories();
  } catch (e) { toast({ tone: "err", msg: "No se pudo renombrar", sub: e.message }); }
}
async function toggleCategoryHidden(id) {
  const cat = catById(id);
  if (!cat) return;
  try {
    const updated = await window.catalogDb.updateCategory(id, { is_active: cat.is_active === false });
    Object.assign(cat, updated);
    renderCategories();
  } catch (e) { toast({ tone: "err", msg: "No se pudo actualizar", sub: e.message }); }
}
async function deleteFamily(id) {
  const cat = catById(id);
  if (!cat) return;
  const childIds = typesOf(id).map((t) => t.id);
  let count = 0;
  try { count = await window.catalogDb.getCategoryProductCount(id, childIds); } catch (_) {}
  if (count > 0) {
    await confirmModal({ title: "No se puede eliminar", body: `“${cat.name}” tiene ${count} producto(s) asignado(s). Reasignalos a otra categoría antes de eliminarla.`, confirmLabel: "Entendido" });
    return;
  }
  const ok = await confirmModal({ title: "Eliminar categoría", body: `Se eliminará “${cat.name}” y sus subcategorías. Esta acción no se puede deshacer.`, confirmLabel: "Eliminar", danger: true });
  if (!ok) return;
  try {
    for (const t of childIds) await window.catalogDb.deleteCategory(t);
    await window.catalogDb.deleteCategory(id);
    state.categories = state.categories.filter((c) => c.id !== id && !childIds.includes(c.id));
    toast({ tone: "err", msg: "Categoría eliminada", sub: cat.name });
    renderCategories();
  } catch (e) { toast({ tone: "err", msg: "No se pudo eliminar", sub: e.message }); }
}
async function deleteType(id) {
  const cat = catById(id);
  if (!cat) return;
  let count = 0;
  try { count = await window.catalogDb.getCategoryProductCount(id, []); } catch (_) {}
  if (count > 0) {
    await confirmModal({ title: "No se puede eliminar", body: `La subcategoría “${cat.name}” tiene ${count} producto(s). Reasignalos primero.`, confirmLabel: "Entendido" });
    return;
  }
  const ok = await confirmModal({ title: "Eliminar subcategoría", body: `Se eliminará la subcategoría “${cat.name}”.`, confirmLabel: "Eliminar", danger: true });
  if (!ok) return;
  try {
    await window.catalogDb.deleteCategory(id);
    state.categories = state.categories.filter((c) => c.id !== id);
    renderCategories();
  } catch (e) { toast({ tone: "err", msg: "No se pudo eliminar", sub: e.message }); }
}
