#!/usr/bin/env node
/* ============================================================================
   Genera las páginas estáticas del catálogo DESDE Supabase:

     producto/<slug>/index.html    una por producto activo
     categoria/<slug>/index.html   una por familia/tipo con productos
     js/product-urls.js            mapa id -> slug que usa el sitio
     sitemap.xml                   con todas las URLs + lastmod

   Por qué existe: hasta ahora las fichas vivían en product-page.html?id=<uuid>
   y se armaban 100% en el cliente, así que Google indexaba 4 URLs y los
   scrapers de WhatsApp/Facebook (que no ejecutan JS) mostraban el título
   genérico al compartir un producto. Estas páginas llevan title, meta
   description, Open Graph y JSON-LD ya escritos en el HTML servido.

   Uso:
     node scripts/generate-pages.mjs             # lee Supabase y escribe todo
     node scripts/generate-pages.mjs --dry-run   # solo resumen, no escribe
     node scripts/generate-pages.mjs --input datos.json
         # usa un JSON local en vez de Supabase (para entornos sin salida de red).
         # Formato: { "products": [...], "categories": [...] }

   Las páginas siguen siendo interactivas: cargan los mismos CSS/JS que
   product-page.html y se hidratan con los datos frescos de Supabase. Lo que
   cambia es que el HTML inicial ya trae el contenido indexable.
   ============================================================================ */
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildSlugMap, productPath, categoryPath, categoryFilterSlug, slugTokens } from "./lib/product-slug.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://javysuplementos.com";
const DRY_RUN = process.argv.includes("--dry-run");
const INPUT_INDEX = process.argv.indexOf("--input");
const INPUT_FILE = INPUT_INDEX > -1 ? process.argv[INPUT_INDEX + 1] : null;

const DEFAULT_IMAGE = `${SITE}/img/icons/javy-web-app-icon-1024.png`;
const PLACEHOLDER_IMAGE = "/img/products/product-placeholder.svg";

// Una categoría con uno o dos productos es contenido pobre para Google: no
// compite por nada y diluye el sitio. Esas quedan cubiertas por el catálogo.
const MIN_PRODUCTS_PER_CATEGORY = 3;

// URLs de subcategoría que se publicaron antes de acotar las páginas a
// familias. Se mantienen como redirección permanente hacia su familia para no
// devolver 404 a lo que ya está indexado. Mapea slug viejo -> nombre de familia.
const LEGACY_CATEGORY_REDIRECTS = {
  // Subcategorías que llegaron a tener página propia.
  "whey": "Proteínas",
  "iso-aislada": "Proteínas",
  "mass-gainer": "Ganadores de Peso",
  // Familias cuyo slug cambió al fusionar Energía dentro de Pre-entrenos
  // (fase8-taxonomia.sql): el slug sale del nombre, y el nombre cambió.
  "pre-entrenos": "Pre-entrenos y energía",
  "energia-y-rendimiento": "Pre-entrenos y energía",
};

/* ------------------------------- utilidades ------------------------------ */

