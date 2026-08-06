/* ============================================================================
   Sección Categorías: familias y tipos (jerarquía), orden, ocultar y borrar.
   ============================================================================ */
import { state, families, typesOf, catById } from "../state.js?v=adm-b0d853ee";
import { $, esc, ico } from "../helpers.js?v=adm-b0d853ee";
import { setView } from "../view.js?v=adm-b0d853ee";
import { go } from "../shell.js?v=adm-b0d853ee";
import { emptyFeature, promptModal, confirmModal, toast } from "../ui.js?v=adm-b0d853ee";

export function renderCategories() {
  if (!state.categoriesSupported) {
    setView(emptyFeature("Categorías no disponibles", "Aplicá la migración de categorías (Familia → Tipo) en Supabase para gestionarlas aquí."));
    return;
  }
  const fams = families();
  const productCountFor = (cat) => {
    const childIds = typesOf(cat.id).map((t) => t.id);
    const ids = [cat.id, ...childIds];
    return state.products.filter((p) => ids.includes(p.category_id)).length;
  };
  // Productos asignados a la familia SIN bajar a una subcategoría. Es el número
  // que explica por qué el segundo nivel no aparece en el catálogo público.
  const looseCountFor = (cat) =>
    state.products.filter((p) => String(p.category_id) === String(cat.id)).length;
  const typeCountFor = (type) =>
    state.products.filter((p) => String(p.category_id) === String(type.id)).length;

  const cards = fams.map((c, i) => {
    const subs = typesOf(c.id);
    const loose = looseCountFor(c);
    return `
    <div class="ad-cat${c.is_active === false ? " is-hidden" : ""}" data-cat="${esc(c.id)}">
      <div class="ad-cat__head">
        <div class="ad-cat__title"><strong>${esc(c.name)}</strong><small>${productCountFor(c)} productos</small></div>
        <div class="ad-cat__actions">
          <button class="ad-icon-btn" type="button" title="Subir" data-cat-move="${i}|-1" ${i === 0 ? "disabled" : ""}>${ico("arrow-up")}</button>
          <button class="ad-icon-btn" type="button" title="Bajar" data-cat-move="${i}|1" ${i === fams.length - 1 ? "disabled" : ""}>${ico("arrow-down")}</button>
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
            return `<span class="ad-type-chip${n ? "" : " is-empty"}" title="${esc(t.name)}: ${n} producto${n === 1 ? "" : "s"}">
              <button class="ad-type-chip__name" type="button" data-type-rename="${esc(t.id)}" title="Renombrar ${esc(t.name)}">${esc(t.name)}</button>
              <span class="ad-type-chip__count" aria-hidden="true">${n}</span>
              <button type="button" aria-label="Eliminar subcategoría ${esc(t.name)}" data-type-del="${esc(t.id)}">${ico("x")}</button>
            </span>`;
          }).join("")}
          ${subs.length ? "" : `<span class="ad-cat__empty">Aún sin subcategorías.</span>`}
          <button class="ad-type-chip ad-type-chip--add" type="button" data-type-add="${esc(c.id)}">${ico("plus")}Añadir</button>
        </div>
        ${loose && subs.length
          ? `<button class="ad-cat__loose" type="button" data-cat-loose="${esc(c.id)}">
               ${ico("filter")}${loose} producto${loose === 1 ? "" : "s"} sin subcategoría — repartir
             </button>`
          : ""}
      </div>
    </div>`;
  }).join("");

  setView(`
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Catálogo</p><p>Categorías del catálogo y sus subcategorías. Reordená con las flechas u ocultá una categoría sin borrar sus productos.</p></div>
      <button class="ad-btn ad-btn--primary" type="button" data-fam-add>${ico("plus")}Nueva categoría</button>
    </div>
    <div class="ad-panel">${cards || `<p class="ad-ops__empty">Todavía no hay categorías. Creá la primera.</p>`}</div>`);

  const view = $("#adminView");
  view.querySelector("[data-fam-add]").addEventListener("click", addFamily);
  view.querySelectorAll("[data-cat-move]").forEach((b) => b.addEventListener("click", () => moveFamily(b.getAttribute("data-cat-move"))));
  view.querySelectorAll("[data-cat-rename]").forEach((b) => b.addEventListener("click", () => renameCategory(b.getAttribute("data-cat-rename"))));
  view.querySelectorAll("[data-cat-hide]").forEach((b) => b.addEventListener("click", () => toggleCategoryHidden(b.getAttribute("data-cat-hide"))));
  view.querySelectorAll("[data-cat-del]").forEach((b) => b.addEventListener("click", () => deleteFamily(b.getAttribute("data-cat-del"))));
  view.querySelectorAll("[data-type-add]").forEach((b) => b.addEventListener("click", () => addType(b.getAttribute("data-type-add"))));
  view.querySelectorAll("[data-type-del]").forEach((b) => b.addEventListener("click", () => deleteType(b.getAttribute("data-type-del"))));
  view.querySelectorAll("[data-type-rename]").forEach((b) => b.addEventListener("click", () => renameCategory(b.getAttribute("data-type-rename"))));
  view.querySelectorAll("[data-cat-loose]").forEach((b) => b.addEventListener("click", () => showLooseProducts(b.getAttribute("data-cat-loose"))));
  ensureMenuListeners();
}

