let products = [];
let categories = [];

const catalogState = {
  query: "",
  category: "todos",
  family: "todos",
  type: "todos",
  // Facetas multi-selección: arrays de slugs (OR dentro de la faceta).
  goals: [],
  brands: [],
  sizes: [],
  price: "", // precio queda single-select (rango)
  available: false,
  sort: "recomendados",
};

// Rangos de precio del filtro (productos sin precio quedan fuera al filtrar).
const PRICE_RANGES = [
  { value: "0-25", label: "Hasta $25", min: 0, max: 25 },
  { value: "25-50", label: "$25 a $50", min: 25, max: 50 },
  { value: "50+", label: "Más de $50", min: 50, max: Infinity },
];

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
const supplementsList = document.getElementById("supplementsList");
const catalogCount = document.getElementById("catalogCount");
const catalogEmpty = document.getElementById("catalogEmpty");
const emptyAdvisorBtn = document.getElementById("emptyAdvisorBtn");
const catalogFilters = document.getElementById("catalogFilters");
const catalogSubFilters = document.getElementById("catalogSubFilters");
const catalogSidebar = document.getElementById("catalogSidebar");
const catalogSidebarBody = document.getElementById("catalogSidebarBody");
const catalogSidebarClear = document.getElementById("catalogSidebarClear");
const catalogToolsHint = document.querySelector(".catalog-tools__hint");
const catalogSort = document.getElementById("catalogSort");
const catalogFloatingQuote = document.getElementById("catalogFloatingQuote");
const catalogScrollTop = document.getElementById("catalogScrollTop");
const catalogActiveFilters = document.getElementById("catalogActiveFilters");
const catalogOfflineNote = document.getElementById("catalogOfflineNote");
const catalogMore = document.getElementById("catalogMore");
const catalogMoreBtn = document.getElementById("catalogMoreBtn");
const emptyResetBtn = document.getElementById("emptyResetBtn");
const emptyRelaxBtn = document.getElementById("emptyRelaxBtn");
const catalogFiltersBtn = document.getElementById("catalogFiltersBtn");
const catalogResultsBar = document.querySelector(".catalog-results__bar");
let lastCatalogScrollY = window.scrollY || 0;
let scrollTopIsVisible = false;

// URLs de producción (Cloudflare) para SEO/JSON-LD, nunca el preview de Vercel
const SITE_BASE = "https://javysuplementos.com/";