function escapeHTML(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// El JSON-LD va dentro de <script>: hay que neutralizar "</script>" y los
// separadores de línea U+2028/U+2029, que rompen el parseo del navegador.
function jsonForScript(data) {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Las imágenes pueden venir como ruta local ("img/products/x.webp") o como URL
// absoluta del Storage de Supabase: solo las primeras llevan "/" delante.
function assetSrc(path) {
  const value = String(path || PLACEHOLDER_IMAGE);
  if (/^https?:\/\//i.test(value)) return value;
  return "/" + value.replace(/^\/+/, "");
}

function absoluteUrl(path) {
  if (!path) return DEFAULT_IMAGE;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE}/${String(path).replace(/^\/+/, "")}`;
}

function toList(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    return value.split(/\r?\n/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function productPrice(row) {
  if (row.price != null && row.price !== "") return Number(row.price);
  if (row.precio_centavos != null) return Number(row.precio_centavos) / 100;
  return 0;
}

function isAvailable(row) {
  return row.available !== false && row.is_available !== false && row.is_active !== false;
}

/* --------------------------------- datos --------------------------------- */

async function readSupabaseConfig() {
  const txt = await readFile(join(ROOT, "js/supabase-config.js"), "utf8");
  const url = txt.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
  const key = txt.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"/)?.[1];
  if (!url || !key) throw new Error("No pude leer SUPABASE_URL / KEY de js/supabase-config.js");
  return { url, key };
}

async function sb(path, { url, key }) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function loadData() {
  if (INPUT_FILE) {
    const raw = JSON.parse(await readFile(INPUT_FILE, "utf8"));
    return { products: raw.products || [], categories: raw.categories || [] };
  }
  const cfg = await readSupabaseConfig();
  const [products, categories] = await Promise.all([
    sb("products?select=*&order=name.asc", cfg),
    sb("categories?select=*&order=sort_order.asc", cfg),
  ]);
  return { products, categories };
}

/* ------------------------------- plantillas ------------------------------ */

// Head compartido. Las rutas van absolutas porque estas páginas viven en
// subdirectorios (/producto/<slug>/), donde las relativas de la raíz romperían.
function renderHead({ title, description, canonical, image, ogType, jsonLd, extraCss }) {
  const css = [
    "css/styles.css?v=fase2-ui",
    "css/components/nav.css?v=cat-nav",
    "css/components/auth.css?v=session-state",
    "css/tokens.css?v=fase2-ui",
    "css/components/cart.css?v=fase2-ui",
    "css/components/cards.css?v=fase2-ui",
    "css/dropdown.css?v=4",
    ...(extraCss || []),
  ];

  return `    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />

    <!-- Seguridad: CSP baseline versionada. El enforce real + frame-ancestors lo aplica Cloudflare (ver docs/seguridad-cloudflare.md). -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://fodwjfiyfmscklqsqrip.supabase.co; connect-src 'self' https://cdn.jsdelivr.net https://fodwjfiyfmscklqsqrip.supabase.co wss://fodwjfiyfmscklqsqrip.supabase.co https://cloudflareinsights.com" />
    <title>${escapeHTML(title)}</title>

    <!-- SEO -->
    <meta name="description" content="${escapeHTML(description)}">
    <link rel="canonical" href="${escapeHTML(canonical)}">

    <!-- Open Graph -->
    <meta property="og:type" content="${escapeHTML(ogType)}">
    <meta property="og:url" content="${escapeHTML(canonical)}">
    <meta property="og:title" content="${escapeHTML(title)}">
    <meta property="og:description" content="${escapeHTML(description)}">
    <meta property="og:image" content="${escapeHTML(image)}">
    <meta property="og:locale" content="es_PA">
    <meta property="og:site_name" content="Javy Suplementos">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHTML(title)}">
    <meta name="twitter:description" content="${escapeHTML(description)}">
    <meta name="twitter:image" content="${escapeHTML(image)}">

    <script type="application/ld+json">${jsonLd}</script>

    <link rel="icon" type="image/png" sizes="32x32" href="/img/icons/javy-favicon-32x32.png?v=2" />
    <link rel="icon" type="image/png" sizes="any" href="/img/icons/javy-favicon-cejas-color-correcto-1024.png?v=2" />
    <link rel="apple-touch-icon" href="/img/icons/javy-app-icon-ios-ipados-1024.png?v=2" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="theme-color" content="#050709" />
${css.map((href) => `    <link rel="stylesheet" href="/${href}" />`).join("\n")}

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="preconnect" href="https://fodwjfiyfmscklqsqrip.supabase.co" />
    <link rel="preconnect" href="https://cdn.jsdelivr.net" />
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet">`;
}

const COMMON_SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "/js/supabase-config.js",
  "/js/whatsapp-config.js?v=central-links",
  "/js/product-data.js",
  "/js/product-urls.js?v=seo-urls",
  "/js/db.js?v=no-img-fallback",
  "/js/auth.js?v=session-state",
  "/js/icons.js?v=cat-icons",
  "/js/dropdown.js?v=4",
  "/js/cart.js?v=fase2-ui",
];

