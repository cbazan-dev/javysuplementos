const lista = document.getElementById("top-products__list");
const heroProductsBtn = document.querySelector(".hero__button--pri");
const heroAdvisorBtn = document.querySelector(".hero__button--sec");

// Devuelve el símbolo incluido: si se deja fuera, en la plantilla, un producto
// sin precio renderiza el literal "$Consultar".
function formatPrice(price) {
  const value = Number(price || 0);
  return value > 0 ? `$${value.toFixed(2)}` : "Consultar";
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

/* El badge "Destacado" de la card. El catálogo y la ficha de producto lo pintan
   con `featured` a secas; en la home vale también `show_on_home` porque los dos
   campos viven desincronizados en la base: hay productos curados en el inicio
   con `featured` en false, y sin esto la sección salía con unas cards con badge
   y otras sin, sin ninguna diferencia visible para el cliente. Estar curado en
   el inicio ES ser destacado. */
function isFeatured(product) {
  return product?.featured === true || product?.show_on_home === true;
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

  // COPIA PENDIENTE DE MIGRAR: la card canónica vive en js/product-card.js
  // (window.javyProductCard.render). Si tocas la card, tócala también allá.
  productos.forEach((product) => {
    const canQuote = productCanBeQuoted(product);
    const card = document.createElement("article");
    card.classList.add("product-card");
    if (product.imagenPendiente) card.classList.add("product-card--image-pending");

    const detailUrl = window.javyProductUrl?.forProduct?.(product) || `product-page.html?id=${encodeURIComponent(product.id)}`;
    card.innerHTML = `
      <a class="product-card__media product-card__media-link" href="${detailUrl}" aria-label="Ver ${escapeHTML(product.name)}">
        ${isFeatured(product) ? '<span class="product-card__badge">Destacado</span>' : ""}
        <img src="${escapeHTML(product.image)}" alt="${escapeHTML(product.name)}" class="product-card__img" loading="lazy" />
      </a>

      <div class="product-card__info">
        <div class="product-card__meta">
          <span class="product-card__brand">${escapeHTML(product.brand || "Marca en revision")}</span>
          <span class="product-card__status ${canQuote ? "is-available" : "is-agotado"}">
            ${canQuote ? "Disponible" : "Agotado"}
          </span>
        </div>
        ${cardCategoryMarkup(product)}
        <h3 class="product-card__name"><a class="product-card__name-link" href="${detailUrl}">${escapeHTML(product.name)}</a></h3>
        <div class="product-card__price-row">
          <span class="product-card__price-group">
            <span class="product-card__price">${formatPrice(product.price)}</span>
            ${hasOffer(product) ? `<span class="product-card__price-old">${formatPrice(product.old_price)}</span><span class="product-card__discount">-${discountPercent(product)}%</span>` : ""}
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

let homeCardCategories = [];

function cardCategoryMarkup(product) {
  const parts = window.javyCardCategory?.formatParts(product, homeCardCategories);
  const family = parts?.family || product.category || product.categoria || "";
  if (!family) return "";
  const type = parts?.type
    ? `<span class="product-card__category-sep">›</span><span class="product-card__category-type">${escapeHTML(parts.type)}</span>`
    : "";
  return `<span class="product-card__category"><span class="product-card__category-family">${escapeHTML(family)}</span>${type}</span>`;
}

if (heroProductsBtn) {
  heroProductsBtn.addEventListener("click", () => {
    // El CSS ya respeta prefers-reduced-motion (styles.css), pero el behavior
    // en JS lo pisa: hay que consultarlo aquí también.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("productos")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });
}

if (heroAdvisorBtn) {
  heroAdvisorBtn.addEventListener("click", () => {
    window.consultation?.openPanel?.();
  });
}

async function initHomeProducts() {
  if (!lista) return;
  const fallbackProducts = getHomeFallbackProducts();
  if (fallbackProducts.length) renderFeaturedProducts(fallbackProducts);

  try {
    const [homeProducts, categories] = await Promise.all([
      window.catalogDb.getHomeProducts(),
      window.catalogDb.getCategories(),
    ]);
    homeCardCategories = categories;
    renderFeaturedProducts(homeProducts);
  } catch (error) {
    console.warn("No se pudieron cargar productos del inicio:", error.message);
  }
}

initHomeProducts();


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

/* Objetivos que se ofrecen como atajo, en el idioma del cliente (etiqueta
   corta) y no con los 30+ valores sueltos que hay en la base.

   `slugs` son los valores REALES del catálogo que caen bajo esa etiqueta. Hacen
   falta porque no coinciden con el nombre corto: la base guarda "Ganar masa",
   "Fuerza y rendimiento" y "Energía y enfoque", así que un único slug corto
   ("fuerza", "energia", "masa-muscular") no matcheaba nada y de los 6 chips
   solo aparecían 3. El enlace manda todos los que sí existen separados por
   coma, que es como el catálogo espera un OR dentro de la faceta (?obj=).

   El vocabulario canónico son los 8 objetivos de
   supabase/migrations/fase8-taxonomia.sql, que el panel admin ofrece en
   GOAL_SUGGESTIONS (js/admin/config.js). Los sinónimos que quedan acá
   ("masa-muscular", "fuerza", "energia"…) son red de seguridad: hasta hoy el
   panel los reintroducía, y aunque ya no puede, un producto viejo o un UPDATE
   a mano podría traerlos de vuelta. */
const HOME_GOALS = [
  { label: "Ganar masa", icon: "dumbbell", slugs: ["ganar-masa", "ganar-masa-muscular", "masa-muscular"] },
  { label: "Definición", icon: "flame", slugs: ["definicion"] },
  { label: "Fuerza", icon: "shield", slugs: ["fuerza-y-rendimiento", "fuerza", "rendimiento"] },
  { label: "Energía", icon: "zap", slugs: ["energia-y-enfoque", "energia", "energia-y-foco"] },
  { label: "Recuperación", icon: "heart-pulse", slugs: ["recuperacion"] },
  { label: "Descanso", icon: "moon", slugs: ["descanso-y-estres", "descanso", "sueno"] },
  { label: "Salud general", icon: "leaf", slugs: ["salud-general", "salud"] },
  { label: "Belleza", icon: "pill", slugs: ["belleza", "piel-cabello-y-unas"] },
];

// Marcas del muro de cierre de la home. 8 y no las 30+ del catálogo: es un
// bloque de confianza, no un índice. El resto vive en el filtro del catálogo.
const HOME_BRANDS_LIMIT = 8;

/* Las páginas /categoria/<slug>/ las genera scripts/generate-pages.mjs con un
   slug derivado del NOMBRE (slugTokens), no de la columna `slug` de Supabase
   (que usa prefijos fam-/tipo- y no coincide, ej. "fam-salud" -> "salud" en
   vez de "salud-y-bienestar"). Hay que usar el mismo criterio acá o el link
   apunta a una página que no existe. */
const familySlug = (category) => slugify(category?.name || "");

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

function getLocalFallbackProducts() {
  if (typeof PRODUCT_LIST === "undefined") return [];
  return PRODUCT_LIST
    .map((product) => ({
      ...product,
      name: product.nombre,
      brand: product.marca,
      category: product.categoria,
      price: product.precio,
      presentation: product.presentacion,
      image: product.imagen || "img/products/product-placeholder.svg",
      available: product.disponible !== false,
      featured: product.destacado === true,
      show_on_home: product.destacado === true,
      goals: product.objetivos || [],
      flavors: (product.sabores || []).map((flavor, index) => ({
        id: `home-local-${product.id}-${index}-${slugify(flavor)}`,
        name: flavor,
        available: true,
      })),
    }));
}

function getHomeFallbackProducts() {
  return getLocalFallbackProducts()
    .filter((product) => product.featured)
    .slice(0, 8);
}

async function initHomeCategories() {
  if (!homeCatsGrid) return;
  const fallbackProducts = getLocalFallbackProducts();
  if (fallbackProducts.length) {
    renderHomeCategoriesFlat(fallbackProducts);
    renderHomeGoals(fallbackProducts);
    renderHomeBrands(fallbackProducts);
  } else {
    homeCatsGrid.innerHTML = categorySkeletons();
  }

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
    renderHomeBrands(products);
    return;
  }

  const families = categories.filter((c) => !c.parent_id);
  if (!families.length) {
    // Sin datos, la sección entera se retira: mejor que dejar un hueco. Los
    // objetivos y las marcas sí se pintan: no dependen de la jerarquía.
    document.getElementById("categorias")?.setAttribute("hidden", "");
    renderHomeGoals(products);
    renderHomeBrands(products);
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
    renderHomeGoals(products);
    renderHomeBrands(products);
    return;
  }

  homeCatsGrid.innerHTML = cards.join("");
  window.javyIcons?.enhance?.(homeCatsGrid);

  renderHomeGoals(products);
  renderHomeBrands(products);
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
      <a class="home-cat" href="/catalogo/?cat=${encodeURIComponent(slug)}"
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

/* Los chips de objetivo solo aparecen si el objetivo existe en el catálogo: un
   atajo que lleva a cero resultados es peor que no ofrecerlo. Cada chip lleva
   además el conteo, que es lo que convierte una etiqueta en información (mismo
   criterio que las cards de categoría). */
function renderHomeGoals(products) {
  if (!homeGoalsRow) return;

  const goalSlugsOf = (p) => (p.goals || p.objetivos || []).map((g) => slugify(g));

  const chips = HOME_GOALS
    .map((goal) => {
      const wanted = new Set(goal.slugs);
      const matched = new Set();
      let count = 0;
      products.forEach((p) => {
        const hits = goalSlugsOf(p).filter((slug) => wanted.has(slug));
        if (!hits.length) return;
        count += 1;
        hits.forEach((slug) => matched.add(slug));
      });
      // Se conserva el orden declarado en HOME_GOALS para que el enlace sea
      // estable entre cargas (y no dependa del orden de los productos).
      return { ...goal, count, slugs: goal.slugs.filter((slug) => matched.has(slug)) };
    })
    .filter((goal) => goal.count > 0);

  if (!chips.length) return;

  homeGoalsRow.innerHTML = chips.map((goal) => `
    <a class="home-goal" href="/catalogo/?obj=${encodeURIComponent(goal.slugs.join(","))}"
       aria-label="${escapeHTML(`${goal.label}, ${goal.count} producto${goal.count === 1 ? "" : "s"}`)}">
      <span class="home-goal__icon" aria-hidden="true" data-javy-icon="${escapeHTML(goal.icon)}"></span>
      <span class="home-goal__label">${escapeHTML(goal.label)}</span>
      <span class="home-goal__count" aria-hidden="true">${goal.count}</span>
    </a>`).join("");
  window.javyIcons?.enhance?.(homeGoalsRow);
  document.getElementById("objetivos")?.removeAttribute("hidden");
}

/* Muro de marcas del bloque de cierre. Sale del catálogo real (no de una lista
   escrita a mano) para que no anuncie marcas que ya no se venden, y cada una
   enlaza al catálogo filtrado por esa marca (?marca=). */
function renderHomeBrands(products) {
  const grid = document.getElementById("home-brands__grid");
  if (!grid) return;

  const counts = new Map();
  products.forEach((p) => {
    const brand = (p.brand || p.marca || "").trim();
    if (!brand) return;
    counts.set(brand, (counts.get(brand) || 0) + 1);
  });

  const brands = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .slice(0, HOME_BRANDS_LIMIT);

  // El muro nace oculto (atributo hidden en el HTML) y solo se muestra si hay
  // marcas que pintar: sin JS, con Supabase caído o con el catálogo vacío, la
  // prosa se queda sola a una columna en vez de dejar una caja vacía al lado.
  if (!brands.length) return;

  grid.innerHTML = brands.map(([brand, count]) => `
    <a class="home-brand" href="/catalogo/?marca=${encodeURIComponent(slugify(brand))}"
       aria-label="${escapeHTML(`${brand}, ${count} producto${count === 1 ? "" : "s"}`)}">
      <span class="home-brand__name">${escapeHTML(brand)}</span>
      <span class="home-brand__count" aria-hidden="true">${count} producto${count === 1 ? "" : "s"}</span>
    </a>`).join("");
  grid.closest(".home-about__brands")?.removeAttribute("hidden");
  document.getElementById("marcas")?.classList.add("home-about--with-brands");
}

initHomeCategories();