/* Menú "⋯" de cada categoría: delegado en document (se cablea una sola vez). */
function closeAllMenus() {
  document.querySelectorAll(".ad-menu.is-open").forEach((m) => {
    m.classList.remove("is-open");
    m.querySelector("[data-menu-toggle]")?.setAttribute("aria-expanded", "false");
    const panel = m.querySelector(".ad-menu__panel");
    if (panel) panel.hidden = true;
  });
}
let menusWired = false;
function ensureMenuListeners() {
  if (menusWired) return;
  menusWired = true;
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-menu-toggle]");
    if (toggle) {
      const menu = toggle.closest(".ad-menu");
      const willOpen = !menu.classList.contains("is-open");
      closeAllMenus();
      if (willOpen) {
        menu.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        menu.querySelector(".ad-menu__panel").hidden = false;
      }
      return;
    }
    // clic fuera del panel cierra (un clic en un ítem lo maneja su propia acción)
    if (!e.target.closest(".ad-menu__panel")) closeAllMenus();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllMenus(); });
}

/* Salta a Productos ya filtrado por los que cuelgan de esta familia sin
   subcategoría, que es donde están las herramientas para repartirlos. */
function showLooseProducts(famId) {
  state.productFilter = "nosub";
  state.productCategory = famId;
  state.productSubcategory = "all";
  state.search = "";
  go("products");
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
async function moveFamily(spec) {
  const [i, dir] = spec.split("|").map(Number);
  const fams = families();
  const j = i + dir;
  if (j < 0 || j >= fams.length) return;

  // Reordenar y NORMALIZAR todo el sort_order a 1..N (no solo intercambiar dos):
  // así se evita el no-op cuando hay valores duplicados (p. ej. varias en 100).
  const ordered = fams.slice();
  [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
  const changed = [];
  ordered.forEach((cat, idx) => {
    const newOrder = idx + 1;
    if (cat.sort_order !== newOrder) { cat.sort_order = newOrder; changed.push(cat); }
  });

  renderCategories(); // optimista: el nuevo orden se ve al instante

  try {
    await Promise.all(changed.map((cat) =>
      window.catalogDb.updateCategory(cat.id, { sort_order: cat.sort_order })));
  } catch (e) {
    toast({ tone: "err", msg: "No se pudo reordenar", sub: e.message });
    // resincronizar desde la BD para no quedar desfasados
    try { state.categories = await window.catalogDb.getAllCategories(); } catch (_) {}
    renderCategories();
  }
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