function renderScripts(extra = []) {
  return [...COMMON_SCRIPTS, ...extra, "/js/include-nav.js?v=cat-nav"]
    .map((src) => `    <script src="${src}" defer></script>`)
    .join("\n");
}

/* ---------------------------- página de producto -------------------------- */

function renderProductPage(product, ctx) {
  const { slug, familyName, familySlug, typeName } = ctx;
  // Etiqueta de categoría visible: la subcategoría es más precisa cuando existe.
  const categoryName = typeName || familyName;
  const url = `${SITE}${productPath(slug)}`;
  const name = product.name || product.nombre || "Producto";
  const brand = product.brand || "";
  const presentation = product.presentation || "";
  const price = productPrice(product);
  const available = isAvailable(product);
  const image = absoluteUrl(product.image_url || product.imagen_url);
  const imageSrc = product.image_url || product.imagen_url || PLACEHOLDER_IMAGE;

  const shortDescription = String(product.description_short || product.subtitulo || "").trim();
  const description = shortDescription
    || `${name}${brand ? ` de ${brand}` : ""}${presentation ? ` (${presentation})` : ""}. Cotizá por WhatsApp con Javy Suplementos en Panamá.`;

  const title = `${name}${brand && !name.toLowerCase().includes(brand.toLowerCase()) ? ` ${brand}` : ""} | Javy Suplementos`;

  const longDescription = toList(product.description_long || product.description || product.descripcion);
  const benefits = toList(product.beneficios);
  const usage = toList(product.uso);

  const jsonLd = jsonForScript({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name,
        image,
        description,
        url,
        ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
        ...(price > 0
          ? {
              offers: {
                "@type": "Offer",
                price: price.toFixed(2),
                priceCurrency: "USD",
                availability: available
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
                url,
                seller: { "@type": "Organization", name: "Javy Suplementos" },
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Catálogo", item: `${SITE}/supplements-page.html` },
          ...(familySlug
            ? [{ "@type": "ListItem", position: 2, name: familyName, item: `${SITE}${categoryPath(familySlug)}` }]
            : []),
          ...(familySlug && typeName ? [{ "@type": "ListItem", position: 3, name: typeName }] : []),
          { "@type": "ListItem", position: (familySlug ? 2 : 1) + (typeName && familySlug ? 2 : 1), name, item: url },
        ],
      },
    ],
  });

  const priceText = price > 0 ? `$${price.toFixed(2)}` : "Consultar precio";
  const categoryLink = familySlug
    ? `<a href="${categoryPath(familySlug)}">${escapeHTML(familyName)}</a>${typeName ? ` · ${escapeHTML(typeName)}` : ""}`
    : escapeHTML(categoryName);

  // Breadcrumb de 3 tramos: Catálogo / Familia (enlazada) / Subcategoría. Sin
  // esto la ficha era un callejón sin salida: mostraba "Whey" como texto plano,
  // sin camino de vuelta a todas las proteínas.
  // `data-breadcrumb-family` le avisa a js/product-page.js que este tramo ya
  // está escrito, para que la hidratación no inserte un duplicado.
  const breadcrumbTrail = familySlug
    ? `
          <a href="${categoryPath(familySlug)}" data-breadcrumb-family>${escapeHTML(familyName)}</a>${typeName
        ? `
          <span class="pdp__breadcrumb-sep">/</span>
          <span id="pdp-breadcrumb-cat">${escapeHTML(typeName)}</span>`
        : ""}`
    : `
          <span id="pdp-breadcrumb-cat">${escapeHTML(categoryName)}</span>`;

  return `<!DOCTYPE html>
<html lang="es">
  <head>
${renderHead({ title, description, canonical: url, image, ogType: "product", jsonLd, extraCss: ["css/pages/product.css?v=cat-nav"] })}
${renderScripts(["/js/product-page.js?v=cat-nav"])}
  </head>
  <body>
    <div id="site-header"></div>
    <main class="pdp" data-product-id="${escapeHTML(String(product.id))}">
      <div class="pdp__container">

        <nav class="pdp__breadcrumb" aria-label="Ruta de navegación">
          <a href="/supplements-page.html">Catálogo</a>
          <span class="pdp__breadcrumb-sep">/</span>${breadcrumbTrail}
        </nav>

        <div class="pdp__layout">

          <figure class="pdp__media">
            <img id="prod-image" class="pdp__img" src="${escapeHTML(assetSrc(imageSrc))}" alt="${escapeHTML(name)}" width="360" height="350" />
          </figure>

          <section class="pdp__info" aria-labelledby="prod-title">
            <div class="pdp__eyebrow">
              <p class="pdp__context">
                <span id="prod-category-label">${escapeHTML(categoryName)}</span>
                <span class="pdp__context-sep" aria-hidden="true"${presentation ? "" : " hidden"}>·</span>
                <span id="prod-presentation"${presentation ? "" : " hidden"}>${escapeHTML(presentation)}</span>
              </p>
              <span class="pdp__status${available ? "" : " is-agotado"}" data-status-pill>${available ? "Disponible" : "Agotado"}</span>
            </div>

            <p id="prod-brand-label" class="pdp__brand">${escapeHTML(brand || "Marca por confirmar")}</p>
            <h1 id="prod-title" class="pdp__title">${escapeHTML(name)}</h1>
            <p id="prod-subtitle" class="pdp__subtitle"${shortDescription ? "" : " hidden"}>${escapeHTML(shortDescription)}</p>
            <p id="prod-price" class="pdp__price">${escapeHTML(priceText)}</p>

            <dl class="pdp__data">
              <div>
                <dt>Marca</dt>
                <dd id="prod-brand">${escapeHTML(brand || "Por confirmar")}</dd>
              </div>
              <div>
                <dt>Categoría</dt>
                <dd id="prod-category">${categoryLink}</dd>
              </div>
            </dl>

            <div class="pdp__selectors">
              <div class="pdp__field">
                <label class="pdp__label" for="prod-flavor-select">Sabores</label>
                <div id="prod-flavors"></div>
              </div>
              <div class="pdp__field pdp__field--quantity">
                <span class="pdp__label">Cantidad</span>
                <div class="pdp__stepper" role="group" aria-label="Cantidad">
                  <button type="button" class="pdp__qty-btn" data-qty-dec aria-label="Disminuir">−</button>
                  <span class="pdp__qty-value" data-qty-value aria-live="polite">1</span>
                  <button type="button" class="pdp__qty-btn pdp__qty-btn--plus" data-qty-inc aria-label="Aumentar">+</button>
                </div>
              </div>
            </div>

            <p class="pdp__added-note" data-added-note hidden></p>

            <p class="pdp__hint">Selecciona sabor y cantidad antes de agregarlo a la cotización.</p>

            <button id="prod-add-consultation" type="button" class="pdp__cta" data-add-cta data-primary-cta>
              Agregar a cotización
            </button>
          </section>

          <section class="pdp__details" aria-labelledby="pdp-details-heading"${longDescription.length || benefits.length || usage.length ? "" : " hidden"}>
            <div class="pdp__details-head">
              <p class="pdp__details-kicker">Conocé el producto</p>
              <h2 id="pdp-details-heading" class="pdp__details-title">Información completa</h2>
            </div>

            <div class="pdp__details-grid">
              <section class="pdp__content-section pdp__content-section--description" data-content-section="description" aria-labelledby="pdp-description-heading"${longDescription.length ? "" : " hidden"}>
                <h3 id="pdp-description-heading">Descripción</h3>
                <div id="tab-descripcion" class="pdp__prose">${longDescription.map((t) => `<p>${escapeHTML(t)}</p>`).join("")}</div>
              </section>

              <section class="pdp__content-section" data-content-section="benefits" aria-labelledby="pdp-benefits-heading"${benefits.length ? "" : " hidden"}>
                <h3 id="pdp-benefits-heading">Beneficios</h3>
                <div id="tab-beneficios" class="pdp__benefits">${benefits.map((t) => `<div class="pdp__benefit">${escapeHTML(t)}</div>`).join("")}</div>
              </section>

              <section class="pdp__content-section" data-content-section="usage" aria-labelledby="pdp-usage-heading"${usage.length ? "" : " hidden"}>
                <h3 id="pdp-usage-heading">Cómo usar</h3>
                <ol id="tab-uso" class="pdp__usage">${usage.map((t) => `<li>${escapeHTML(t)}</li>`).join("")}</ol>
              </section>
            </div>
          </section>
        </div>

        <!-- Lo rellena js/product-page.js con productos de la misma familia. -->
        <section class="pdp__related" id="pdp-related" aria-labelledby="pdp-related-title" hidden>
          <div class="pdp__related-head">
            <h2 class="pdp__related-title" id="pdp-related-title"></h2>
            <a class="pdp__related-link" id="pdp-related-link" href="/supplements-page.html">Ver todos</a>
          </div>
          <div class="pdp__related-grid" id="pdp-related-grid"></div>
        </section>

        <aside class="pdp__bar" aria-label="Acciones de compra" aria-hidden="true">
          <div class="pdp__bar-info">
            <span class="pdp__bar-strong pdp__bar-price" id="pdp-bar-price">${escapeHTML(priceText)}</span>
            <span class="pdp__bar-sub">
              <span data-bar-units>1 unidad</span>
              <span class="pdp__bar-flavornote" data-bar-flavor> · sabor por elegir</span>
            </span>
          </div>
          <button type="button" class="pdp__cta pdp__bar-cta" data-add-cta>Agregar a cotización</button>
        </aside>

      </div>
    </main>
  </body>
</html>
`;
}

