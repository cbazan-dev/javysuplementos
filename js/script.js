const lista = document.getElementById("top-products__list");
const heroProductsBtn = document.querySelector(".hero__button--pri");
const heroAdvisorBtn = document.querySelector(".hero__button--sec");

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

function slugify(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function productCanBeQuoted(product) {
  if (product.available === false) return false;
  if (!product.flavors?.length) return true;
  return product.flavors.some((flavor) => flavor.available !== false);
}

function isNoFlavorProduct(product) {
  return product?.flavor_mode === "no_flavor";
}

function renderFlavorOptions(product) {
  const flavors = product.flavors || [];
  const selectId = `home-flavor-${slugify(product.id)}`;
  const enabled = productCanBeQuoted(product);

  if (!flavors.length) {
    return `
      <div class="product-card__flavors">
        <label class="product-card__flavor-label" for="${selectId}">Sabor</label>
        <select class="product-card__flavor-select" id="${selectId}" data-flavor-select disabled>
          <option>Sin sabor</option>
        </select>
      </div>
    `;
  }

  const label = flavors.length === 1 ? "Sabor" : "Sabores";

  return `
    <div class="product-card__flavors" aria-label="${label} disponibles">
      <label class="product-card__flavor-label" for="${selectId}">${label}</label>
      <select class="product-card__flavor-select" id="${selectId}" data-flavor-select ${enabled ? "" : "disabled"}>
        <option value="">Elegir sabor</option>
        ${flavors.map((flavor) => `
          <option value="${escapeHTML(flavor.id)}" ${flavor.available === false ? "disabled" : ""}>
            ${escapeHTML(flavor.name)}${flavor.available === false ? " — No disponible" : ""}
          </option>
        `).join("")}
      </select>
    </div>
  `;
}

function getSelectedFlavor(card, product, shouldRequire = true) {
  const select = card.querySelector("[data-flavor-select]");
  if (!select || !product.flavors?.length) return { flavor: "", flavor_id: "" };

  if (!select.value) {
    if (shouldRequire) select.focus();
    return null;
  }

  const flavor = product.flavors.find((item) => item.id === select.value);
  if (!flavor || flavor.available === false) return null;
  return { flavor: flavor.name, flavor_id: flavor.id };
}

function wireQuantityStepper(card) {
  const valueEl = card.querySelector("[data-qty-value]");
  if (!valueEl) return;
  card.querySelector("[data-qty-dec]")?.addEventListener("click", () => {
    valueEl.textContent = Math.max(1, (parseInt(valueEl.textContent, 10) || 1) - 1);
  });
  card.querySelector("[data-qty-inc]")?.addEventListener("click", () => {
    valueEl.textContent = Math.min(99, (parseInt(valueEl.textContent, 10) || 1) + 1);
  });
}

function getCardQuantity(card) {
  if (window.matchMedia("(max-width: 767px)").matches) {
    const select = card.querySelector("[data-qty-select]");
    if (select) return Math.max(1, parseInt(select.value, 10) || 1);
  }
  return Math.max(1, parseInt(card.querySelector("[data-qty-value]")?.textContent, 10) || 1);
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
  // Un único listener por página evita fugas al re-renderizar la lista.
  document.addEventListener("consultation:change", syncAllAddButtons);
}

function renderFeaturedProducts(productos) {
  if (!lista) return;

  if (!productos.length) {
    lista.innerHTML = `
      <p class="product-card__disclaimer">
        No hay productos destacados por el momento.
      </p>
    `;
    return;
  }

  lista.innerHTML = "";
  bindConsultationSync();

  productos.forEach((product) => {
    const canQuote = productCanBeQuoted(product);
    const card = document.createElement("article");
    card.classList.add("product-card");
    if (product.imagenPendiente) card.classList.add("product-card--image-pending");

    const detailUrl = window.javyProductUrl?.forProduct?.(product) || `product-page.html?id=${encodeURIComponent(product.id)}`;
    card.innerHTML = `
      <a class="product-card__media product-card__media-link" href="${detailUrl}" aria-label="Ver ${escapeHTML(product.name)}">
        <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" class="product-card__img" loading="lazy" />
      </a>

      <div class="product-card__info">
        <div class="product-card__meta">
          <span class="product-card__brand">${escapeHTML(product.brand || "Marca en revision")}</span>
          <span class="product-card__status ${canQuote ? "is-available" : "is-agotado"}">
            ${canQuote ? "Disponible" : "Agotado"}
          </span>
        </div>
        <h3 class="product-card__name"><a class="product-card__name-link" href="${detailUrl}">${escapeHTML(product.name)}</a></h3>
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

    // "Agregar" abre el modal de selección (sabor + cantidad); ya no hay selects en la card.
    card.querySelector(".product-card__btn--buy")?.addEventListener("click", () => {
      window.consultation?.openAddModal?.(product);
    });
    card.querySelector(".product-card__btn--quote")?.addEventListener("click", () => {
      window.consultation?.askAvailability?.(product, {});
    });
    syncAddButton(card, product);

    lista.appendChild(card);
  });
}

if (heroProductsBtn) {
  heroProductsBtn.addEventListener("click", () => {
    document.getElementById("productos")?.scrollIntoView({ behavior: "smooth" });
  });
}

if (heroAdvisorBtn) {
  heroAdvisorBtn.addEventListener("click", () => {
    window.consultation?.openPanel?.();
  });
}

async function initHomeProducts() {
  if (!lista) return;
  lista.innerHTML = `<p class="product-card__disclaimer">Cargando productos destacados...</p>`;

  try {
    const homeProducts = await window.catalogDb.getHomeProducts();
    renderFeaturedProducts(homeProducts);
  } catch (error) {
    console.warn("No se pudieron cargar productos del inicio:", error.message);
    const allProducts = await window.catalogDb.getProductsWithFlavors();
    const featuredProducts = allProducts.filter((product) => product.featured).slice(0, 8);
    renderFeaturedProducts(featuredProducts);
  }
}

initHomeProducts();

// ===== Combos =====
const combosSection = document.getElementById("combos");
const combosList = document.getElementById("home-combos__list");

// Un combo se agrega a la cotización como un item con forma de producto.
function comboToQuoteProduct(combo) {
  return {
    id: combo.id,
    name: `Combo: ${combo.name}`,
    brand: "",
    category: "Combo",
    price: combo.price,
    presentation: combo.items
      .map((i) => `${i.quantity}× ${i.product_name}${i.flavor_name ? ` (${i.flavor_name})` : ""}`)
      .join(", "),
    image: combo.image,
  };
}

function renderHomeCombos(combos) {
  if (!combosSection || !combosList) return;
  if (!combos.length) {
    combosSection.hidden = true;
    return;
  }
  combosSection.hidden = false;
  combosList.innerHTML = "";

  combos.forEach((combo) => {
    const card = document.createElement("article");
    card.className = "product-card combo-card";
    const itemsHtml = combo.items
      .map((i) => `<li>${i.quantity}× ${escapeHTML(i.product_name)}${i.flavor_name ? ` <span>(${escapeHTML(i.flavor_name)})</span>` : ""}</li>`)
      .join("");

    card.innerHTML = `
      <div class="product-card__media">
        <img src="${escapeHTML(combo.image)}" alt="${escapeHTML(combo.name)}" class="product-card__img" loading="lazy" />
      </div>
      <div class="product-card__info">
        <h3 class="product-card__name">${escapeHTML(combo.name)}</h3>
        ${combo.description ? `<p class="combo-card__desc">${escapeHTML(combo.description)}</p>` : ""}
        <ul class="combo-card__items">${itemsHtml}</ul>
        <div class="product-card__price-row">
          <span class="product-card__price-group">
            <span class="product-card__price">$${formatPrice(combo.price)}</span>
            ${hasOffer(combo) ? `<span class="product-card__price-old">$${formatPrice(combo.old_price)}</span><span class="product-card__discount">-${discountPercent(combo)}%</span>` : ""}
          </span>
        </div>
      </div>
      <div class="product-card__actions product-card__actions--catalog">
        <button class="product-card__btn product-card__btn--buy" type="button">Agregar a cotización</button>
      </div>
    `;

    card.querySelector(".product-card__btn--buy")?.addEventListener("click", () => {
      if (window.consultation?.hasItem?.(combo.id, "")) {
        window.consultation?.toast?.("Ese combo ya está en tu cotización");
        return;
      }
      window.consultation?.addItem?.(comboToQuoteProduct(combo), { quantity: 1 });
      window.consultation?.toast?.("Combo agregado a tu cotización");
    });

    combosList.appendChild(card);
  });

  window.javyIcons?.enhance?.(combosList);
}

async function initHomeCombos() {
  if (!combosList) return;
  try {
    const combos = await window.catalogDb.getCombos({ activeOnly: true });
    const flagged = combos.filter((c) => c.show_on_home);
    renderHomeCombos((flagged.length ? flagged : combos).slice(0, 8));
  } catch (error) {
    console.warn("No se pudieron cargar combos:", error.message);
    if (combosSection) combosSection.hidden = true;
  }
}

initHomeCombos();

// Carga el embed de Instagram (iframes pesados) solo cuando la sección de
// reels está por entrar en pantalla, en vez de bloquear la carga inicial.
function initInstagramLazyLoad() {
  const section = document.getElementById("educacion");
  if (!section) return;

  const loadEmbedScript = () => {
    if (document.querySelector('script[src*="instagram.com/embed.js"]')) return;
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.instagram.com/embed.js";
    document.body.appendChild(script);
  };

  if (!("IntersectionObserver" in window)) {
    loadEmbedScript();
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      loadEmbedScript();
      observer.disconnect();
    }
  }, { rootMargin: "400px 0px" });

  observer.observe(section);
}

initInstagramLazyLoad();

/* ============================================================================
   Compra por categoría + objetivos
   ----------------------------------------------------------------------------
   Antes la home no tenía ninguna puerta de entrada por categoría: el único
   acceso a las familias era entrar al catálogo y descubrir un carrusel
   horizontal. Estas dos secciones son ese atajo.
   ============================================================================ */
const homeCatsGrid = document.getElementById("home-cats__grid");
const homeGoalsRow = document.getElementById("home-goals__row");

// Icono por familia. La clave es el slug público (sin el prefijo "fam-").
const FAMILY_ICONS = {
  "proteinas": "dumbbell",
  "ganadores": "wheat",
  "creatina": "zap",
  "pre-entrenos": "flame",
  "aminoacidos": "pill",
  "quemadores": "flame",
  "energia": "zap",
  "potenciadores": "shield",
  "salud": "heart-pulse",
};

// Objetivos que se ofrecen como atajo, en el idioma del cliente. Hick: 6 y no
// los 30+ valores sueltos que hay en la base.
const HOME_GOALS = [
  { label: "Ganar masa", slug: "masa-muscular" },
  { label: "Definición", slug: "definicion" },
  { label: "Fuerza", slug: "fuerza" },
  { label: "Energía", slug: "energia" },
  { label: "Recuperación", slug: "recuperacion" },
  { label: "Salud general", slug: "salud-general" },
];

const familySlug = (category) =>
  String(category?.slug || "").replace(/^(fam|tipo)-/, "") || slugify(category?.name || "");

/* El icono se busca por coincidencia parcial y no exacta: con Supabase caído
   los slugs se derivan del texto ("creatinas", "proteinas-whey", "salud-y-
   bienestar") y no calzarían con las claves cortas del mapa. */
function iconForFamily(slug) {
  if (FAMILY_ICONS[slug]) return FAMILY_ICONS[slug];
  const key = Object.keys(FAMILY_ICONS).find((k) => slug.startsWith(k) || slug.includes(k));
  return key ? FAMILY_ICONS[key] : "package";
}

function categorySkeletons(n = 8) {
  return Array.from({ length: n }, () =>
    `<span class="home-cat home-cat--skeleton skeleton-box" aria-hidden="true"></span>`).join("");
}

async function initHomeCategories() {
  if (!homeCatsGrid) return;
  homeCatsGrid.innerHTML = categorySkeletons();

  let categories = [];
  let products = [];
  try {
    [categories, products] = await Promise.all([
      window.catalogDb.getCategories(),
      window.catalogDb.getProductsWithFlavors(),
    ]);
  } catch (error) {
    console.warn("No se pudieron cargar las categorías del inicio:", error.message);
  }

  // Con Supabase caído, getCategories() devuelve la lista plana de respaldo y
  // los productos locales no traen category_id: se agrupa por el texto de
  // categoría y se enlaza al catálogo con ?cat=, que ya entiende ese modo.
  // Mismo criterio que useHierarchy() en js/supplements.js.
  const usableHierarchy = categories.some((c) => c.id) && products.some((p) => p.category_id);
  if (!usableHierarchy) {
    renderHomeCategoriesFlat(products);
    renderHomeGoals(products);
    return;
  }

  const families = categories.filter((c) => !c.parent_id);
  if (!families.length) {
    // Sin datos, la sección entera se retira: mejor que dejar un hueco.
    document.getElementById("categorias")?.setAttribute("hidden", "");
    return;
  }

  // Cuenta los productos de la familia MÁS los de sus subcategorías: si solo
  // contara los directos, una familia bien repartida mostraría 0.
  const countFor = (fam) => {
    const childIds = new Set(
      categories.filter((c) => String(c.parent_id) === String(fam.id)).map((c) => String(c.id)),
    );
    return products.filter((p) => {
      const own = String(p.category_id);
      return own === String(fam.id) || childIds.has(own);
    }).length;
  };

  const cards = families
    .map((fam) => ({ fam, count: countFor(fam), slug: familySlug(fam) }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(({ fam, count, slug }) => `
      <a class="home-cat" href="/categoria/${encodeURIComponent(slug)}/"
         aria-label="${escapeHTML(`${fam.name}, ${count} producto${count === 1 ? "" : "s"}`)}">
        <span class="home-cat__icon" aria-hidden="true" data-javy-icon="${escapeHTML(iconForFamily(slug))}"></span>
        <span class="home-cat__name">${escapeHTML(fam.name)}</span>
        <span class="home-cat__count">${count} producto${count === 1 ? "" : "s"}</span>
      </a>`);

  if (!cards.length) {
    document.getElementById("categorias")?.setAttribute("hidden", "");
    return;
  }

  homeCatsGrid.innerHTML = cards.join("");
  window.javyIcons?.enhance?.(homeCatsGrid);

  renderHomeGoals(products);
}

/* Respaldo sin jerarquía: agrupa por el texto `category` de cada producto y
   enlaza al catálogo filtrado (?cat=), no a /categoria/<slug>/, porque esas
   páginas se generan desde las familias de Supabase y acá no las tenemos. */
function renderHomeCategoriesFlat(products) {
  const counts = new Map();
  products.forEach((p) => {
    const label = (p.category || p.categoria || "").trim();
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  const cards = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, count]) => {
      const slug = slugify(label);
      return `
      <a class="home-cat" href="/supplements-page.html?cat=${encodeURIComponent(slug)}"
         aria-label="${escapeHTML(`${label}, ${count} producto${count === 1 ? "" : "s"}`)}">
        <span class="home-cat__icon" aria-hidden="true" data-javy-icon="${escapeHTML(iconForFamily(slug))}"></span>
        <span class="home-cat__name">${escapeHTML(label)}</span>
        <span class="home-cat__count">${count} producto${count === 1 ? "" : "s"}</span>
      </a>`;
    });

  if (!cards.length) {
    document.getElementById("categorias")?.setAttribute("hidden", "");
    return;
  }
  homeCatsGrid.innerHTML = cards.join("");
  window.javyIcons?.enhance?.(homeCatsGrid);
}

// Los chips de objetivo solo aparecen si el objetivo existe en el catálogo:
// un atajo que lleva a cero resultados es peor que no ofrecerlo.
function renderHomeGoals(products) {
  if (!homeGoalsRow) return;

  const available = new Set(
    products.flatMap((p) => (p.goals || []).map((g) => slugify(g))),
  );
  const chips = HOME_GOALS.filter((goal) => available.has(goal.slug));
  if (!chips.length) return;

  homeGoalsRow.innerHTML = chips.map((goal) => `
    <a class="home-goal" href="/supplements-page.html?obj=${encodeURIComponent(goal.slug)}">
      ${escapeHTML(goal.label)}
    </a>`).join("");
  document.getElementById("objetivos")?.removeAttribute("hidden");
}

initHomeCategories();