function debounce(fn, wait = 160) {
  let timer = null;
  return (...args) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

function toAbsoluteUrl(path) {
  if (!path) return `${SITE_BASE}img/images/javi.webp`;
  if (/^https?:\/\//i.test(path)) return path;
  return SITE_BASE + String(path).replace(/^\/+/, "");
}

function normalizeText(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value = "") {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getProductCategory(product) {
  return slugify(product.category || product.categoria || "otros");
}

// Hay jerarquía utilizable sólo si la migración ya corrió (hay tipos y productos con category_id).
function useHierarchy() {
  return categories.some((c) => c.parent_id) && products.some((p) => p.category_id);
}
function pubFamilies() {
  return categories.filter((c) => !c.parent_id);
}
function pubTypesOf(familyId) {
  return categories.filter((c) => c.parent_id === familyId);
}
function pubCategoryById(id) {
  return id ? categories.find((c) => c.id === id) : null;
}
function productInFamily(product, familyId) {
  const cat = pubCategoryById(product.category_id);
  return Boolean(cat && (cat.id === familyId || cat.parent_id === familyId));
}

/* --- Slugs de categoría en la URL -------------------------------------------
   Los filtros viajan como ?fam=proteinas&tipo=whey en vez de con el UUID: así
   el enlace se puede compartir, indexar y leer. Réplica de
   `categoryFilterSlug()` en scripts/lib/product-slug.mjs (la columna `slug` de
   Supabase arrastra prefijos internos "fam-"/"tipo-"). Si cambia allá, acá
   también. */
function catFilterSlug(category) {
  return String(category?.slug || "").replace(/^(fam|tipo)-/, "") || slugify(category?.name || "");
}

// Valor a escribir en la URL para una familia o tipo ya elegido.
function categoryParamValue(id) {
  if (id === "todos" || id === "destacados") return id;
  const cat = pubCategoryById(id);
  return cat ? catFilterSlug(cat) : id;
}

// Inverso: acepta el slug público (proteinas), el slug crudo de Supabase
// (fam-proteinas) y el UUID que usaban los enlaces anteriores.
function categoryIdFromParam(value, isFamily) {
  if (!value || value === "todos" || value === "destacados") return value || "todos";
  const pool = categories.filter((c) => (isFamily ? !c.parent_id : Boolean(c.parent_id)));
  const match = pool.find((c) => String(c.id) === value)
    || pool.find((c) => catFilterSlug(c) === value)
    || pool.find((c) => String(c.slug) === value);
  return match ? match.id : "todos";
}

function productMatchesCategory(product) {
  if (useHierarchy()) {
    const fam = catalogState.family;
    if (fam === "destacados") return Boolean(product.featured || product.destacado);
    if (fam !== "todos") {
      if (!productInFamily(product, fam)) return false;
      if (catalogState.type !== "todos" && product.category_id !== catalogState.type) return false;
    }
    return true;
  }

  // Fallback plano (antes de aplicar la migración).
  if (catalogState.category === "todos") return true;
  if (catalogState.category === "destacados") return Boolean(product.featured || product.destacado);
  return getProductCategory(product) === catalogState.category;
}

// Multi-selección: sin selección pasa todo; con selección, match si el producto
// tiene AL MENOS uno de los valores elegidos (OR dentro de la faceta).
function productMatchesGoal(product) {
  if (!catalogState.goals.length) return true;
  const goals = (product.goals || product.objetivos || []).map((g) => slugify(g));
  return catalogState.goals.some((sel) => goals.includes(sel));
}

function productMatchesBrand(product) {
  if (!catalogState.brands.length) return true;
  return catalogState.brands.includes(slugify(product.brand || ""));
}

function productMatchesSize(product) {
  if (!catalogState.sizes.length) return true;
  return catalogState.sizes.includes(slugify(product.presentation || ""));
}

function productMatchesPrice(product) {
  if (!catalogState.price) return true;
  const range = PRICE_RANGES.find((r) => r.value === catalogState.price);
  if (!range) return true;
  const price = Number(product.price ?? product.precio ?? 0);
  if (price <= 0) return false; // "Consultar": sin precio conocido, no entra en rangos
  return price >= range.min && price < range.max;
}

function productMatchesAvailable(product) {
  return !catalogState.available || productCanBeQuoted(product);
}

function productMatchesQuery(product, query) {
  return !query || getSearchText(product).includes(query);
}

// Núcleo del filtrado facetado: aplica todas las dimensiones menos las de
// `skipKeys`. Excluir una dimensión permite calcular contadores "reactivos"
// (cuántos resultados daría cada opción de esa dimensión con el resto activo).
function getResultsExcluding(...skipKeys) {
  const skip = new Set(skipKeys);
  const query = normalizeText(catalogState.query.trim());

  return products.filter((product) =>
    (skip.has("category") || productMatchesCategory(product))
    && (skip.has("goals") || productMatchesGoal(product))
    && (skip.has("brands") || productMatchesBrand(product))
    && (skip.has("sizes") || productMatchesSize(product))
    && (skip.has("price") || productMatchesPrice(product))
    && (skip.has("available") || productMatchesAvailable(product))
    && (skip.has("query") || productMatchesQuery(product, query)));
}

function getFlavorNames(product, availableOnly = false) {
  return (product.flavors || [])
    .filter((flavor) => !availableOnly || flavor.available !== false)
    .map((flavor) => flavor.name);
}

/* Términos con los que el cliente busca cada familia, más allá de su nombre
   exacto. Sin esto la búsqueda solo indexaba la hoja ("Whey", "ISO"), así que
   "proteína" devolvía 14 de los 27 productos de Proteínas. La clave es el slug
   público de la familia (ver catFilterSlug). */
const FAMILY_SEARCH_TERMS = {
  "proteinas": "proteina proteinas protein whey iso aislada aislado suero caseina casein vegana",
  "ganadores": "ganador ganadores gainer mass subir peso masa volumen",
  "creatina": "creatina creatinas monohidrato monohydrate",
  "pre-entrenos": "pre entreno preentreno pre-workout preworkout energia pump",
  "aminoacidos": "aminoacido aminoacidos amino bcaa eaa glutamina",
  "quemadores": "quemador quemadores fat burner termogenico definicion adelgazar bajar grasa",
  "energia": "energia energizante cafeina bebida carbohidrato",
  "potenciadores": "potenciador potenciadores testosterona booster hormonal",
  "salud": "salud bienestar vitamina vitaminas mineral minerales omega multivitaminico suplemento",
};

// El texto es estable mientras no se recarguen productos/categorías, y los
// contadores reactivos re-filtran el catálogo entero varias veces por render:
// sin caché cada tecleo repetiría miles de búsquedas en la jerarquía.
const searchTextCache = new Map();

// Texto indexado de un producto: incluye su familia y su subcategoría, no solo
// la hoja, para que buscar el nombre de la familia traiga todo lo que cuelga
// de ella.
function getSearchText(product) {
  const cached = searchTextCache.get(product.id);
  if (cached !== undefined) return cached;

  const own = pubCategoryById(product.category_id);
  const family = own?.parent_id ? pubCategoryById(own.parent_id) : own;

  const text = normalizeText([
    product.id,
    product.legacy_id,
    product.name,
    product.brand,
    product.category,
    own?.name,
    family?.name,
    family ? FAMILY_SEARCH_TERMS[catFilterSlug(family)] : "",
    product.presentation,
    product.tags?.join(" "),
    product.goals?.join(" "),
    getFlavorNames(product).join(" "),
  ].join(" "));

  searchTextCache.set(product.id, text);
  return text;
}

function getFilteredProducts() {
  return sortProducts(getResultsExcluding());
}

function sortProducts(list) {
  const sorted = [...list];
  const price = (p) => Number(p.price ?? p.precio ?? 0);

  switch (catalogState.sort) {
    case "precio-asc":
      return sorted.sort((a, b) => price(a) - price(b));
    case "precio-desc":
      return sorted.sort((a, b) => price(b) - price(a));
    case "nombre":
      return sorted.sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
    case "ofertas":
      // Mayor descuento primero; sin oferta al final manteniendo su orden (sort estable)
      return sorted.sort((a, b) => discountPercent(b) - discountPercent(a));
    case "novedades":
      // Los productos ya vienen ordenados por created_at desc desde la BD
      return sorted;
    case "recomendados":
    default:
      // Destacados primero, luego disponibles antes que agotados; orden original
      // dentro de cada grupo (sort estable).
      return sorted.sort((a, b) => {
        const fa = a.featured || a.destacado ? 1 : 0;
        const fb = b.featured || b.destacado ? 1 : 0;
        if (fb !== fa) return fb - fa;
        const va = productCanBeQuoted(a) ? 1 : 0;
        const vb = productCanBeQuoted(b) ? 1 : 0;
        return vb - va;
      });
  }
}

function formatPrice(price) {
  const value = Number(price || 0);
  return value > 0 ? value.toFixed(2) : "Consultar";
}

function hasOffer(product) {
  const price = Number(product?.price || 0);
  const oldPrice = Number(product?.old_price || 0);
  return price > 0 && oldPrice > price;
}

function discountPercent(product) {
  if (!hasOffer(product)) return 0;
  return Math.round((1 - Number(product.price) / Number(product.old_price)) * 100);
}

function escapeHTML(value = "") {
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function productCanBeQuoted(product) {
  if (product.available === false) return false;
  if (!product.flavors?.length) return true;

  return product.flavors.some((flavor) => flavor.available !== false);
}

function isNoFlavorProduct(product) {
  return product?.flavor_mode === "no_flavor";
}

function setAddButtonState(button, added) {
  if (!button) return;
  button.classList.toggle("is-added", added);
  button.textContent = added ? "✓ En cotización" : "Agregar a cotización";
}

// Sincroniza la card con el estado real de la cotización: botón según el sabor
// seleccionado, nota con los sabores ya agregados y ✓ en la lista de sabores.
function syncAddButton(card, product) {
  const button = card.querySelector(".product-card__btn--buy");
  if (!button) return;

  // La card ya no tiene selector de sabor: marca "en cotización" si hay CUALQUIER
  // variante de este producto agregada (con o sin sabor).
  const inQuote = (window.consultation?.getAddedFlavors?.(product.id)?.length || 0) > 0
    || !!window.consultation?.hasItem?.(product.id, "");
  setAddButtonState(button, inQuote);

  // Nota: "En tu cotización: Chocolate, Vainilla"
  const note = card.querySelector("[data-added-note]");
  if (note) {
    const added = window.consultation?.getAddedFlavors?.(product.id) || [];
    if (added.length) {
      note.textContent = `En tu cotización: ${added.join(", ")}`;
      note.hidden = false;
    } else {
      note.textContent = "";
      note.hidden = true;
    }
  }

  // ✓ en los sabores ya agregados.
  const select = card.querySelector("[data-flavor-select]");
  if (select && product.flavors?.length) {
    Array.from(select.options).forEach((opt) => {
      if (!opt.value) return; // placeholder
      const f = product.flavors.find((item) => item.id === opt.value);
      if (!f) return;
      const unavailable = f.available === false ? " — No disponible" : "";
      const inCart = window.consultation?.hasItem?.(product.id, f.name) ? " ✓" : "";
      opt.textContent = `${f.name}${unavailable}${inCart}`;
    });
    window.javyDropdown?.refresh?.(select);
  }
}

function syncAllAddButtons() {
  document.querySelectorAll(".product-card").forEach((card) => {
    if (card._javyProduct) syncAddButton(card, card._javyProduct);
  });
}

let consultationSyncBound = false;
function bindConsultationSync() {
  if (consultationSyncBound) return;
  consultationSyncBound = true;
  // Un único listener por página evita fugas al re-filtrar el catálogo.
  document.addEventListener("consultation:change", () => {
    syncAllAddButtons();
    updateFloatingQuoteVisibility(); // cubre el alta desde el modal
  });
}

function getCategoryFilters() {
  // Contadores reactivos: cuentan sobre el resultado de los DEMÁS filtros
  // (búsqueda, facetas), no sobre el catálogo entero, para no prometer
  // resultados que la combinación actual no puede dar.
  const baseline = getResultsExcluding("category");

  const categories = products
    .map((product) => product.category)
    .filter(Boolean)
    .filter((category, index, list) => list.indexOf(category) === index)
    .sort((a, b) => a.localeCompare(b, "es"));

  const featuredCount = baseline.filter((p) => p.featured || p.destacado).length;

  return [
    { label: "Todos", value: "todos", count: baseline.length },
    { label: "Destacados", value: "destacados", count: featuredCount },
    ...categories.map((category) => ({
      label: category,
      value: slugify(category),
      count: baseline.filter((p) => getProductCategory(p) === slugify(category)).length,
    })),
  ]
    // Ocultar chips que darían 0, pero nunca el activo (para poder deseleccionarlo)
    .filter((filter) => filter.value === "todos" || filter.count > 0 || filter.value === catalogState.category);
}

function uniqueSorted(list) {
  return [...new Set(list.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function filterChip({ value, label, count, attr = "data-category", active, extraClass = "" }) {
  return `
    <button class="catalog-filter${extraClass}${active ? " is-active" : ""}" type="button" ${attr}="${escapeHTML(value)}" aria-pressed="${active}">
      ${escapeHTML(label)}<span class="catalog-filter__count">${count}</span>
    </button>`;
}

function renderFlatFilters() {
  catalogFilters.innerHTML = getCategoryFilters()
    .map((f) => filterChip({ value: f.value, label: f.label, count: f.count, active: f.value === catalogState.category }))
    .join("");
  if (catalogSubFilters) catalogSubFilters.hidden = true;
}

// Datos de familias/tipos con contadores reactivos (compartidos por los chips
// móviles y la lista del sidebar de escritorio).
function getFamilyItems() {
  const baseline = getResultsExcluding("category");
  const featuredCount = baseline.filter((p) => p.featured || p.destacado).length;
  const families = pubFamilies()
    .map((f) => ({ value: f.id, label: f.name, count: baseline.filter((p) => productInFamily(p, f.id)).length }))
    .filter((f) => f.count > 0 || f.value === catalogState.family)
    .sort((a, b) => a.label.localeCompare(b.label, "es"));

  return [
    { value: "todos", label: "Todos", count: baseline.length },
    ...(featuredCount || catalogState.family === "destacados"
      ? [{ value: "destacados", label: "Destacados", count: featuredCount }]
      : []),
    ...families,
  ];
}

function getTypeItems(fam) {
  if (fam === "todos" || fam === "destacados") return [];
  // Baseline: todo menos la dimensión categoría, acotado a la familia elegida.
  const familyBaseline = getResultsExcluding("category").filter((p) => productInFamily(p, fam));
  const types = pubTypesOf(fam)
    .map((t) => ({ value: t.id, label: t.name, count: familyBaseline.filter((p) => p.category_id === t.id).length }))
    .filter((t) => t.count > 0 || t.value === catalogState.type);

  if (!types.length) return [];
  return [{ value: "todos", label: "Todos", count: familyBaseline.length }, ...types];
}

function renderFamilyFilters() {
  catalogFilters.innerHTML = getFamilyItems()
    .map((f) => filterChip({ value: f.value, label: f.label, count: f.count, attr: "data-family", active: f.value === catalogState.family }))
    .join("");
  revealActiveChip(catalogFilters);
}

// El carrusel deja las últimas familias fuera de pantalla: si la activa quedó
// oculta (al llegar desde un enlace con ?fam=), centrarla para que el usuario
// vea dónde está parado en vez de un carrusel aparentemente sin selección.
function revealActiveChip(container) {
  const active = container?.querySelector(".catalog-filter.is-active");
  if (!active || container.scrollWidth <= container.clientWidth + 4) return;

  const chipCenter = active.offsetLeft + active.offsetWidth / 2;
  const target = Math.max(0, chipCenter - container.clientWidth / 2);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  container.scrollTo({ left: target, behavior: reduceMotion ? "auto" : "smooth" });
}

function renderTypeFilters() {
  if (!catalogSubFilters) return;
  const items = getTypeItems(catalogState.family);
  if (!items.length) {
    catalogSubFilters.hidden = true;
    catalogSubFilters.innerHTML = "";
    return;
  }
  catalogSubFilters.hidden = false;
  catalogSubFilters.innerHTML = items
    .map((t) => filterChip({ value: t.value, label: t.label, count: t.count, attr: "data-type", active: t.value === catalogState.type, extraClass: " catalog-filter--type" }))
    .join("");
}

// Valores que aporta cada producto a cada faceta.
const FACET_DEFS = {
  goals: { title: "Objetivo", values: (p) => p.goals || p.objetivos || [] },
  brands: { title: "Marca", values: (p) => (p.brand ? [p.brand] : []) },
  sizes: { title: "Tamaño", values: (p) => (p.presentation ? [p.presentation] : []) },
};

// Opciones de una faceta con contadores reactivos (sobre los demás filtros).
// Las opciones que darían 0 se ocultan, salvo las ya seleccionadas (para poder quitarlas).
function getFacetOptions(key) {
  const def = FACET_DEFS[key];
  const baseline = getResultsExcluding(key);
  const selected = catalogState[key]; // array de slugs

  return uniqueSorted(products.flatMap(def.values))
    .map((value) => ({
      value: slugify(value),
      label: value,
      count: baseline.filter((p) => def.values(p).some((v) => slugify(v) === slugify(value))).length,
    }))
    .filter((opt) => opt.count > 0 || selected.includes(opt.value));
}

function getPriceOptions() {
  const baseline = getResultsExcluding("price");
  const priceOf = (p) => Number(p.price ?? p.precio ?? 0);

  return PRICE_RANGES
    .map((range) => ({
      value: range.value,
      label: range.label,
      count: baseline.filter((p) => {
        const value = priceOf(p);
        return value > 0 && value >= range.min && value < range.max;
      }).length,
    }))
    .filter((opt) => opt.count > 0 || opt.value === catalogState.price);
}

function getAvailableCount() {
  return getResultsExcluding("available").filter(productCanBeQuoted).length;
}

/* ----------------------------------------------------------------------------
   Panel de filtros unificado. El MISMO markup se monta en el sidebar (desktop,
   siempre visible) y en el bottom-sheet (mobile). Checkboxes multi-selección
   para objetivo/marca/tamaño; radios para precio; toggle para disponibilidad.
   ---------------------------------------------------------------------------- */
const FACET_COLLAPSE = 6; // opciones visibles antes de "Ver más" (evita parálisis)
const expandedFacets = new Set();

function facetOptionAria(label, count, selected, word = "seleccionado") {
  const unit = count === 1 ? "producto" : "productos";
  return `${label}, ${count} ${unit}${selected ? `, ${word}` : ""}`;
}

function catItemButton(attr, item, active, isType = false) {
  return `<button type="button" class="filter-cat${isType ? " filter-cat--type" : ""}${active ? " is-active" : ""}" ${attr}="${escapeHTML(item.value)}" aria-pressed="${active}" aria-label="${escapeHTML(facetOptionAria(item.label, item.count, active, "activo"))}">
    <span class="filter-cat__label">${escapeHTML(item.label)}</span>
    <span class="filter-cat__count" aria-hidden="true">${item.count}</span>
  </button>`;
}

function panelCategoryGroup() {
  const hier = useHierarchy();
  const items = hier ? getFamilyItems() : getCategoryFilters();
  const activeVal = hier ? catalogState.family : catalogState.category;
  const attr = hier ? "data-family" : "data-category";

  const rows = items.map((it) => {
    const active = it.value === activeVal;
    let row = `<li>${catItemButton(attr, it, active)}`;
    // En jerárquico, la familia activa despliega sus tipos anidados.
    if (hier && active && it.value !== "todos" && it.value !== "destacados") {
      const types = getTypeItems(it.value);
      if (types.length) {
        row += `<ul class="filter-cats filter-cats--types" role="list">${types
          .map((t) => `<li>${catItemButton("data-type", t, t.value === catalogState.type, true)}</li>`)
          .join("")}</ul>`;
      }
    }
    return `${row}</li>`;
  }).join("");

  return `
    <div class="filter-group">
      <p class="filter-group__legend" id="fg-categoria">Categoría</p>
      <ul class="filter-cats" role="list" aria-labelledby="fg-categoria">${rows}</ul>
    </div>`;
}

function panelCheckboxGroup(key) {
  const def = FACET_DEFS[key];
  const options = getFacetOptions(key);
  if (!options.length) return "";

  const selected = catalogState[key];
  const overflow = options.length > FACET_COLLAPSE && !expandedFacets.has(key);
  const shown = overflow ? options.slice(0, FACET_COLLAPSE) : options;

  const checks = shown.map((o) => {
    const isSel = selected.includes(o.value);
    return `<label class="filter-check">
      <input type="checkbox" class="filter-check__input" data-facet-check="${key}" value="${escapeHTML(o.value)}"${isSel ? " checked" : ""} aria-label="${escapeHTML(facetOptionAria(o.label, o.count, isSel))}">
      <span class="filter-check__box" aria-hidden="true"></span>
      <span class="filter-check__label">${escapeHTML(o.label)}</span>
      <span class="filter-check__count" aria-hidden="true">${o.count}</span>
    </label>`;
  }).join("");

  const more = overflow
    ? `<button type="button" class="filter-more" data-facet-more="${key}">Ver ${options.length - FACET_COLLAPSE} más</button>`
    : "";

  return `
    <div class="filter-group">
      <p class="filter-group__legend">${escapeHTML(def.title)}</p>
      <div class="filter-checks">${checks}${more}</div>
    </div>`;
}

function panelPriceGroup() {
  const options = getPriceOptions();
  if (!options.length) return "";

  const row = (value, label, count, checked) => `
    <label class="filter-check filter-check--radio">
      <input type="radio" name="catalog-price" class="filter-check__input" data-facet-radio="price" value="${escapeHTML(value)}"${checked ? " checked" : ""}${count != null ? ` aria-label="${escapeHTML(facetOptionAria(label, count, checked))}"` : ""}>
      <span class="filter-check__box filter-check__box--radio" aria-hidden="true"></span>
      <span class="filter-check__label">${escapeHTML(label)}</span>
      ${count != null ? `<span class="filter-check__count" aria-hidden="true">${count}</span>` : ""}
    </label>`;

  return `
    <div class="filter-group">
      <p class="filter-group__legend">Precio</p>
      <div class="filter-checks">
        ${row("", "Cualquiera", null, !catalogState.price)}
        ${options.map((o) => row(o.value, o.label, o.count, o.value === catalogState.price)).join("")}
      </div>
    </div>`;
}

function panelToggleGroup() {
  const count = getAvailableCount();
  const on = catalogState.available;
  return `
    <div class="filter-group">
      <p class="filter-group__legend">Disponibilidad</p>
      <div class="filter-checks">
        <label class="filter-check filter-check--switch">
          <input type="checkbox" class="filter-check__input" data-facet-toggle="available"${on ? " checked" : ""} aria-label="${escapeHTML(facetOptionAria("Solo disponibles", count, on))}">
          <span class="filter-switch" aria-hidden="true"></span>
          <span class="filter-check__label">Solo disponibles</span>
          <span class="filter-check__count" aria-hidden="true">${count}</span>
        </label>
      </div>
    </div>`;
}

function panelSortGroup() {
  return `
    <div class="filter-group">
      <p class="filter-group__legend">Ordenar</p>
      <div class="filter-chips">
        ${SORT_OPTIONS.map((o) => `<button type="button" class="filter-chip${o.value === catalogState.sort ? " is-active" : ""}" data-sort="${o.value}" aria-pressed="${o.value === catalogState.sort}">${escapeHTML(o.label)}</button>`).join("")}
      </div>
    </div>`;
}

// Reconstruye el contenido del panel desde el estado (contadores reactivos),
// preservando scroll y foco del control tocado (evita saltos al re-render).
function renderFilterPanel(container, { includeCategory = false, includeSort = false } = {}) {
  if (!container) return;

  const scrollPos = container.scrollTop;
  const active = document.activeElement;
  let restore = null;
  if (active && container.contains(active)) {
    if (active.dataset.facetCheck) restore = `[data-facet-check="${active.dataset.facetCheck}"][value="${CSS.escape(active.value)}"]`;
    else if (active.dataset.facetRadio) restore = `[data-facet-radio="${active.dataset.facetRadio}"][value="${CSS.escape(active.value)}"]`;
    else if (active.dataset.facetToggle) restore = `[data-facet-toggle="${active.dataset.facetToggle}"]`;
    else if (active.dataset.sort) restore = `[data-sort="${CSS.escape(active.dataset.sort)}"]`;
  }

  const parts = [];
  if (includeSort) parts.push(panelSortGroup());
  if (includeCategory) parts.push(panelCategoryGroup());
  parts.push(panelToggleGroup());
  parts.push(panelPriceGroup());
  parts.push(panelCheckboxGroup("goals"));
  parts.push(panelCheckboxGroup("brands"));
  parts.push(panelCheckboxGroup("sizes"));

  container.innerHTML = parts.join("");
  container.scrollTop = scrollPos;
  if (restore) container.querySelector(restore)?.focus?.({ preventScroll: true });
}

// Monta el panel en el sidebar (desktop) y, si está abierto, en el sheet (mobile).
function renderPanels() {
  if (catalogSidebarBody) renderFilterPanel(catalogSidebarBody, { includeCategory: true, includeSort: false });
  const sheetBody = filterSheetEl?.querySelector(".filter-sheet__body");
  if (sheetBody) {
    renderFilterPanel(sheetBody, { includeCategory: true, includeSort: true });
    updateSheetApplyLabel();
  }
}

function updateSidebarClear() {
  if (catalogSidebarClear) catalogSidebarClear.hidden = !hasActiveFilters();
}

function onFilterPanelChange(event) {
  const check = event.target.closest("[data-facet-check]");
  if (check) {
    const key = check.dataset.facetCheck;
    const arr = catalogState[key];
    if (check.checked) {
      if (!arr.includes(check.value)) arr.push(check.value);
    } else {
      catalogState[key] = arr.filter((v) => v !== check.value);
    }
    commitWithFilters();
    return;
  }

  const radio = event.target.closest("[data-facet-radio]");
  if (radio) {
    catalogState[radio.dataset.facetRadio] = radio.value;
    commitWithFilters();
    return;
  }

  const toggle = event.target.closest("[data-facet-toggle]");
  if (toggle) {
    catalogState.available = toggle.checked;
    commitWithFilters();
  }
}

function onFilterPanelClick(event) {
  const more = event.target.closest("[data-facet-more]");
  if (more) {
    expandedFacets.add(more.dataset.facetMore);
    renderPanels(); // solo re-render de paneles; no recomputa el catálogo
    return;
  }

  const sortBtn = event.target.closest("[data-sort]");
  if (sortBtn) {
    catalogState.sort = sortBtn.dataset.sort;
    if (catalogSort) {
      catalogSort.value = catalogState.sort;
      window.javyDropdown?.refresh?.(catalogSort);
    }
    commitWithFilters();
    return;
  }

  const cat = event.target.closest("[data-family],[data-type],[data-category]");
  if (cat) selectCategory(cat);
}

function bindFilterPanel(container) {
  if (!container || container._panelBound) return;
  container._panelBound = true;
  container.addEventListener("change", onFilterPanelChange);
  container.addEventListener("click", onFilterPanelClick);
}

function renderFilters() {
  if (!catalogFilters) return;

  if (useHierarchy()) {
    renderFamilyFilters();
    renderTypeFilters();
  } else {
    renderFlatFilters();
  }

  renderPanels();

  updateFilterHint();
  updateFiltersButton();
  updateSidebarClear();
}

function renderProductCard(product) {
  const canQuote = productCanBeQuoted(product);
  // encodeURIComponent + escapeHTML: la URL ya va segura y explícita en el markup.
  const detailUrl = escapeHTML(window.javyProductUrl?.forProduct?.(product) || `product-page.html?id=${encodeURIComponent(product.id)}`);
  const card = document.createElement("article");
  card.className = `product-card${product.imagenPendiente ? " product-card--image-pending" : ""}`;

  card.innerHTML = `
    ${product.featured ? '<span class="product-card__badge">Destacado</span>' : ""}

    <a class="product-card__media product-card__media-link" href="${detailUrl}" aria-label="Ver ${escapeHTML(product.name)}">
      <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" class="product-card__img" loading="lazy" decoding="async" />
    </a>

    <div class="product-card__info">
      <div class="product-card__meta">
        <span class="product-card__brand">${escapeHTML(product.brand || "Marca en revision")}</span>
        <span class="product-card__status ${canQuote ? "is-available" : "is-agotado"}">
          ${canQuote ? "Disponible" : "Agotado"}
        </span>
      </div>
      <h3 class="product-card__name">
        <a class="product-card__name-link" href="${detailUrl}">${escapeHTML(product.name)}</a>
      </h3>
      <div class="product-card__price-row">
        <span class="product-card__price-group">
          <span class="product-card__price">$${formatPrice(product.price)}</span>
          ${hasOffer(product) ? `<span class="product-card__price-old">$${formatPrice(product.old_price)}</span><span class="product-card__discount">-${discountPercent(product)}%</span>` : ""}
        </span>
        ${product.presentation ? `<span class="product-card__pres">${escapeHTML(product.presentation)}</span>` : ""}
      </div>
    </div>

    <div class="product-card__actions">
      ${canQuote
        ? '<button class="product-card__btn product-card__btn--buy" type="button">Agregar a cotización</button>'
        : '<button class="product-card__btn product-card__btn--quote" type="button">Consultar disponibilidad</button>'
      }
      <a class="product-card__detail-link" href="${detailUrl}">Ver detalles</a>
    </div>
  `;

  card._javyProduct = product;

  // "Agregar" abre el modal de selección (sabor + cantidad); la card ya no trae selects.
  card.querySelector(".product-card__btn--buy")?.addEventListener("click", () => {
    window.consultation?.openAddModal?.(product);
  });
  card.querySelector(".product-card__btn--quote")?.addEventListener("click", () => {
    window.consultation?.askAvailability?.(product, {});
  });
  syncAddButton(card, product);

  // "Ver detalles" y la imagen/nombre son <a href> reales; la transición la aplica
  // el handler global de include-nav.js.

  return card;
}

// Renderizado incremental: lotes de 24 cards para no volcar ~180 nodos de golpe
// en móvil. El resto entra al hacer scroll (IntersectionObserver sobre
// #catalogMore) o con el botón "Ver más productos" como fallback.
const CATALOG_BATCH_SIZE = 24;
let currentResults = [];
let renderedCount = 0;

function updateCatalogCount() {
  const total = currentResults.length;
  const label = total === 1 ? "producto encontrado" : "productos encontrados";
  catalogCount.textContent = renderedCount < total
    ? `Mostrando ${renderedCount} de ${total} ${label}`
    : `${total} ${label}`;
}

// Región viva aparte del contador visible: anuncia el total solo al cambiar
// filtros; los lotes del scroll no interrumpen al lector de pantalla.
function announceCatalogTotal() {
  const liveRegion = document.getElementById("catalogCountLive");
  if (!liveRegion) return;
  const total = currentResults.length;
  liveRegion.textContent = `${total} ${total === 1 ? "producto encontrado" : "productos encontrados"}`;
}

function appendNextBatch() {
  const batch = currentResults.slice(renderedCount, renderedCount + CATALOG_BATCH_SIZE);
  batch.forEach((product) => {
    supplementsList.appendChild(renderProductCard(product));
  });
  renderedCount += batch.length;
  if (window.javyDropdown) window.javyDropdown.enhanceSelects(supplementsList);
  updateCatalogCount();
  if (catalogMore) catalogMore.hidden = renderedCount >= currentResults.length;
}

function renderCatalog() {
  if (!supplementsList || !catalogCount || !catalogEmpty) return;

  currentResults = getFilteredProducts();
  renderedCount = 0;
  if (window.javyDropdown) window.javyDropdown.destroy(supplementsList);
  supplementsList.innerHTML = "";
  bindConsultationSync();

  appendNextBatch();
  supplementsList.setAttribute("aria-busy", "false");
  announceCatalogTotal();
  renderActiveFilters();

  catalogEmpty.hidden = currentResults.length > 0;
  if (emptyResetBtn) emptyResetBtn.hidden = currentResults.length > 0 || !hasActiveFilters();
  if (currentResults.length === 0) updateEmptyRelaxOption();
}

function renderLoading() {
  if (!supplementsList || !catalogCount) return;
  catalogCount.textContent = "Cargando catálogo…";
  supplementsList.setAttribute("aria-busy", "true");

  // Skeletons de filtros mientras Supabase responde (chips en mobile, grupos en
  // el sidebar) para que no se vea un hueco antes de que aparezcan los filtros.
  if (catalogFilters) {
    catalogFilters.innerHTML = Array.from({ length: 5 }, () =>
      `<span class="catalog-filter catalog-filter--skeleton skeleton-box" aria-hidden="true"></span>`).join("");
  }
  if (catalogSidebarBody) {
    catalogSidebarBody.innerHTML = Array.from({ length: 3 }, () => `
      <div class="filter-group" aria-hidden="true">
        <span class="skeleton-line skeleton-line--sm"></span>
        <span class="skeleton-line skeleton-line--lg"></span>
        <span class="skeleton-line"></span>
      </div>`).join("");
  }

  supplementsList.innerHTML = Array.from({ length: 8 }, () => `
    <article class="product-card product-card--skeleton" aria-hidden="true">
      <div class="product-card__media skeleton-box"></div>
      <div class="product-card__info">
        <div class="skeleton-line skeleton-line--sm"></div>
        <div class="skeleton-line skeleton-line--lg"></div>
        <div class="skeleton-line skeleton-line--price"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line skeleton-line--btn"></div>
      </div>
    </article>
  `).join("");
}

function injectStructuredData() {
  if (!products.length) return;

  const itemListElement = products.map((product, index) => {
    const offers = Number(product.price) > 0
      ? {
          "@type": "Offer",
          price: Number(product.price).toFixed(2),
          priceCurrency: "USD",
          availability: productCanBeQuoted(product)
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          url: `${SITE_BASE}product-page.html?id=${encodeURIComponent(product.id)}`,
        }
      : undefined;

    const item = {
      "@type": "Product",
      name: product.name,
      image: toAbsoluteUrl(product.image),
      url: `${SITE_BASE}product-page.html?id=${encodeURIComponent(product.id)}`,
    };
    if (product.brand) item.brand = { "@type": "Brand", name: product.brand };
    if (offers) item.offers = offers;

    return { "@type": "ListItem", position: index + 1, item };
  });

  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Catálogo de suplementos | Javy Suplementos",
    itemListElement,
  };

  let script = document.getElementById("catalog-jsonld");
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "catalog-jsonld";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

function hasActiveFilters() {
  // En modo jerárquico `category` se ignora (y `type` solo aplica con familia
  // elegida); en modo plano pasa lo mismo con family/type. Contar solo lo que
  // realmente filtra evita chips/botón "Quitar filtros" que no hacen nada.
  const categoryActive = useHierarchy()
    ? catalogState.family !== "todos"
    : catalogState.category !== "todos";

  return Boolean(catalogState.query.trim())
    || categoryActive
    || catalogState.goals.length > 0
    || catalogState.brands.length > 0
    || catalogState.sizes.length > 0
    || Boolean(catalogState.price)
    || catalogState.available;
}

function resetFilters() {
  catalogState.query = "";
  catalogState.category = "todos";
  catalogState.family = "todos";
  catalogState.type = "todos";
  catalogState.goals = [];
  catalogState.brands = [];
  catalogState.sizes = [];
  catalogState.price = "";
  catalogState.available = false;
  if (searchInput) searchInput.value = "";
  if (searchClear) searchClear.hidden = true;
  commitWithFilters();
}

// Recupera la etiqueta original (con acentos/mayúsculas) a partir del slug guardado.
function facetLabelFromSlug(values, slug) {
  return values.find((value) => slugify(value) === slug) || slug;
}

function getActiveFilterChips() {
  const chips = [];
  const query = catalogState.query.trim();
  if (query) chips.push({ key: "query", label: `“${query}”` });

  if (useHierarchy()) {
    if (catalogState.family !== "todos") {
      const label = catalogState.family === "destacados"
        ? "Destacados"
        : pubCategoryById(catalogState.family)?.name;
      if (label) chips.push({ key: "family", label });

      // El tipo solo filtra cuando hay una familia elegida.
      if (catalogState.type !== "todos") {
        const type = pubCategoryById(catalogState.type);
        if (type) chips.push({ key: "type", label: type.name });
      }
    }
  } else if (catalogState.category !== "todos") {
    const label = catalogState.category === "destacados"
      ? "Destacados"
      : products.find((p) => getProductCategory(p) === catalogState.category)?.category || catalogState.category;
    chips.push({ key: "category", label });
  }

  // Multi-selección: un chip removible por cada valor elegido.
  const goalValues = uniqueSorted(products.flatMap((p) => p.goals || p.objetivos || []));
  catalogState.goals.forEach((slug) => chips.push({ key: "goals", value: slug, label: facetLabelFromSlug(goalValues, slug) }));
  const brandValues = uniqueSorted(products.map((p) => p.brand));
  catalogState.brands.forEach((slug) => chips.push({ key: "brands", value: slug, label: facetLabelFromSlug(brandValues, slug) }));
  const sizeValues = uniqueSorted(products.map((p) => p.presentation));
  catalogState.sizes.forEach((slug) => chips.push({ key: "sizes", value: slug, label: facetLabelFromSlug(sizeValues, slug) }));

  if (catalogState.price) {
    const range = PRICE_RANGES.find((r) => r.value === catalogState.price);
    if (range) chips.push({ key: "price", label: range.label });
  }
  if (catalogState.available) {
    chips.push({ key: "available", label: "Solo disponibles" });
  }

  return chips;
}

// Resumen de filtros activos como chips removibles junto a los resultados.
function renderActiveFilters() {
  if (!catalogActiveFilters) return;

  const chips = getActiveFilterChips();
  if (!chips.length) {
    catalogActiveFilters.hidden = true;
    catalogActiveFilters.innerHTML = "";
    return;
  }

  catalogActiveFilters.hidden = false;
  catalogActiveFilters.innerHTML = chips.map((chip) => `
    <button class="catalog-active-filter" type="button" data-filter-key="${chip.key}" data-filter-value="${escapeHTML(chip.value || "")}" aria-label="Quitar filtro: ${escapeHTML(chip.label)}">
      ${escapeHTML(chip.label)}<span class="catalog-active-filter__x" aria-hidden="true">×</span>
    </button>`).join("")
    + (chips.length > 1
      ? '<button class="catalog-active-filter catalog-active-filter--clear" type="button" data-filter-key="all">Limpiar todo</button>'
      : "");
}

catalogActiveFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter-key]");
  if (!button) return;

  const key = button.dataset.filterKey;
  switch (key) {
    case "all":
      resetFilters();
      return;
    case "query":
      catalogState.query = "";
      if (searchInput) searchInput.value = "";
      if (searchClear) searchClear.hidden = true;
      break;
    case "family":
      catalogState.family = "todos";
      catalogState.type = "todos";
      break;
    case "type":
      catalogState.type = "todos";
      break;
    case "category":
      catalogState.category = "todos";
      break;
    case "goals":
    case "brands":
    case "sizes":
      // Quita solo el valor de este chip; conserva el resto de la faceta.
      catalogState[key] = catalogState[key].filter((v) => v !== button.dataset.filterValue);
      break;
    case "price":
      catalogState.price = "";
      break;
    case "available":
      catalogState.available = false;
      break;
    default:
      return;
  }
  commitWithFilters();
});

emptyResetBtn?.addEventListener("click", resetFilters);

/* ----------------------------------------------------------------------------
   Bottom-sheet de filtros (mobile): monta el panel unificado (renderFilterPanel)
   con orden + facetas para no apilar controles antes del grid. En desktop ese
   mismo panel vive en el sidebar lateral fijo (#catalogSidebar).
   ---------------------------------------------------------------------------- */
const SORT_OPTIONS = [
  { value: "recomendados", label: "Recomendados" },
  { value: "ofertas", label: "Ofertas primero" },
  { value: "novedades", label: "Novedades" },
  { value: "precio-asc", label: "Precio: menor a mayor" },
  { value: "precio-desc", label: "Precio: mayor a menor" },
  { value: "nombre", label: "Nombre: A-Z" },
];

let filterSheetEl = null;
let filterSheetOpener = null;

function countAdvancedFilters() {
  return catalogState.goals.length + catalogState.brands.length + catalogState.sizes.length
    + (catalogState.price ? 1 : 0)
    + (catalogState.available ? 1 : 0);
}

function updateFiltersButton() {
  if (!catalogFiltersBtn) return;
  const badge = catalogFiltersBtn.querySelector(".catalog-filters-btn__badge");
  if (!badge) return;
  const count = countAdvancedFilters();
  badge.textContent = count;
  badge.hidden = count === 0;
}

// El botón de aplicar del sheet muestra cuántos productos daría el estado actual.
function updateSheetApplyLabel() {
  const applyBtn = filterSheetEl?.querySelector("[data-sheet-apply]");
  if (!applyBtn) return;
  const total = getResultsExcluding().length;
  applyBtn.textContent = total === 1 ? "Ver 1 producto" : `Ver ${total} productos`;
}

function filterSheetOnKey(event) {
  if (event.key === "Escape") closeFilterSheet();
}

function closeFilterSheet() {
  if (!filterSheetEl) return;
  document.removeEventListener("keydown", filterSheetOnKey);
  filterSheetEl.remove();
  filterSheetEl = null;
  document.body.style.overflow = "";
  filterSheetOpener?.focus?.({ preventScroll: true });
  filterSheetOpener = null;
}

function openFilterSheet() {
  if (filterSheetEl) return;
  filterSheetOpener = document.activeElement;

  const overlay = document.createElement("div");
  overlay.className = "filter-sheet-overlay";
  overlay.innerHTML = `
    <div class="filter-sheet" role="dialog" aria-modal="true" aria-label="Filtros del catálogo">
      <div class="filter-sheet__head">
        <strong class="filter-sheet__title">Filtros</strong>
        <button class="filter-sheet__close" type="button" aria-label="Cerrar filtros" data-sheet-close>
          <span class="btn-icon" data-javy-icon="x" aria-hidden="true"></span>
        </button>
      </div>
      <div class="filter-sheet__body"></div>
      <div class="filter-sheet__foot">
        <button class="filter-sheet__clear" type="button" data-sheet-clear>Limpiar</button>
        <button class="filter-sheet__apply" type="button" data-sheet-apply>Ver productos</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  filterSheetEl = overlay;
  window.javyIcons?.enhance?.(overlay);
  document.body.style.overflow = "hidden";
  document.addEventListener("keydown", filterSheetOnKey);

  const body = overlay.querySelector(".filter-sheet__body");
  bindFilterPanel(body); // grupos (orden, checkboxes, precio, toggle, categoría no) via handler unificado
  renderFilterPanel(body, { includeCategory: true, includeSort: true });
  updateSheetApplyLabel();

  // El overlay solo gestiona cerrar/aplicar/limpiar; los grupos los maneja el panel.
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.closest("[data-sheet-close]")) {
      closeFilterSheet();
      return;
    }
    if (event.target.closest("[data-sheet-apply]")) {
      closeFilterSheet();
      scrollToResults();
      return;
    }
    if (event.target.closest("[data-sheet-clear]")) {
      // Limpia TODO (incl. búsqueda y categoría) para no dejar cero resultados inexplicables.
      resetFilters();
    }
  });

  window.setTimeout(() => {
    overlay.querySelector(".filter-sheet__close")?.focus?.();
  }, 40);
}

catalogFiltersBtn?.addEventListener("click", openFilterSheet);

// Si el usuario filtra desde abajo de la página, sube hasta el inicio de los
// resultados para que el cambio no ocurra fuera de vista.
function scrollToResults() {
  if (!catalogResultsBar) return;
  if (filterSheetEl) return; // con el sheet abierto no hay que mover el fondo

  const headerOffset = (document.querySelector(".site-header")?.offsetHeight || 0) + 12;
  const top = catalogResultsBar.getBoundingClientRect().top;
  if (top >= headerOffset) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({
    top: window.scrollY + top - headerOffset,
    behavior: reduceMotion ? "auto" : "smooth",
  });
}

// Todo cambio re-renderiza también los filtros: los contadores de chips y
// facetas son reactivos al resto del estado (incluida la búsqueda).
function commitState(pushHistory = false) {
  renderFilters();
  renderCatalog();
  writeStateToURL(pushHistory);
  scrollToResults();
}

const debouncedCommit = debounce(commitState, 160);

function writeStateToURL(push = false) {
  const params = new URLSearchParams();
  if (catalogState.query.trim()) params.set("q", catalogState.query.trim());
  if (useHierarchy()) {
    if (catalogState.family !== "todos") params.set("fam", categoryParamValue(catalogState.family));
    if (catalogState.type !== "todos") params.set("tipo", categoryParamValue(catalogState.type));
  } else if (catalogState.category !== "todos") {
    params.set("cat", catalogState.category);
  }
  if (catalogState.goals.length) params.set("obj", catalogState.goals.join(","));
  if (catalogState.brands.length) params.set("marca", catalogState.brands.join(","));
  if (catalogState.sizes.length) params.set("size", catalogState.sizes.join(","));
  if (catalogState.price) params.set("precio", catalogState.price);
  if (catalogState.available) params.set("disp", "1");
  if (catalogState.sort && catalogState.sort !== "recomendados") params.set("sort", catalogState.sort);

  const qs = params.toString();
  const url = qs ? `${location.pathname}?${qs}` : location.pathname;
  // Los cambios de categoría entran al historial (el botón "atrás" los deshace);
  // el resto (tipeo, facetas) solo reemplaza para no llenar el historial.
  if (push && url !== location.pathname + location.search) {
    history.pushState(null, "", url);
  } else {
    history.replaceState(null, "", url);
  }
}

function readStateFromURL() {
  const params = new URLSearchParams(location.search);
  catalogState.query = params.get("q") || "";
  catalogState.category = params.get("cat") || "todos";
  catalogState.family = categoryIdFromParam(params.get("fam"), true);
  catalogState.type = categoryIdFromParam(params.get("tipo"), false);
  const parseList = (v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  catalogState.goals = parseList(params.get("obj"));
  catalogState.brands = parseList(params.get("marca"));
  catalogState.sizes = parseList(params.get("size"));
  const precio = params.get("precio") || "";
  catalogState.price = PRICE_RANGES.some((r) => r.value === precio) ? precio : "";
  catalogState.available = params.get("disp") === "1";
  const sortParam = params.get("sort") || "recomendados";
  catalogState.sort = SORT_OPTIONS.some((o) => o.value === sortParam) ? sortParam : "recomendados";

  if (searchInput) searchInput.value = catalogState.query;
  if (searchClear) searchClear.hidden = !catalogState.query;
  if (catalogSort) {
    catalogSort.value = catalogState.sort;
    if (window.javyDropdown) window.javyDropdown.refresh(catalogSort);
  }
}

// El botón "atrás" restaura el estado de filtros guardado con pushState.
window.addEventListener("popstate", () => {
  if (!products.length) return; // aún cargando
  closeFilterSheet();
  readStateFromURL();
  renderFilters();
  renderCatalog();
});

searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  catalogState.query = searchInput.value;
  searchClear.hidden = !catalogState.query;
  commitState();
});

searchInput?.addEventListener("input", () => {
  catalogState.query = searchInput.value;
  searchClear.hidden = !catalogState.query;
  debouncedCommit();
});

searchClear?.addEventListener("click", () => {
  searchInput.value = "";
  catalogState.query = "";
  searchClear.hidden = true;
  searchInput.focus();
  commitState();
});

catalogSort?.addEventListener("change", () => {
  catalogState.sort = catalogSort.value;
  commitState();
});
if (window.javyDropdown && catalogSort) window.javyDropdown.enhance(catalogSort);

function commitWithFilters(pushHistory = false) {
  commitState(pushHistory);
}

function selectCategory(button) {
  // Modo jerárquico: familia o tipo.
  if (button.dataset.family !== undefined) {
    catalogState.family = button.dataset.family || "todos";
    catalogState.type = "todos";
    commitWithFilters(true);
    return;
  }
  if (button.dataset.type !== undefined) {
    catalogState.type = button.dataset.type || "todos";
    commitWithFilters(true);
    return;
  }

  // Modo plano (fallback). commitState re-renderiza los chips con el activo.
  catalogState.category = button.dataset.category || "todos";
  commitState(true);
}

catalogFilters?.addEventListener("click", (event) => {
  const button = event.target.closest(".catalog-filter");
  if (button) selectCategory(button);
});

catalogSubFilters?.addEventListener("click", (event) => {
  const button = event.target.closest(".catalog-filter");
  if (button) selectCategory(button);
});

// Las facetas ahora viven en el panel unificado (sidebar/sheet); sus eventos
// los gestiona bindFilterPanel(). Ver renderFilterPanel / onFilterPanelChange.

// Al navegar los chips con Tab, traer a la vista el enfocado (el carrusel
// horizontal los puede dejar clipeados fuera del área visible).
[catalogFilters, catalogSubFilters].forEach((element) => {
  element?.addEventListener("focusin", (event) => {
    const chip = event.target.closest(".catalog-filter");
    chip?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
});

emptyAdvisorBtn?.addEventListener("click", () => {
  openJavyWhatsapp("Hola Javy, quiero consultar disponibilidad de suplementos.");
});

// Estado vacío inteligente: si la búsqueda sí tiene resultados fuera de la
// categoría/facetas elegidas, ofrecer verlos en todo el catálogo.
function updateEmptyRelaxOption() {
  if (!emptyRelaxBtn) return;

  const query = catalogState.query.trim();
  const matches = query
    ? getResultsExcluding("category", "goals", "brands", "sizes", "price", "available").length
    : 0;

  if (matches > 0) {
    emptyRelaxBtn.textContent = matches === 1
      ? `Ver 1 resultado de “${query}” en todo el catálogo`
      : `Ver los ${matches} resultados de “${query}” en todo el catálogo`;
    emptyRelaxBtn.hidden = false;
  } else {
    emptyRelaxBtn.hidden = true;
  }
}

emptyRelaxBtn?.addEventListener("click", () => {
  catalogState.category = "todos";
  catalogState.family = "todos";
  catalogState.type = "todos";
  catalogState.goals = [];
  catalogState.brands = [];
  catalogState.sizes = [];
  catalogState.price = "";
  catalogState.available = false;
  commitWithFilters();
});

function updateFloatingQuoteVisibility() {
  if (!catalogFloatingQuote) return;

  const hasItems = (window.consultation?.getCount?.() || 0) > 0;
  const shouldShow = window.scrollY > 260 || hasItems;
  catalogFloatingQuote.hidden = !shouldShow;
  catalogFloatingQuote.classList.toggle("is-visible", shouldShow);
}

function updateFilterHint() {
  if (!catalogFilters) return;

  const { scrollWidth, clientWidth, scrollLeft } = catalogFilters;
  const overflowing = scrollWidth > clientWidth + 4;
  catalogFilters.classList.toggle("has-overflow", overflowing);
  // Degradado bidireccional: fade al lado que aún tiene chips fuera de vista.
  catalogFilters.classList.toggle("has-overflow-left", overflowing && scrollLeft > 4);
  catalogFilters.classList.toggle("has-overflow-right", overflowing && scrollLeft + clientWidth < scrollWidth - 4);
  if (catalogToolsHint) catalogToolsHint.hidden = !overflowing;
}

window.addEventListener("resize", updateFilterHint, { passive: true });
catalogFilters?.addEventListener("scroll", updateFilterHint, { passive: true });

function updateScrollTopVisibility() {
  if (!catalogScrollTop) return;

  const currentScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  const scrollingUp = currentScrollY < lastCatalogScrollY - 8;
  const farEnough = currentScrollY > 520;
  const scrollingDown = currentScrollY > lastCatalogScrollY + 8;

  if (scrollingDown || !farEnough) {
    scrollTopIsVisible = false;
  } else if (scrollingUp && farEnough) {
    scrollTopIsVisible = true;
  }

  catalogScrollTop.hidden = !scrollTopIsVisible;
  catalogScrollTop.classList.toggle("is-visible", scrollTopIsVisible);
  lastCatalogScrollY = Math.max(0, currentScrollY);
}

catalogFloatingQuote?.addEventListener("click", () => {
  window.consultation?.openPanel?.();
});

catalogScrollTop?.addEventListener("click", () => {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

window.addEventListener("scroll", () => {
  updateFloatingQuoteVisibility();
  updateScrollTopVisibility();
}, { passive: true });

function enableDragScroll(element) {
  if (!element) return;

  let isDown = false;
  let startX = 0;
  let scrollLeft = 0;
  let didDrag = false;
  let dragDistance = 0;
  let pressedFilter = null;
  let suppressClick = false;
  const dragThreshold = 10;

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    isDown = true;
    didDrag = false;
    dragDistance = 0;
    pressedFilter = event.target.closest(".catalog-filter");
    startX = event.clientX;
    scrollLeft = element.scrollLeft;
    element.classList.add("is-dragging");
    element.setPointerCapture?.(event.pointerId);
  });

  element.addEventListener("pointermove", (event) => {
    if (!isDown) return;

    const distance = event.clientX - startX;
    dragDistance = Math.max(dragDistance, Math.abs(distance));
    if (dragDistance < dragThreshold) return;

    didDrag = true;
    element.scrollLeft = scrollLeft - distance;
  });

  function stopDrag(event) {
    const shouldSelectFilter = event?.type === "pointerup" && pressedFilter && !didDrag;

    isDown = false;
    element.classList.remove("is-dragging");
    if (event?.pointerId) element.releasePointerCapture?.(event.pointerId);

    if (shouldSelectFilter) {
      selectCategory(pressedFilter);
      suppressClick = true;
    }

    pressedFilter = null;
  }

  element.addEventListener("pointerup", stopDrag);
  element.addEventListener("pointercancel", stopDrag);
  element.addEventListener("pointerleave", stopDrag);
  element.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
      return;
    }

    if (!didDrag) return;

    event.preventDefault();
    event.stopPropagation();
    didDrag = false;
  }, true);
}

catalogMoreBtn?.addEventListener("click", () => {
  const firstNewIndex = renderedCount;
  appendNextBatch();
  // Si era el último lote el botón desaparece bajo el foco: moverlo a la
  // primera card nueva para no soltarlo en <body>.
  if (catalogMore?.hidden) {
    supplementsList.children[firstNewIndex]
      ?.querySelector("a, button")
      ?.focus();
  }
});

// Carga el siguiente lote un poco antes de que el usuario llegue al final del
// grid. Con [hidden] el sentinel no intersecta, así que no dispara de más.
if (catalogMore && "IntersectionObserver" in window) {
  const moreObserver = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    appendNextBatch();
    // Re-observar fuerza otra evaluación por si el lote no empujó el sentinel
    // fuera del margen (el observer solo dispara en cruces).
    moreObserver.unobserve(catalogMore);
    moreObserver.observe(catalogMore);
  }, { rootMargin: "600px 0px" });
  moreObserver.observe(catalogMore);
}

// Aviso cuando Supabase falló y el catálogo salió del respaldo local:
// los precios/disponibilidad pueden estar desactualizados.
function updateOfflineNote() {
  if (!catalogOfflineNote) return;
  // Cubre también el caso de CDN caído (window.supabaseClient null): si la
  // fuente es el respaldo local, el aviso siempre aplica.
  catalogOfflineNote.hidden = window.catalogDb?.getProductsCacheSource?.() !== "local";
}

catalogSidebarClear?.addEventListener("click", resetFilters);

async function initCatalog() {
  renderLoading();
  enableDragScroll(catalogFilters);
  enableDragScroll(catalogSubFilters);
  bindFilterPanel(catalogSidebarBody); // sidebar desktop (el sheet se enlaza al abrirse)
  updateFloatingQuoteVisibility();
  updateScrollTopVisibility();

  products = await window.catalogDb.getProductsWithFlavors();
  try {
    categories = await window.catalogDb.getCategories();
  } catch (error) {
    categories = [];
  }
  readStateFromURL();
  renderFilters();
  renderCatalog();
  updateOfflineNote();
  injectStructuredData();
  updateFloatingQuoteVisibility();
}

initCatalog();