/* --------------------------- página de categoría -------------------------- */

/* Página de redirección para una URL de categoría retirada. GitHub Pages no
   permite 301 reales, así que se combina canonical + refresh + un enlace
   visible por si el navegador bloquea el refresh. */
function renderCategoryRedirect(oldSlug, familySlug, familyName) {
  const target = categoryPath(familySlug);
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHTML(familyName)} | Javy Suplementos</title>
    <link rel="canonical" href="${SITE}${target}" />
    <meta name="robots" content="noindex, follow" />
    <meta http-equiv="refresh" content="0; url=${target}" />
  </head>
  <body>
    <p>Esta categoría ahora vive en <a href="${target}">${escapeHTML(familyName)}</a>.</p>
  </body>
</html>
`;
}

function renderCategoryPage(category, products, slugMap, categorySlug, types = []) {
  const url = `${SITE}${categoryPath(categorySlug)}`;
  const name = category.name || "Categoría";
  const title = `${name} en Panamá | Javy Suplementos`;
  const description = `${name}: ${products.length} producto${products.length === 1 ? "" : "s"} original${products.length === 1 ? "" : "es"} con precio. Armá tu cotización y enviala por WhatsApp con Javy Suplementos.`;
  const image = absoluteUrl(products[0]?.image_url || products[0]?.imagen_url);

  const jsonLd = jsonForScript({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: title,
        description,
        url,
      },
      {
        "@type": "ItemList",
        name,
        numberOfItems: products.length,
        itemListElement: products.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          item: {
            "@type": "Product",
            name: p.name || p.nombre,
            image: absoluteUrl(p.image_url || p.imagen_url),
            url: `${SITE}${productPath(slugMap.get(String(p.id)))}`,
            ...(p.brand ? { brand: { "@type": "Brand", name: p.brand } } : {}),
            ...(productPrice(p) > 0
              ? {
                  offers: {
                    "@type": "Offer",
                    price: productPrice(p).toFixed(2),
                    priceCurrency: "USD",
                    availability: isAvailable(p)
                      ? "https://schema.org/InStock"
                      : "https://schema.org/OutOfStock",
                  },
                }
              : {}),
          },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Catálogo", item: `${SITE}/supplements-page.html` },
          { "@type": "ListItem", position: 2, name, item: url },
        ],
      },
    ],
  });

  // Segundo nivel: las subcategorías con productos se ofrecen como filtro del
  // catálogo. Reutiliza `.catalog-filter`, el mismo chip que el usuario ya vio
  // en el catálogo, para que reconozca el patrón en vez de aprender otro.
  const famFilter = categoryFilterSlug(category);
  const typeChips = types.length
    ? `
      <nav class="catalog-filters catalog-filters--types" aria-label="Filtrar ${escapeHTML(name)} por tipo">
