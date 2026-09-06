/* ============================================================================
   Sección Productos: barra de búsqueda + filtros (familia + estado) y la
   tabla/cards con acciones por fila.
   ============================================================================ */
import { state, families, typesOf, catById } from "../state.js?v=adm-90d40885";
import { $, esc, ico, imgTag, peso, hasOffer, isAvailable, isMissingImage, stockTone, wireImageFallbacks } from "../helpers.js?v=adm-90d40885";
import { setView } from "../view.js?v=adm-90d40885";
import { bindEditClicks } from "../shell.js?v=adm-90d40885";
import { confirmModal, toast } from "../ui.js?v=adm-90d40885";
import { reloadProducts } from "../data.js?v=adm-90d40885";
import { openProductDrawer } from "../drawers/product-drawer.js?v=adm-90d40885";

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

// Apaga/prende el producto (agotado ⇄ disponible) sin abrir el drawer de
// edición completo: es la acción de un clic para sacar algo de la vista
// pública (home + catálogo) sin tener que tocar el resto de sus datos.
const toggleButton = (p) => {
  const on = isAvailable(p);
  return `<button class="ad-icon-btn${on ? "" : " ad-icon-btn--off"}" type="button" title="${on ? "Ocultar del sitio" : "Mostrar en el sitio"}" data-toggle="${esc(p.id)}">${ico("power")}</button>`;
};

