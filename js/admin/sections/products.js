/* ============================================================================
   Sección Productos: barra de búsqueda + filtros (familia + estado) y la
   tabla/cards con acciones por fila.
   ============================================================================ */
import { state, families, typesOf, catById } from "../state.js?v=adm-b0d853ee";
import { $, esc, ico, imgTag, peso, hasOffer, isAvailable, isMissingImage, stockTone, wireImageFallbacks } from "../helpers.js?v=adm-b0d853ee";
import { setView } from "../view.js?v=adm-b0d853ee";
import { bindEditClicks } from "../shell.js?v=adm-b0d853ee";
import { confirmModal, toast } from "../ui.js?v=adm-b0d853ee";
import { reloadProducts } from "../data.js?v=adm-b0d853ee";
import { openProductDrawer } from "../drawers/product-drawer.js?v=adm-b0d853ee";

const STATUS_FILTERS = [
  ["all", "Todos"], ["home", "En inicio"], ["offers", "En oferta"], ["out", "Agotados"], ["noimg", "Sin imagen"],
  ["nosub", "Sin subcategoría"], ["nocat", "Sin categoría"],
];

// Filtro por categoría (familia) y, si hay, subcategoría (tipo) exacta.
// "none" = colgado de la familia sin bajar a una subcategoría.
function matchesCategory(p) {
  const c = state.productCategory, s = state.productSubcategory;
  if (c === "all") return true;
  const cat = catById(p.category_id);
  if (!cat) return false;
  const inCat = cat.id === c || cat.parent_id === c;
  if (!inCat) return false;
  if (s === "all") return true;
  if (s === "none") return String(p.category_id) === String(c);
  return String(p.category_id) === String(s);
}

// Producto asignado a una familia sin bajar a una subcategoría. Es el estado
// que vacía el segundo nivel del catálogo público.
function isLooseInFamily(p) {
  const cat = catById(p.category_id);
  return Boolean(cat && !cat.parent_id && typesOf(cat.id).length > 0);
}

function filteredProducts() {
  const f = state.productFilter;
  const q = state.search;
  return state.products.filter((p) => {
    const byFilter =
      f === "home" ? p.show_on_home :
      f === "offers" ? hasOffer(p) :
      f === "out" ? !isAvailable(p) :
      f === "noimg" ? isMissingImage(p) :
      f === "nosub" ? isLooseInFamily(p) :
      f === "nocat" ? !p.category_id : true;
    const byQ = !q || (`${p.name} ${p.brand || ""} ${p.category || ""}`).toLowerCase().includes(q);
    return byFilter && byQ && matchesCategory(p);
  });
}

const hasActiveFilters = () =>
  state.productFilter !== "all" || state.productCategory !== "all" ||
  state.productSubcategory !== "all" || !!state.search;

const countLabel = (list) => `${list.length} ${list.length === 1 ? "producto" : "productos"}`;

const pill = (p) => { const [tone, label] = stockTone(p); return `<span class="ad-pill ad-pill--${tone}">${label}</span>`; };
const priceCell = (p) => `<span class="ad-price">${hasOffer(p) ? `<s>${esc(peso(p.old_price))}</s>` : ""}${esc(peso(p.price))}</span>`;

/* Selección múltiple para mover productos de categoría en lote. Sin esto,
   repartir los productos que cuelgan de una familia exige abrir un formulario
   por producto. Se guarda por id y se limpia al cambiar de filtro. */
const selection = new Set();

const selectedProducts = () => state.products.filter((p) => selection.has(String(p.id)));

function checkboxCell(p) {
  const on = selection.has(String(p.id));
  return `<label class="ad-check" title="Seleccionar">
    <input type="checkbox" data-sel="${esc(p.id)}"${on ? " checked" : ""} aria-label="Seleccionar ${esc(p.name)}" />
  </label>`;
}