${types
        .map(({ category: type, count }) => `        <a class="catalog-filter catalog-filter--type" href="/supplements-page.html?fam=${encodeURIComponent(famFilter)}&amp;tipo=${encodeURIComponent(categoryFilterSlug(type))}" aria-label="${escapeHTML(`${type.name}, ${count} producto${count === 1 ? "" : "s"}`)}">${escapeHTML(type.name)}<span class="catalog-filter__count" aria-hidden="true">${count}</span></a>`)
        .join("\n")}
      </nav>
`
    : "";

  const cards = products
    .map((p) => {
      const productSlug = slugMap.get(String(p.id));
      const price = productPrice(p);
      const priceText = price > 0 ? `$${price.toFixed(2)}` : "Consultar";
      const img = p.image_url || p.imagen_url || PLACEHOLDER_IMAGE;
      return `        <article class="product-card">
          <a class="product-card__media product-card__media-link" href="${productPath(productSlug)}" aria-label="Ver ${escapeHTML(p.name || p.nombre)}">
            <img src="${escapeHTML(assetSrc(img))}" alt="${escapeHTML(p.name || p.nombre)}" class="product-card__img" loading="lazy" decoding="async" />
          </a>
          <div class="product-card__info">
            <div class="product-card__meta">
              <span class="product-card__brand">${escapeHTML(p.brand || "Marca en revisión")}</span>
              <span class="product-card__status ${isAvailable(p) ? "is-available" : "is-agotado"}">${isAvailable(p) ? "Disponible" : "Agotado"}</span>
            </div>
            <h2 class="product-card__name"><a class="product-card__name-link" href="${productPath(productSlug)}">${escapeHTML(p.name || p.nombre)}</a></h2>
            <div class="product-card__price-row">
              <span class="product-card__price-group"><span class="product-card__price">${escapeHTML(priceText)}</span></span>
            </div>
          </div>
        </article>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
  <head>
