/* ============================================================================
   Sección Precios: los tres precios del catálogo en una sola tabla, con edición
   inline y guardado en lote.

   Por qué existe aparte del drawer de producto: cargar el precio revendedor de
   ~180 productos abriendo un modal de 6 secciones, uno por uno, es inviable.
   Acá se recorre el catálogo como una hoja de cálculo, se filtra por lo que
   falta y se guarda todo junto.

   Nada se envía hasta que el admin pulsa "Guardar": los cambios se acumulan en
   `pending` y solo viajan los campos que realmente tocó, para no pisar precios
   que ni miró.
   ============================================================================ */
import { state, families, typesOf, matchesCategoryFilter } from "../state.js?v=adm-ee956e57";
import { $, esc, ico, imgTag, pesoOpt, hasOffer, discountPct, isAvailable, missingInternalPrices, wireImageFallbacks } from "../helpers.js?v=adm-ee956e57";
import { setView } from "../view.js?v=adm-ee956e57";
import { confirmModal, toast } from "../ui.js?v=adm-ee956e57";
import { reloadProducts } from "../data.js?v=adm-ee956e57";
import { canWrite, canManagePricing } from "../permissions.js?v=adm-ee956e57";

/* Los tres precios, en un solo sitio: la tabla, las cards y el guardado leen de
   acá, así que sumar un cuarto precio sería tocar solo esta lista. */
const FIELDS = [
  { key: "price", label: "Venta", api: "price", internal: false },
  { key: "reseller_price", label: "Revendedor", api: "resellerPrice", internal: true },
  { key: "javy_price", label: "Javy", api: "javyPrice", internal: true },
];

const STATUS_FILTERS = [
  ["all", "Todos"],
  ["noreseller", "Sin revendedor"],
  ["nojavy", "Sin Javy"],
  ["nointernal", "Sin ninguno"],
  ["nosale", "Sin precio de venta"],
];

/* Estado local de la sección (como `selection` en products.js): no se guarda en
   state.js para no arrastrar los filtros de una sección a la otra. */
let search = "";
let statusFilter = "all";
let category = "all";
let subcategory = "all";

/* id → { campo: valorTecleado }. Solo entran los campos realmente modificados. */
const pending = new Map();
/* "id|campo" de las celdas que no pasaron la validación. */
const invalid = new Set();

const cellKey = (id, field) => `${id}|${field}`;
const pendingCount = () => [...pending.values()].reduce((n, o) => n + Object.keys(o).length, 0);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/* Valor original tal como se teclea: null → "" (sin asignar), número → texto. */
const originalValue = (p, field) => (p[field] == null ? "" : String(p[field]));

/* Lo que muestra la celda: lo tecleado si hay algo pendiente, si no lo guardado.
   Así un re-render (al buscar, al filtrar) no borra lo que se venía escribiendo. */
function currentValue(p, field) {
  const draft = pending.get(String(p.id));
  if (draft && has(draft, field)) return draft[field];
  return originalValue(p, field);
}

function setPending(id, field, raw, original) {
  const key = String(id);
  const draft = pending.get(key) || {};
  if (raw === original) delete draft[field];
  else draft[field] = raw;
  if (Object.keys(draft).length) pending.set(key, draft);
  else pending.delete(key);
}