// Tabla (desktop) + cards (móvil) o estado vacío. Es lo único que se re-renderiza al teclear.
function resultsHTML(list) {
  if (list.length === 0) {
    return `<div class="ad-empty"><span class="ad-empty__icon">${ico("search")}</span><h3>Sin resultados</h3><p>No hay productos que coincidan. Probá con otra búsqueda o tocá “Limpiar”.</p></div>`;
  }
  const rows = list.map((p) => `
    <tr${selection.has(String(p.id)) ? ' class="is-selected"' : ""}>
      <td>${checkboxCell(p)}</td>
      <td><div class="ad-cell-prod">${imgTag(p.image)}<div><strong>${esc(p.name)}</strong><small>${esc(p.brand || "—")}</small></div></div></td>
      <td><small style="color:var(--pb-muted)">${esc(p.category || "—")}</small></td>
      <td>${priceCell(p)}</td>
      <td><small style="color:var(--pb-muted)">${p.flavors.length} ${p.flavors.length === 1 ? "sabor" : "sabores"}</small></td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap">${pill(p)}${p.show_on_home ? `<span class="ad-pill ad-pill--home">Inicio</span>` : ""}</div></td>
      <td><div class="ad-row-actions">
        <button class="ad-icon-btn" type="button" title="Editar" data-edit="${esc(p.id)}">${ico("pencil")}</button>
        <button class="ad-icon-btn" type="button" title="Duplicar" data-dup="${esc(p.id)}">${ico("plus")}</button>
        <button class="ad-icon-btn ad-icon-btn--danger" type="button" title="Eliminar" data-del="${esc(p.id)}">${ico("trash")}</button>
      </div></td>
    </tr>`).join("");

  const cards = list.map((p) => `
    <div class="ad-prod-card${selection.has(String(p.id)) ? " is-selected" : ""}">
      ${checkboxCell(p)}
      ${imgTag(p.image)}
      <div>
        <h3>${esc(p.name)}</h3>
        <p class="ad-meta">${esc(p.brand || "")}${p.category ? " · " + esc(p.category) : ""}</p>
        <div class="ad-card-tags">${pill(p)}${p.show_on_home ? `<span class="ad-pill ad-pill--home">Inicio</span>` : ""}<span class="ad-price" style="margin-left:auto">${hasOffer(p) ? `<s>${esc(peso(p.old_price))}</s>` : ""}${esc(peso(p.price))}</span></div>
      </div>
      <div class="ad-card-actions">
        <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-edit="${esc(p.id)}">Editar</button>
        <button class="ad-icon-btn" type="button" title="Duplicar" data-dup="${esc(p.id)}">${ico("plus")}</button>
        <button class="ad-icon-btn ad-icon-btn--danger" type="button" title="Eliminar" data-del="${esc(p.id)}">${ico("trash")}</button>
      </div>
    </div>`).join("");

  const allOn = list.length > 0 && list.every((p) => selection.has(String(p.id)));
  return `<div class="ad-table-wrap"><table class="ad-table">
      <thead><tr>
        <th><label class="ad-check" title="Seleccionar todo"><input type="checkbox" data-sel-all${allOn ? " checked" : ""} aria-label="Seleccionar todos los resultados" /></label></th>
        <th>Producto</th><th>Categoría</th><th>Precio</th><th>Sabores</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
     <div class="ad-prod-cards">${cards}</div>`;
}

/* Barra contextual: aparece solo con algo seleccionado, para no ocupar espacio
   permanente ni competir con los filtros. */
function bulkBarHTML() {
  const n = selection.size;
  if (!n) return "";
  const options = families().flatMap((f) => [
    `<option value="${esc(f.id)}">${esc(f.name)}</option>`,
    ...typesOf(f.id).map((t) => `<option value="${esc(t.id)}">&nbsp;&nbsp;└ ${esc(t.name)}</option>`),
  ]).join("");

  return `<div class="ad-bulkbar" role="region" aria-label="Acciones sobre la selección">
    <span class="ad-bulkbar__count">${n} seleccionado${n === 1 ? "" : "s"}</span>
    <select class="ad-select ad-bulkbar__select" data-bulk-target aria-label="Categoría destino">
      <option value="">Mover a…</option>
      ${options}
    </select>
    <button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-bulk-apply disabled>Mover</button>
    <button class="ad-link-btn" type="button" data-bulk-clear>${ico("x")}Quitar selección</button>
  </div>`;
}