${renderHead({ title, description, canonical: url, image, ogType: "website", jsonLd })}
${renderScripts()}
  </head>
  <body>
    <div id="site-header"></div>
    <main class="catalog-page">
      <nav class="pdp__breadcrumb" aria-label="Ruta de navegación">
        <a href="/supplements-page.html">Catálogo</a>
        <span class="pdp__breadcrumb-sep">/</span>
        <span>${escapeHTML(name)}</span>
      </nav>

      <section class="catalog-hero">
        <p class="catalog-hero__eyebrow">Categoría</p>
        <h1 class="catalog-hero__title">${escapeHTML(name)} en Panamá</h1>
        <p class="catalog-hero__text">
          ${products.length} producto${products.length === 1 ? "" : "s"} original${products.length === 1 ? "" : "es"} en stock con precio de catálogo.
          Agregá lo que te interese y enviá tu cotización por WhatsApp para confirmar disponibilidad.
        </p>
        <p><a class="catalog-hero__link" href="/supplements-page.html">Ver el catálogo completo con filtros</a></p>
      </section>
${typeChips}

      <section class="top-products__list" aria-label="Productos de ${escapeHTML(name)}">
${cards}
      </section>
    </main>
  </body>
</html>
`;
}

/* --------------------------------- salida -------------------------------- */

function renderProductUrlsModule(slugMap, legacyMap) {
  const entries = {};
  for (const [id, slug] of slugMap) entries[id] = slug;
  for (const [legacy, slug] of legacyMap) entries[legacy] = slug;

  return `/* ARCHIVO GENERADO por scripts/generate-pages.mjs — no editar a mano.
   Mapa de id (uuid, legacy_id o slug de Supabase) -> slug de la URL limpia.
   El sitio lo usa para enlazar a /producto/<slug>/ en vez de
   product-page.html?id=<uuid>. */