// Tabla (desktop) + cards (móvil) o estado vacío. Es lo único que se re-renderiza al teclear.
function resultsHTML(list) {
  if (list.length === 0) {
    return `<div class="ad-empty"><span class="ad-empty__icon">${ico("search")}</span><h3>Sin resultados</h3><p>No hay productos que coincidan. Prueba con otra búsqueda o toca “Limpiar”.</p></div>`;
  }
  const rows = list.map((p) => `
    <tr>
      <td><div class="ad-cell-prod">${imgTag(p.image)}<div><strong>${esc(p.name)}</strong><small>${esc(p.brand || "—")}</small></div></div></td>
      <td><small style="color:var(--pb-muted)">${esc(p.category || "—")}</small></td>
      <td>${priceCell(p)}</td>
      <td><small style="color:var(--pb-muted)">${p.flavors.length} ${p.flavors.length === 1 ? "sabor" : "sabores"}</small></td>
      <td><div style="display:flex;gap:6px;flex-wrap:wrap">${pill(p)}${p.show_on_home ? `<span class="ad-pill ad-pill--home">Inicio</span>` : ""}</div></td>
      <td><div class="ad-row-actions" data-write-only>
        <button class="ad-icon-btn" type="button" title="Editar" data-edit="${esc(p.id)}">${ico("pencil")}</button>
        ${toggleButton(p)}
        <button class="ad-icon-btn" type="button" title="Duplicar" data-dup="${esc(p.id)}">${ico("plus")}</button>
        <button class="ad-icon-btn ad-icon-btn--danger" type="button" title="Eliminar" data-del="${esc(p.id)}">${ico("trash")}</button>
      </div></td>
    </tr>`).join("");

  const cards = list.map((p) => `
    <div class="ad-prod-card">
      ${imgTag(p.image)}
      <div>
        <h3>${esc(p.name)}</h3>
        <p class="ad-meta">${esc(p.brand || "")}${p.category ? " · " + esc(p.category) : ""}</p>
        <div class="ad-card-tags">${pill(p)}${p.show_on_home ? `<span class="ad-pill ad-pill--home">Inicio</span>` : ""}<span class="ad-price" style="margin-left:auto">${hasOffer(p) ? `<s>${esc(peso(p.old_price))}</s>` : ""}${esc(peso(p.price))}</span></div>
      </div>
      <div class="ad-card-actions" data-write-only>
        <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-edit="${esc(p.id)}">Editar</button>
        ${toggleButton(p)}
        <button class="ad-icon-btn" type="button" title="Duplicar" data-dup="${esc(p.id)}">${ico("plus")}</button>
        <button class="ad-icon-btn ad-icon-btn--danger" type="button" title="Eliminar" data-del="${esc(p.id)}">${ico("trash")}</button>
      </div>
    </div>`).join("");

  return `<div class="ad-table-wrap"><table class="ad-table">
      <thead><tr>
        <th>Producto</th><th>Categoría</th><th>Precio</th><th>Sabores</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>
     <div class="ad-prod-cards">${cards}</div>`;
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
          <button class="ad-btn ad-btn--primary" type="button" data-add data-write-only>${ico("plus")}Agregar producto</button>
        </div>
        <div class="ad-filterbar__row ad-filterbar__row--chips">
          <div class="ad-toolbar__filters">
            ${STATUS_FILTERS.map(([k, label]) => `<button class="ad-chip${state.productFilter === k ? " is-active" : ""}" type="button" data-filter="${k}">${esc(label)}</button>`).join("")}
          </div>
          <div class="ad-status-select">
            <select class="ad-select" data-status-filter aria-label="Filtrar por estado">
              ${STATUS_FILTERS.map(([k, label]) => `<option value="${k}"${state.productFilter === k ? " selected" : ""}>${esc(label)}</option>`).join("")}
            </select>
          </div>
          <div class="ad-filterbar__meta">
            <button class="ad-link-btn" type="button" data-clear ${hasActiveFilters() ? "" : "hidden"}>${ico("x")}Limpiar</button>
            <span class="ad-result-count" data-count>${countLabel(list)}</span>
          </div>
        </div>
      </div>
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
    renderProducts();
    window.requestAnimationFrame(() => {
      $("#adminView")?.querySelector("[data-cat]")?._jdd?._btn?.focus({ preventScroll: true });
    });
  });
  view.querySelector("[data-sub]").addEventListener("change", (e) => {
    state.productSubcategory = e.target.value;
    renderProducts();
    window.requestAnimationFrame(() => {
      $("#adminView")?.querySelector("[data-sub]")?._jdd?._btn?.focus({ preventScroll: true });
    });
  });

  // Estado: re-render completo (no hay foco de tecleo que preservar).
  // Chips (escritorio) y select (mobile) comparten state.productFilter, así
  // que cualquiera de los dos dispara el mismo re-render.
  view.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    state.productFilter = b.getAttribute("data-filter");
    renderProducts();
  }));
  view.querySelector("[data-status-filter]")?.addEventListener("change", (e) => {
    state.productFilter = e.target.value;
    renderProducts();
  });
  view.querySelector("[data-clear]").addEventListener("click", () => {
    state.productFilter = "all"; state.productCategory = "all"; state.productSubcategory = "all"; state.search = "";
    renderProducts();
  });

  wireRowActions(view);
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

  wireRowActions(view);
}

function wireRowActions(view) {
  view.querySelectorAll("[data-dup]").forEach((b) => b.addEventListener("click", () => duplicateProduct(b.getAttribute("data-dup"))));
  view.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => deleteProductFlow(b.getAttribute("data-del"))));
  view.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => toggleAvailabilityFlow(b.getAttribute("data-toggle"))));

  bindEditClicks(view);
}

async function duplicateProduct(id) {
  const p = state.products.find((x) => String(x.id) === String(id));
  if (!p) return;
  openProductDrawer({ ...p, id: null, name: `${p.name} (copia)`, show_on_home: false, home_order: null, flavors: p.flavors.map((f) => ({ name: f.name, available: f.available })), updated_at: null }, { duplicateOf: p.name });
}

async function toggleAvailabilityFlow(id) {
  const p = state.products.find((x) => String(x.id) === String(id));
  if (!p) return;
  const next = !isAvailable(p);
  try {
    await window.catalogDb.setProductAvailability(p.id, next);
    await reloadProducts();
    toast({ tone: next ? "ok" : "err", msg: next ? "Producto visible" : "Producto oculto", sub: p.name });
    renderProducts();
  } catch (e) { toast({ tone: "err", msg: "No se pudo cambiar", sub: e.message }); }
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