/* ----------------------------- filtrado ----------------------------- */
function filteredProducts() {
  return state.products
    .filter((p) => {
      const missing = missingInternalPrices(p);
      const byFilter =
        statusFilter === "noreseller" ? missing.reseller :
        statusFilter === "nojavy" ? missing.javy :
        statusFilter === "nointernal" ? (missing.reseller && missing.javy) :
        statusFilter === "nosale" ? !(Number(p.price) > 0) : true;
      const byQ = !search || (`${p.name} ${p.brand || ""} ${p.category || ""}`).toLowerCase().includes(search);
      return byFilter && byQ && matchesCategoryFilter(p, category, subcategory);
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
}

const hasActiveFilters = () =>
  statusFilter !== "all" || category !== "all" || subcategory !== "all" || !!search;

const countLabel = (list) => `${list.length} ${list.length === 1 ? "producto" : "productos"}`;

/* ----------------------------- celdas ----------------------------- */
/* Un precio editable. `data-orig` viaja en el DOM para detectar cuándo el admin
   vuelve al valor de partida y sacar la celda de pendientes. */
function priceInput(p, field) {
  const value = currentValue(p, field);
  const original = originalValue(p, field);
  const dirty = value !== original;
  const bad = invalid.has(cellKey(p.id, field));
  const label = FIELDS.find((f) => f.key === field).label;
  return `<div class="ad-input-affix ad-price-cell${dirty ? " is-dirty" : ""}${bad ? " is-invalid" : ""}">
    <span class="ad-input-affix__sign">$</span>
    <input class="ad-input" type="text" inputmode="decimal" placeholder="—"
      data-price-input data-id="${esc(p.id)}" data-field="${esc(field)}"
      data-orig="${esc(original)}" value="${esc(value)}"
      aria-label="Precio ${esc(label)} de ${esc(p.name)}" />
  </div>`;
}

/* Un precio de solo lectura (Editor y Lector, para los internos). */
function priceText(p, field) {
  const empty = p[field] == null;
  return `<span class="ad-price${empty ? " ad-price-empty" : ""}">${esc(pesoOpt(p[field]))}</span>`;
}

const priceCell = (p, field, editable) => (editable ? priceInput(p, field) : priceText(p, field));

/* Contexto del precio de venta, solo lectura: la oferta se sigue editando en el
   drawer. Acá se muestra para que nadie cambie un precio sin ver que tiene una
   oferta encima. */
function statusBits(p) {
  const bits = [];
  if (hasOffer(p)) bits.push(`<span class="ad-pill ad-pill--home">Oferta -${discountPct(p)}%</span>`);
  if (!isAvailable(p)) bits.push(`<span class="ad-pill ad-pill--out">Agotado</span>`);
  return bits;
}
// En la tabla la columna existe siempre, así que un producto sin nada lleva raya.
const statusCell = (p) => statusBits(p).join(" ") || `<span class="ad-price-empty">—</span>`;
// En la card, en cambio, una raya suelta es ruido: mejor no dibujar la fila.
const statusCard = (p) => {
  const bits = statusBits(p);
  return bits.length ? `<div class="ad-price-card__status">${bits.join(" ")}</div>` : "";
};

/* ----------------------------- resultados ----------------------------- */
function resultsHTML(list, can) {
  if (!list.length) {
    return `<div class="ad-empty"><span class="ad-empty__icon">${ico("search")}</span><h3>Sin resultados</h3><p>No hay productos que coincidan. Prueba con otra búsqueda o toca “Limpiar”.</p></div>`;
  }

  const rows = list.map((p) => `
    <tr>
      <td><div class="ad-cell-prod">${imgTag(p.image)}<div><strong>${esc(p.name)}</strong><small>${esc(p.brand || "—")}</small></div></div></td>
      ${FIELDS.map((f) => `<td>${priceCell(p, f.key, f.internal ? can.internal : can.sale)}</td>`).join("")}
      <td>${statusCell(p)}</td>
    </tr>`).join("");

  const cards = list.map((p) => `
    <div class="ad-price-card">
      <div class="ad-price-card__head">
        ${imgTag(p.image)}
        <div><h3>${esc(p.name)}</h3><p class="ad-meta">${esc(p.brand || "")}${p.category ? " · " + esc(p.category) : ""}</p></div>
      </div>
      <div class="ad-price-card__grid">
        ${FIELDS.map((f) => `
          <div class="ad-price-card__field">
            <span class="ad-price-card__label">${esc(f.label)}</span>
            ${priceCell(p, f.key, f.internal ? can.internal : can.sale)}
          </div>`).join("")}
      </div>
      ${statusCard(p)}
    </div>`).join("");

  return `<div class="ad-table-wrap"><table class="ad-table ad-table--pricing">
      <thead><tr>
        <th>Producto</th>
        ${FIELDS.map((f) => `<th>${esc(f.label)}</th>`).join("")}
        <th>Estado</th>
      </tr></thead>
      <tbody>${rows}</tbody></table></div>
     <div class="ad-price-cards">${cards}</div>`;
}

/* Barra de cambios sin guardar. Mismo patrón que la de selección en Productos:
   aparece solo cuando hay algo que hacer. */
function pendingBarHTML() {
  const n = pendingCount();
  if (!n) return "";
  const prods = pending.size;
  return `<div class="ad-bulkbar ad-bulkbar--pending" role="region" aria-label="Cambios de precio sin guardar">
    <span class="ad-bulkbar__count">${n} ${n === 1 ? "precio" : "precios"} sin guardar${prods > 1 ? ` · ${prods} productos` : ""}</span>
    <button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-save-prices>${ico("save")}Guardar cambios</button>
    <button class="ad-link-btn" type="button" data-discard>${ico("x")}Descartar</button>
  </div>`;
}

/* Aviso del navegador al recargar o cerrar con cambios sin guardar. */
function beforeUnload(e) { e.preventDefault(); e.returnValue = ""; }
function syncUnloadGuard() {
  window.removeEventListener("beforeunload", beforeUnload);
  if (pendingCount()) window.addEventListener("beforeunload", beforeUnload);
}

/* ----------------------------- render ----------------------------- */
export function renderPricing() {
  const can = { sale: canWrite(), internal: canManagePricing() && state.pricingSupported };

  const cats = [{ id: "all", name: "Todas las categorías" }, ...families()];
  if (!cats.some((c) => String(c.id) === String(category))) { category = "all"; subcategory = "all"; }
  const validSubs = category === "all" ? [] : typesOf(category);
  if (subcategory !== "all" && subcategory !== "none" &&
      !validSubs.some((s) => String(s.id) === String(subcategory))) {
    subcategory = "all";
  }

  // Descarta pendientes de productos que ya no existen (borrados en otra pestaña).
  [...pending.keys()].forEach((id) => {
    if (!state.products.some((p) => String(p.id) === id)) pending.delete(id);
  });

  const list = filteredProducts();
  const catOpts = cats.map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(category) ? " selected" : ""}>${esc(o.name)}</option>`).join("");
  const subDisabled = category === "all" || validSubs.length === 0;
  const subOpts = subDisabled
    ? `<option value="all">Subcategoría</option>`
    : `<option value="all">Todas las subcategorías</option>` +
      `<option value="none"${subcategory === "none" ? " selected" : ""}>Sin subcategoría</option>` +
      validSubs.map((o) => `<option value="${esc(o.id)}"${String(o.id) === String(subcategory) ? " selected" : ""}>${esc(o.name)}</option>`).join("");

  const faltantes = state.products.reduce((n, p) => {
    const m = missingInternalPrices(p);
    return n + (m.reseller ? 1 : 0) + (m.javy ? 1 : 0);
  }, 0);

  const aviso = !state.pricingSupported
    ? `<div class="ad-notice ad-notice--warn">${ico("clock")}<div><strong>Faltan los precios internos.</strong> La tabla <code>product_pricing</code> todavía no existe: aplica <code>supabase/migrations/fase12-precios.sql</code> desde el SQL Editor de Supabase. Mientras tanto puedes editar el precio de venta.</div></div>`
    : (!canManagePricing()
      ? `<div class="ad-notice">${ico("eye")}<div>Puedes consultar los precios internos, pero solo un Admin puede modificarlos.</div></div>`
      : "");

  setView(`
    <div class="ad-panel">
      <div class="ad-section-intro">
        <div>
          <p class="ad-kicker">Precios</p>
          <p>Precio de venta, revendedor y Javy de todo el catálogo. Los dos últimos son internos: <strong>no se muestran en la tienda</strong>. Edita lo que necesites y guarda todo junto.</p>
        </div>
        ${state.pricingSupported ? `<span class="ad-counter${faltantes ? "" : " ad-counter--full"}">${faltantes ? `${faltantes} sin asignar` : "Todos asignados"}</span>` : ""}
      </div>
      ${aviso}
      <div class="ad-filterbar">
        <div class="ad-filterbar__row">
          <div class="ad-search">
            ${ico("search")}
            <input type="search" data-search placeholder="Buscar producto" aria-label="Buscar producto" value="${esc(search)}" />
          </div>
          <div class="ad-filterbar__sel"><select class="ad-select" data-cat aria-label="Filtrar por categoría">${catOpts}</select></div>
          <div class="ad-filterbar__sel"><select class="ad-select" data-sub aria-label="Filtrar por subcategoría" ${subDisabled ? "disabled" : ""}>${subOpts}</select></div>
        </div>
        <div class="ad-filterbar__row ad-filterbar__row--chips">
          <div class="ad-toolbar__filters">
            ${STATUS_FILTERS.map(([k, label]) => `<button class="ad-chip${statusFilter === k ? " is-active" : ""}" type="button" data-filter="${k}">${esc(label)}</button>`).join("")}
          </div>
          <div class="ad-filterbar__meta">
            <button class="ad-link-btn" type="button" data-clear ${hasActiveFilters() ? "" : "hidden"}>${ico("x")}Limpiar</button>
            <span class="ad-result-count" data-count>${countLabel(list)}</span>
          </div>
        </div>
      </div>
      <div data-pendingbar>${pendingBarHTML()}</div>
      <div data-results>${resultsHTML(list, can)}</div>
    </div>`);

  const view = $("#adminView");

  const searchInput = view.querySelector("[data-search]");
  searchInput.addEventListener("input", () => {
    search = searchInput.value.trim().toLowerCase();
    updateResults(view, can);
  });

  view.querySelector("[data-cat]").addEventListener("change", (e) => {
    category = e.target.value;
    subcategory = "all";
    renderPricing();
    window.requestAnimationFrame(() => {
      $("#adminView")?.querySelector("[data-cat]")?._jdd?._btn?.focus({ preventScroll: true });
    });
  });
  view.querySelector("[data-sub]").addEventListener("change", (e) => {
    subcategory = e.target.value;
    renderPricing();
    window.requestAnimationFrame(() => {
      $("#adminView")?.querySelector("[data-sub]")?._jdd?._btn?.focus({ preventScroll: true });
    });
  });

  view.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => {
    statusFilter = b.getAttribute("data-filter");
    renderPricing();
  }));
  view.querySelector("[data-clear]").addEventListener("click", () => {
    statusFilter = "all"; category = "all"; subcategory = "all"; search = "";
    renderPricing();
  });

  wireCells(view, can);
  wirePendingBar(view, can);
  syncUnloadGuard();
}

/* Re-render parcial: solo la lista, el conteo y la barra. Igual que en
   Productos, para no perder el foco mientras se teclea en el buscador. */
function updateResults(view, can) {
  const list = filteredProducts();
  const results = view.querySelector("[data-results]");
  results.innerHTML = resultsHTML(list, can);
  wireImageFallbacks(results);
  if (window.javyIcons) window.javyIcons.enhance(results);

  const count = view.querySelector("[data-count]");
  if (count) count.textContent = countLabel(list);
  const clear = view.querySelector("[data-clear]");
  if (clear) clear.hidden = !hasActiveFilters();

  refreshPendingBar(view, can);
  wireCells(view, can);
}

function refreshPendingBar(view, can) {
  const bar = view.querySelector("[data-pendingbar]");
  if (!bar) return;
  bar.innerHTML = pendingBarHTML();
  if (window.javyIcons) window.javyIcons.enhance(bar);
  wirePendingBar(view, can);
  syncUnloadGuard();
}

function wireCells(view, can) {
  view.querySelectorAll("[data-price-input]").forEach((input) => {
    input.addEventListener("input", () => {
      const id = input.getAttribute("data-id");
      const field = input.getAttribute("data-field");
      const original = input.getAttribute("data-orig");
      setPending(id, field, input.value, original);

      // La celda sale del rojo en cuanto se la vuelve a tocar.
      invalid.delete(cellKey(id, field));
      const cell = input.closest(".ad-price-cell");
      if (cell) {
        cell.classList.toggle("is-dirty", input.value !== original);
        cell.classList.remove("is-invalid");
      }
      refreshPendingBar(view, can);
    });
  });
}

function wirePendingBar(view, can) {
  const bar = view.querySelector("[data-pendingbar]");
  if (!bar) return;
  bar.querySelector("[data-save-prices]")?.addEventListener("click", () => savePending(view, can));
  bar.querySelector("[data-discard]")?.addEventListener("click", () => {
    pending.clear();
    invalid.clear();
    renderPricing();
  });
}

/* ----------------------------- guardado ----------------------------- */
/* Valida TODO antes de escribir nada: si una celda está mal, no se envía ningún
   producto. Guardar media tanda es peor que no guardar nada. */
/* Mismo criterio que en data.js: si el js/db.js que bajó el navegador es viejo
   y no trae parsePrice, se valida con una copia local en vez de reventar. */
function parsePrice(raw, label) {
  const fn = window.catalogDb && window.catalogDb.parsePrice;
  if (typeof fn === "function") return fn(raw, label);
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(n)) throw new Error(`${label} no es un número válido.`);
  if (n < 0) throw new Error(`${label} no puede ser negativo.`);
  return n;
}

function validatePending() {
  invalid.clear();
  const parse = parsePrice;
  const problems = [];

  for (const [id, draft] of pending) {
    const product = state.products.find((p) => String(p.id) === id);
    if (!product) continue;
    for (const [field, raw] of Object.entries(draft)) {
      const meta = FIELDS.find((f) => f.key === field);
      try {
        const value = parse(raw, `El precio ${meta.label.toLowerCase()}`);
        // El de venta es el que ve el cliente: no puede quedar sin asignar.
        if (field === "price" && value == null) {
          throw new Error("El precio de venta no puede quedar vacío.");
        }
      } catch (error) {
        invalid.add(cellKey(id, field));
        problems.push(`${product.name}: ${error.message}`);
      }
    }
  }
  return problems;
}

/* Avisos que NO bloquean: casi siempre son un error de tecleo, pero puede haber
   una razón. Se muestran en la confirmación y decide el admin. */
function warningsFor() {
  const num = (raw) => { try { return parsePrice(raw, "x"); } catch (_) { return null; } };
  const out = [];

  for (const [id, draft] of pending) {
    const p = state.products.find((x) => String(x.id) === id);
    if (!p) continue;
    const sale = has(draft, "price") ? num(draft.price) : Number(p.price);

    for (const f of FIELDS) {
      if (!f.internal || !has(draft, f.key)) continue;
      const v = num(draft[f.key]);
      if (v != null && sale != null && v > sale) {
        out.push(`${p.name}: el precio ${f.label.toLowerCase()} supera al de venta.`);
      }
    }
    // Subir el precio de venta hasta o por encima del anterior apaga la oferta.
    if (has(draft, "price") && hasOffer(p) && sale != null && p.old_price != null && sale >= Number(p.old_price)) {
      out.push(`${p.name}: con ese precio la oferta deja de mostrarse en la web.`);
    }
  }
  return out;
}

async function savePending(view, can) {
  const problems = validatePending();
  if (problems.length) {
    updateResults(view, can);
    toast({ tone: "err", msg: "Revisa los precios marcados", sub: problems[0] });
    return;
  }

  const total = pendingCount();
  const warnings = warningsFor();
  const ok = await confirmModal({
    title: "Guardar precios",
    body: `Se actualizarán ${total} ${total === 1 ? "precio" : "precios"} en ${pending.size} ${pending.size === 1 ? "producto" : "productos"}.` +
      (warnings.length ? ` Revisa esto antes de seguir: ${warnings.slice(0, 3).join(" ")}` : ""),
    confirmLabel: "Guardar",
  });
  if (!ok) return;

  const btn = view.querySelector("[data-save-prices]");
  if (btn) { btn.disabled = true; btn.textContent = "Guardando…"; }

  const failed = new Map();
  let saved = 0;
  let lastError = "";

  for (const [id, draft] of pending) {
    // Solo viajan los campos que el admin tocó: el resto queda como estaba.
    const payload = {};
    for (const f of FIELDS) {
      if (has(draft, f.key)) payload[f.api] = draft[f.key];
    }
    try {
      await window.catalogDb.setProductPricing(id, payload);
      saved += Object.keys(draft).length;
    } catch (error) {
      failed.set(id, draft);
      lastError = error.message || String(error);
    }
  }

  // Lo que falló sigue pendiente, para poder reintentarlo sin volver a teclear.
  pending.clear();
  failed.forEach((draft, id) => pending.set(id, draft));

  await reloadProducts();

  if (failed.size) {
    toast({ tone: "err", msg: `No se pudieron guardar ${failed.size} ${failed.size === 1 ? "producto" : "productos"}`, sub: lastError });
  } else {
    toast({ tone: "ok", msg: `${saved} ${saved === 1 ? "precio actualizado" : "precios actualizados"}` });
  }
  renderPricing();
}