window.JAVY_PRODUCT_SLUGS = ${JSON.stringify(entries, null, 2)};

window.javyProductUrl = {
  // Devuelve la URL limpia del producto, o la vieja con ?id= si todavía no
  // tiene página generada (producto recién creado en el panel, por ejemplo).
  forId(id) {
    const slug = window.JAVY_PRODUCT_SLUGS[String(id)];
    return slug ? "/producto/" + slug + "/" : "product-page.html?id=" + encodeURIComponent(id);
  },
  forProduct(product) {
    if (!product) return "/supplements-page.html";
    return this.forId(product.id);
  },
};
`;
}

function renderSitemap(urls) {
  const today = new Date().toISOString().slice(0, 10);
  const body = urls
    .map(({ loc, changefreq, priority }) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

/* ---------------------------------- main --------------------------------- */

async function main() {
  const { products: allProducts, categories: allCategories } = await loadData();

  const products = allProducts.filter((p) => p.is_active !== false);
  const slugMap = buildSlugMap(products);

  // legacy_id y el slug viejo de Supabase también apuntan al slug nuevo: así
  // los enlaces existentes del sitio (que usan legacy_id) siguen resolviendo.
  const legacyMap = new Map();
  for (const p of products) {
    const slug = slugMap.get(String(p.id));
    if (p.legacy_id) legacyMap.set(String(p.legacy_id), slug);
    if (p.slug && p.slug !== p.legacy_id) legacyMap.set(String(p.slug), slug);
  }

  const categoriesById = new Map(allCategories.map((c) => [String(c.id), c]));

  // Una categoría es Familia (parent_id NULL) o Subcategoría. La familia de
  // cualquiera de las dos: ella misma, o su padre.
  const familyIdOf = (category) => String(category.parent_id || category.id);

  // Productos agrupados por FAMILIA: los asignados a ella directamente MÁS los
  // de todas sus subcategorías.
  //
  // Sin este rollup el conteo mide lo contrario de lo que debería: una familia
  // bien categorizada (todos sus productos repartidos en subcategorías) suma 0
  // y se queda sin página, mientras que una mal categorizada sí la obtiene — y
  // la pierde en cuanto se ordenen los datos, rompiendo una URL ya indexada.
  const productsByFamily = new Map();
  for (const p of products) {
    if (!p.category_id) continue;
    const category = categoriesById.get(String(p.category_id));
    if (!category) continue;
    const famId = familyIdOf(category);
    if (!productsByFamily.has(famId)) productsByFamily.set(famId, []);
    productsByFamily.get(famId).push(p);
  }

  // Subcategorías con productos dentro de cada familia, para los chips de la
  // página de categoría (el segundo nivel sin multiplicar páginas).
  const typesOfFamily = new Map();
  for (const category of allCategories) {
    if (!category.parent_id || category.is_active === false) continue;
    const count = products.filter((p) => String(p.category_id) === String(category.id)).length;
    if (!count) continue;
    const famId = String(category.parent_id);
    if (!typesOfFamily.has(famId)) typesOfFamily.set(famId, []);
    typesOfFamily.get(famId).push({ category, count });
  }

  // El slug de la URL sale del nombre, no de la columna `slug` de Supabase,
  // que usa prefijos internos ("fam-proteinas", "tipo-iso") impropios de una URL.
  const categorySlugs = new Map();
  const takenCategorySlugs = new Set();
  const categoryPages = [];
  for (const category of allCategories) {
    if (category.is_active === false) continue;
    // Solo familias: las subcategorías viven como filtro dentro de la página de
    // su familia, así la autoridad se concentra en pocas URLs fuertes en vez de
    // dispersarse entre dos niveles que compiten entre sí.
    if (category.parent_id) continue;
    const count = productsByFamily.get(String(category.id))?.length || 0;
    if (count < MIN_PRODUCTS_PER_CATEGORY) continue;

    let slug = slugTokens(category.name).join("-");
    if (!slug) continue;
    if (takenCategorySlugs.has(slug)) slug = `${slug}-${String(category.id).replace(/-/g, "").slice(0, 6)}`;
    takenCategorySlugs.add(slug);
    categorySlugs.set(String(category.id), slug);
    categoryPages.push(category);
  }

  console.log(`Productos activos: ${products.length}`);
  console.log(`Categorías con productos: ${categoryPages.length}`);

  if (DRY_RUN) {
    console.log("\nEjemplos de URL:");
    for (const p of products.slice(0, 8)) {
      console.log(`  ${productPath(slugMap.get(String(p.id)))}   <- ${p.name}`);
    }
    console.log("\n(--dry-run) No se escribió ningún archivo.");
    return;
  }

  // Se borran los directorios completos para que un producto dado de baja o
  // renombrado no deje su página vieja huérfana en el repo.
  for (const dir of ["producto", "categoria"]) {
    const full = join(ROOT, dir);
    if (existsSync(full)) await rm(full, { recursive: true });
  }

  for (const product of products) {
    const slug = slugMap.get(String(product.id));
    const category = product.category_id ? categoriesById.get(String(product.category_id)) : null;
    // El breadcrumb enlaza a la familia (la que tiene página); la subcategoría
    // se muestra como último tramo, sin enlace propio.
    const family = category ? categoriesById.get(familyIdOf(category)) : null;
    const html = renderProductPage(product, {
      slug,
      familyName: family?.name || product.category || "Suplementos",
      familySlug: family ? categorySlugs.get(String(family.id)) || null : null,
      typeName: category && category.parent_id ? category.name : "",
    });
    const dir = join(ROOT, "producto", slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html, "utf8");
  }

  for (const category of categoryPages) {
    const list = productsByFamily.get(String(category.id)) || [];
    const categorySlug = categorySlugs.get(String(category.id));
    const types = typesOfFamily.get(String(category.id)) || [];
    const html = renderCategoryPage(category, list, slugMap, categorySlug, types);
    const dir = join(ROOT, "categoria", categorySlug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html, "utf8");
  }

  // Las URLs de subcategoría que llegaron a publicarse antes de acotar las
  // páginas a familias siguen vivas como redirección: producción es GitHub
  // Pages tras Cloudflare, donde los `redirects` de vercel.json no aplican.
  for (const [oldSlug, familyName] of Object.entries(LEGACY_CATEGORY_REDIRECTS)) {
    const family = categoryPages.find((c) => c.name === familyName);
    const familySlug = family ? categorySlugs.get(String(family.id)) : null;
    if (!familySlug) continue;
    const dir = join(ROOT, "categoria", oldSlug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), renderCategoryRedirect(oldSlug, familySlug, familyName), "utf8");
  }

  await writeFile(join(ROOT, "js/product-urls.js"), renderProductUrlsModule(slugMap, legacyMap), "utf8");

  const urls = [
    { loc: `${SITE}/`, changefreq: "weekly", priority: "1.0" },
    { loc: `${SITE}/supplements-page.html`, changefreq: "weekly", priority: "0.9" },
    ...categoryPages.map((c) => ({
      loc: `${SITE}${categoryPath(categorySlugs.get(String(c.id)))}`,
      changefreq: "weekly",
      priority: "0.8",
    })),
    ...products.map((p) => ({
      loc: `${SITE}${productPath(slugMap.get(String(p.id)))}`,
      changefreq: "monthly",
      priority: "0.7",
    })),
    { loc: `${SITE}/contacto.html`, changefreq: "monthly", priority: "0.7" },
    { loc: `${SITE}/testimonios.html`, changefreq: "monthly", priority: "0.6" },
  ];
  await writeFile(join(ROOT, "sitemap.xml"), renderSitemap(urls), "utf8");

  console.log(`✓ ${products.length} páginas de producto`);
  console.log(`✓ ${categoryPages.length} páginas de categoría`);
  console.log(`✓ js/product-urls.js`);
  console.log(`✓ sitemap.xml con ${urls.length} URLs`);
  console.log("\nRevisá `git status` antes de commitear.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