export function renderProducts() {

  const cats = [{ id: "all", name: "Todas las categorías" }, ...families()];
  if (!cats.some((cat) => String(cat.id) === String(state.productCategory))) {
    state.productCategory = "all";
    state.productSubcategory = "all";
  }
  const catSel = state.productCategory;
  const validSubs = catSel === "all" ? [] : typesOf(catSel);
  if (state.productSubcategory !== "all" && state.productSubcategory !== "none" &&
      !validSubs.some((sub) => String(sub.id) === String(state.productSubcategory))) {
    state.productSubcategory = "all";
  }

  // Descarta de la selección lo que ya no exista en el catálogo (borrados desde
  // otra pestaña, recargas): mover un id fantasma fallaría en silencio.
  selection.forEach((id) => {
    if (!state.products.some((p) => String(p.id) === id)) selection.delete(id);
  });
  const list = filteredProducts();
  const catOpts = cats.map((o) => `<option value="${esc(o.id)}"${o.id === catSel ? " selected" : ""}>${esc(o.name)}</option>`).join("");

  const subs = validSubs;
  const subDisabled = catSel === "all" || subs.length === 0;
  const subSel = state.productSubcategory;
  const subOpts = subDisabled
    ? `<option value="all">Subcategoría</option>`
    : `<option value="all">Todas las subcategorías</option>` +
      `<option value="none"${subSel === "none" ? " selected" : ""}>Sin subcategoría</option>` +
      subs.map((o) => `<option value="${esc(o.id)}"${o.id === subSel ? " selected" : ""}>${esc(o.name)}</option>`).join("");

  setView(`
    <div class="ad-panel">
      <div class="ad-filterbar">
        <div class="ad-filterbar__row">
          <div class="ad-search">
            ${ico("search")}
            <input type="search" data-search placeholder="Buscar producto" aria-label="Buscar producto" value="${esc(state.search)}" />
          </div>
          <div class="ad-filterbar__sel"><select class="ad-select" data-cat aria-label="Filtrar por categoría">${catOpts}</select></div>
          <div class="ad-filterbar__sel"><select class="ad-select" data-sub aria-label="Filtrar por subcategoría" ${subDisabled ? "disabled" : ""}>${subOpts}</select></div>
          <button class="ad-btn ad-btn--primary" type="button" data-add>${ico("plus")}Agregar producto</button>
        </div>
        <div class="ad-filterbar__row ad-filterbar__row--chips">
          <div class="ad-toolbar__filters">
            ${STATUS_FILTERS.map(([k, label]) => `<button class="ad-chip${state.productFilter === k ? " is-active" : ""}" type="button" data-filter="${k}">${esc(label)}</button>`).join("")}
          </div>
          <div class="ad-filterbar__meta">
            <button class="ad-link-btn" type="button" data-clear ${hasActiveFilters() ? "" : "hidden"}>${ico("x")}Limpiar</button>
            <span class="ad-result-count" data-count>${countLabel(list)}</span>
          </div>
        </div>
      </div>
      <div data-bulkbar>${bulkBarHTML()}</div>
      <div data-results>${resultsHTML(list)}</div>
    </div>`);

  const view = $("#adminView");

  // Búsqueda: actualización PARCIAL (solo resultados) para no perder el foco al teclear.
  const searchInput = view.querySelector("[data-search]");
  searchInput.addEventListener("input", () => {
    state.search = searchInput.value.trim().toLowerCase();
    updateResults(view);
  });

  // Alta de producto desde la propia sección.
  view.querySelector("[data-add]").addEventListener("click", () => openProductDrawer(null));

  // Categoría → Subcategoría en cascada (setView ya embelleció los <select>).
  view.querySelector("[data-cat]").addEventListener("change", (e) => {
    state.productCategory = e.target.value;
    state.productSubcategory = "all"; // al cambiar categoría se resetea la subcategoría
    // Cambiar de filtro cambia lo que está a la vista: conservar la selección
    // dejaría marcado lo que ya no se ve, y mover a ciegas es difícil de deshacer.
    selection.clear();
    renderProducts();
    window.requestAnimationFrame(() => {
      $("#adminView")?.querySelector("[data-cat]")?._jdd?._btn?.focus({ preventScroll: true });
    });
  });
  view.querySelector("[data-sub]").addEventListener("change", (e) => {
    state.productSubcategory = e.target.value;
    selection.clear();
    renderProducts();
    window.requestAnimationFrame(() => {
      $("#adminView")?.querySelector("[data-sub]")?._jdd?._btn?.focus({ preventScroll: true });
    });
  });

  // Estado: re-render completo (no hay foco de tecleo que preservar).
  view.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    state.productFilter = b.getAttribute("data-filter");
    selection.clear();
    renderProducts();
  }));
  view.querySelector("[data-clear]").addEventListener("click", () => {
    state.productFilter = "all"; state.productCategory = "all"; state.productSubcategory = "all"; state.search = "";
    selection.clear();
    renderProducts();
  });

  wireRowActions(view);
  wireBulkBar(view);
}

// Re-renderiza solo la lista de resultados + conteo + visibilidad de "Limpiar".
function updateResults(view) {
  const list = filteredProducts();
  const results = view.querySelector("[data-results]");
  results.innerHTML = resultsHTML(list);
  wireImageFallbacks(results);
  if (window.javyIcons) window.javyIcons.enhance(results);
  const count = view.querySelector("[data-count]");
  if (count) count.textContent = countLabel(list);
  const clear = view.querySelector("[data-clear]");
  if (clear) clear.hidden = !hasActiveFilters();

  const bulkbar = view.querySelector("[data-bulkbar]");
  if (bulkbar) {
    bulkbar.innerHTML = bulkBarHTML();
    if (window.javyIcons) window.javyIcons.enhance(bulkbar);
    wireBulkBar(view);
  }
  wireRowActions(view);
}

function wireRowActions(view) {
  view.querySelectorAll("[data-dup]").forEach((b) => b.addEventListener("click", () => duplicateProduct(b.getAttribute("data-dup"))));
  view.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteProductFlow(b.getAttribute("data-del"))));

  view.querySelectorAll("[data-sel]").forEach((box) => box.addEventListener("change", () => {
    const id = String(box.getAttribute("data-sel"));
    if (box.checked) selection.add(id); else selection.delete(id);
    updateResults(view);
  }));
  view.querySelector("[data-sel-all]")?.addEventListener("change", (e) => {
    const list = filteredProducts();
    // "Todo" opera solo sobre lo que el filtro actual muestra, nunca sobre el
    // catálogo entero: seleccionar a ciegas lo que no se ve invita a errores.
    list.forEach((p) => (e.target.checked ? selection.add(String(p.id)) : selection.delete(String(p.id))));
    updateResults(view);
  });

  bindEditClicks(view);
}

function wireBulkBar(view) {
  const bar = view.querySelector("[data-bulkbar]");
  if (!bar) return;
  const select = bar.querySelector("[data-bulk-target]");
  const apply = bar.querySelector("[data-bulk-apply]");

  select?.addEventListener("change", () => { if (apply) apply.disabled = !select.value; });
  apply?.addEventListener("click", () => moveSelectedTo(select.value));
  bar.querySelector("[data-bulk-clear]")?.addEventListener("click", () => {
    selection.clear();
    renderProducts();
  });
}

/* Mueve la selección a una categoría. Confirma primero (afecta al catálogo
   público) y recarga desde la BD para no quedar con datos desfasados. */
async function moveSelectedTo(categoryId) {
  const target = catById(categoryId);
  const items = selectedProducts();
  if (!target || !items.length) return;

  const parent = target.parent_id ? catById(target.parent_id) : null;
  const label = parent ? `${parent.name} › ${target.name}` : target.name;
  const ok = await confirmModal({
    title: "Mover de categoría",
    body: `Se moverán ${items.length} producto${items.length === 1 ? "" : "s"} a “${label}”. Se refleja en el catálogo público.`,
    confirmLabel: "Mover",
  });
  if (!ok) return;

  try {
    await window.catalogDb.updateProductsCategory(items.map((p) => p.id), categoryId);
    await reloadProducts();
    selection.clear();
    toast({ tone: "ok", msg: `${items.length} producto${items.length === 1 ? "" : "s"} movido${items.length === 1 ? "" : "s"}`, sub: label });
    renderProducts();
  } catch (e) {
    toast({ tone: "err", msg: "No se pudo mover", sub: e.message });
  }
}

async function duplicateProduct(id) {
  const p = state.products.find((x) => String(x.id) === String(id));
  if (!p) return;
  openProductDrawer({ ...p, id: null, name: `${p.name} (copia)`, show_on_home: false, home_order: null, flavors: p.flavors.map((f) => ({ name: f.name, available: f.available })), updated_at: null }, { duplicateOf: p.name });
}

async function deleteProductFlow(id) {
  const p = state.products.find((x) => String(x.id) === String(id));
  if (!p) return;
  const ok = await confirmModal({ title: "Eliminar producto", body: `Se eliminará “${p.name}” de forma permanente. Esta acción no se puede deshacer.`, confirmLabel: "Eliminar", danger: true });
  if (!ok) return;
  try {
    await window.catalogDb.deleteProduct(p.id);
    await reloadProducts();
    toast({ tone: "err", msg: "Producto eliminado", sub: p.name });
    renderProducts();
  } catch (e) { toast({ tone: "err", msg: "No se pudo eliminar", sub: e.message }); }
}
