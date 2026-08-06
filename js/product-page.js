document.addEventListener("DOMContentLoaded", initProductPage);

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

function getSelectedFlavor(product, shouldRequire = true) {
  const select = document.getElementById("prod-flavor-select");
  if (!select || !product.flavors?.length) return { flavor: "", flavor_id: "" };

  if (!select.value) {
    if (shouldRequire) {
      select.focus();
      select.classList.add("needs-selection");
      window.setTimeout(() => select.classList.remove("needs-selection"), 1200);
    }
    return null;
  }

  const flavor = product.flavors.find((item) => item.id === select.value);
  if (!flavor || flavor.available === false) return null;
  return { flavor: flavor.name, flavor_id: flavor.id };
}

function renderFlavorField(product) {
  const flavorsEl = document.getElementById("prod-flavors");
  if (!flavorsEl) return;

  if (!product.flavors?.length) {
    flavorsEl.innerHTML = `
      <select id="prod-flavor-select" class="pdp__select" aria-label="Sabor" disabled>
        <option>Sin sabor</option>
      </select>
    `;
    if (window.javyDropdown) window.javyDropdown.enhanceSelects(flavorsEl);
    return;
  }

  const enabled = productCanBeQuoted(product);
  flavorsEl.innerHTML = `
    <select id="prod-flavor-select" class="pdp__select" aria-label="Sabor" ${enabled ? "" : "disabled"}>
      <option value="">Elegir sabor (${product.flavors.length})</option>
      ${product.flavors.map((flavor) => `
        <option value="${escapeHTML(flavor.id)}" ${flavor.available === false ? "disabled" : ""}>
          ${escapeHTML(flavor.name)}${flavor.available === false ? " - No disponible" : ""}
        </option>
      `).join("")}
    </select>
  `;
  if (window.javyDropdown) window.javyDropdown.enhanceSelects(flavorsEl);
}

function injectProductStructuredData(product, { pageUrl, imageUrl, metaDescription, canQuote }) {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: product.name,
        image: imageUrl,
        description: metaDescription,
        url: pageUrl,
        ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
        ...(product.price > 0
          ? {
              offers: {
                "@type": "Offer",
                price: Number(product.price).toFixed(2),
                priceCurrency: "USD",
                availability: canQuote ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
                url: pageUrl,
              },
            }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Catálogo", item: "https://javysuplementos.com/supplements-page.html" },
          { "@type": "ListItem", position: 2, name: product.name, item: pageUrl },
        ],
      },
    ],
  };

  let script = document.getElementById("product-jsonld");
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "product-jsonld";
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}

function wireQuantityStepper(onChange) {
  const valueEl = document.querySelector("[data-qty-value]");
  if (!valueEl) return;
  const update = (next) => {
    valueEl.textContent = next;
    if (typeof onChange === "function") onChange(next);
  };
  document.querySelector("[data-qty-dec]")?.addEventListener("click", () => {
    update(Math.max(1, (parseInt(valueEl.textContent, 10) || 1) - 1));
  });
  document.querySelector("[data-qty-inc]")?.addEventListener("click", () => {
    update(Math.min(99, (parseInt(valueEl.textContent, 10) || 1) + 1));
  });
}

function getQuantity() {
  return Math.max(1, parseInt(document.querySelector("[data-qty-value]")?.textContent, 10) || 1);
}

/* Slug de categoría para las URLs públicas. Réplica de `categoryFilterSlug()`
   en scripts/lib/product-slug.mjs: la columna `slug` de Supabase arrastra
   prefijos internos ("fam-proteinas") impropios de una URL. Si cambia allá,
   cambia acá. */
function categoryFilterSlug(category) {
  return String(category?.slug || "").replace(/^(fam|tipo)-/, "");
}

/* Familia y subcategoría de un producto a partir de su category_id. Devuelve
   `type` solo cuando el producto cuelga de un segundo nivel. */
function resolveProductCategories(product, categories = []) {
  const byId = (id) => categories.find((c) => String(c.id) === String(id)) || null;
  const own = byId(product.category_id);
  if (!own) return { family: null, type: null };
  return own.parent_id
    ? { family: byId(own.parent_id), type: own }
    : { family: own, type: null };
}

/* Pinta el breadcrumb y el dato "Categoría" de la ficha técnica. Cuando la
   familia tiene página estática se enlaza; si no, queda como texto. */
function renderCategoryTrail(family, type, fallbackLabel) {
  const familyHref = family ? `/categoria/${categoryFilterSlug(family)}/` : "";
  const link = (label) => `<a href="${escapeHTML(familyHref)}">${escapeHTML(label)}</a>`;

  const breadcrumbCat = document.getElementById("pdp-breadcrumb-cat");
  if (breadcrumbCat) breadcrumbCat.textContent = type?.name || family?.name || fallbackLabel;

  // El tramo de familia vive antes del span del breadcrumb; se inserta una sola
  // vez (la hidratación puede correr después de un HTML ya prerenderizado).
  const breadcrumb = document.querySelector(".pdp__breadcrumb");
  if (breadcrumb && family && type && !breadcrumb.querySelector("[data-breadcrumb-family]")) {
    const sep = document.createElement("span");
    sep.className = "pdp__breadcrumb-sep";
    sep.textContent = "/";
    const anchor = document.createElement("a");
    anchor.href = familyHref;
    anchor.textContent = family.name;
    anchor.setAttribute("data-breadcrumb-family", "");
    breadcrumbCat?.before(anchor, sep);
  }

  const categoryCell = document.getElementById("prod-category");
  if (!categoryCell) return;
  if (family) {
    categoryCell.innerHTML = `${link(family.name)}${type ? ` · ${escapeHTML(type.name)}` : ""}`;
  } else {
    categoryCell.textContent = fallbackLabel;
  }
}

/* Hasta 4 productos de la misma familia, priorizando los de la misma
   subcategoría (más parecidos) y los disponibles. Da salida a una ficha que
   hoy termina en nada. */
function renderRelatedProducts(product, family, type, allProducts, categories) {
  const section = document.getElementById("pdp-related");
  const grid = document.getElementById("pdp-related-grid");
  if (!section || !grid || !family) return;

  // Un producto pertenece a la familia si cuelga de ella o de una de sus
  // subcategorías (mismo criterio que productInFamily en js/supplements.js).
  const childIds = new Set(
    categories.filter((c) => String(c.parent_id) === String(family.id)).map((c) => String(c.id)),
  );
  const inFamily = allProducts.filter((p) => {
    if (String(p.id) === String(product.id)) return false;
    const own = String(p.category_id);
    return own === String(family.id) || childIds.has(own);
  });

  const score = (p) => (String(p.category_id) === String(type?.id) ? 2 : 0)
    + (productCanBeQuoted(p) ? 1 : 0);
  const picks = inFamily.sort((a, b) => score(b) - score(a)).slice(0, 4);
  if (!picks.length) return;

  const titleEl = document.getElementById("pdp-related-title");
  if (titleEl) titleEl.textContent = `Más de ${family.name}`;
  const linkEl = document.getElementById("pdp-related-link");
  if (linkEl) linkEl.href = `/categoria/${categoryFilterSlug(family)}/`;

  grid.innerHTML = picks.map((p) => {
    const href = window.javyProductUrl?.forId?.(p.id) || `product-page.html?id=${encodeURIComponent(p.id)}`;
    const price = Number(p.price || 0);
    return `
      <article class="product-card">
        <a class="product-card__media product-card__media-link" href="${escapeHTML(href)}" aria-label="Ver ${escapeHTML(p.name)}">
          <img src="${escapeHTML(p.image || "img/images/javi.webp")}" alt="${escapeHTML(p.name)}" class="product-card__img" loading="lazy" decoding="async" />
        </a>
        <div class="product-card__info">
          <div class="product-card__meta">
            <span class="product-card__brand">${escapeHTML(p.brand || "Marca en revisión")}</span>
          </div>
          <h3 class="product-card__name">
            <a class="product-card__name-link" href="${escapeHTML(href)}">${escapeHTML(p.name)}</a>
          </h3>
          <div class="product-card__price-row">
            <span class="product-card__price">${price > 0 ? `$${price.toFixed(2)}` : "Consultar"}</span>
          </div>
        </div>
      </article>`;
  }).join("");

  section.hidden = false;
}

async function initProductPage() {
  const params = new URLSearchParams(window.location.search);
  // En /producto/<slug>/ no hay ?id=: la página generada lo declara en
  // data-product-id (un <script> inline lo bloquearía la CSP).
  const prerenderedId = document.querySelector(".pdp[data-product-id]")?.dataset.productId || "";
  const productId = params.get("id") || prerenderedId;

  if (!productId || !window.catalogDb) {
    if (!prerenderedId) renderNotFound();
    return;
  }

  const [product, categories] = await Promise.all([
    window.catalogDb.getProductById(productId),
    window.catalogDb.getCategories?.().catch(() => []) ?? [],
  ]);
  if (!product) {
    // En /producto/<slug>/ el HTML ya trae nombre, precio y descripción escritos.
    // Si Supabase no responde, conservarlo es mejor que borrarlo: la página
    // sigue siendo útil y legible en vez de mostrar "no encontrado".
    if (!prerenderedId) renderNotFound();
    return;
  }

  document.title = `${product.name} | Javy Suplementos`;

  // URLs de SEO siempre al dominio de producción (Cloudflare), nunca al preview de Vercel
  const SITE_BASE = "https://javysuplementos.com/";
  const DEFAULT_IMAGE = SITE_BASE + "img/images/javi.webp";
  const toAbsoluteUrl = (path) => {
    if (!path) return DEFAULT_IMAGE;
    if (/^https?:\/\//i.test(path)) return path;
    return SITE_BASE + String(path).replace(/^\/+/, "");
  };

  // Canonical siempre a la URL limpia: si se entra por el enlace viejo
  // (product-page.html?id=), Google consolida la autoridad en /producto/<slug>/.
  const cleanPath = window.javyProductUrl?.forId?.(productId) || "";
  const pageUrl = cleanPath.startsWith("/producto/")
    ? SITE_BASE + cleanPath.replace(/^\/+/, "")
    : `${SITE_BASE}product-page.html?id=${encodeURIComponent(productId)}`;
  const imageUrl = toAbsoluteUrl(product.image);
  const shortDescription = String(product.description_short || product.subtitulo || "").trim();
  const metaDescription = shortDescription || `${product.name} — Cotizá ahora por WhatsApp con Javy Suplementos.`;
  const setMeta = (sel, val) => { const el = document.querySelector(sel); if (el) el.setAttribute("content", val); };
  setMeta('meta[property="og:title"]', `${product.name} | Javy Suplementos`);
  setMeta('meta[property="og:description"]', metaDescription);
  setMeta('meta[property="og:image"]', imageUrl);
  setMeta('meta[property="og:url"]', pageUrl);
  setMeta('meta[name="twitter:title"]', `${product.name} | Javy Suplementos`);
  setMeta('meta[name="twitter:description"]', metaDescription);
  setMeta('meta[name="twitter:image"]', imageUrl);
  setMeta('meta[name="description"]', metaDescription);

  // canonical dinámico por producto (mismo dominio de producción + ?id=)
  const canonicalEl = document.querySelector('link[rel="canonical"]');
  if (canonicalEl) canonicalEl.setAttribute("href", pageUrl);

  const canQuote = productCanBeQuoted(product);
  injectProductStructuredData(product, { pageUrl, imageUrl, metaDescription, canQuote });
  const category = product.category || "Producto";
  const presentation = product.presentation || "";
  const priceText = product.price > 0 ? `$${product.price.toFixed(2)}` : "Consultar precio";
  const offerActive = product.price > 0 && product.old_price && Number(product.old_price) > Number(product.price);
  const offerDiscount = offerActive ? Math.round((1 - product.price / product.old_price) * 100) : 0;
  const priceHTML = offerActive
    ? `<span class="pdp__price-now">${priceText}</span> <span class="pdp__price-old">$${Number(product.old_price).toFixed(2)}</span> <span class="pdp__discount">-${offerDiscount}%</span>`
    : priceText;

  const imgEl = document.getElementById("prod-image");
  imgEl.src = product.image || "img/images/javi.webp";
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = "img/images/javi.webp"; };
  imgEl.alt = product.name;

  document.getElementById("prod-title").textContent = product.name;
  const subtitleEl = document.getElementById("prod-subtitle");
  subtitleEl.textContent = shortDescription;
  subtitleEl.hidden = !shortDescription;
  document.getElementById("prod-price").innerHTML = priceHTML;

  const categoryLabel = document.getElementById("prod-category-label");
  const presentationEl = document.getElementById("prod-presentation");
  const contextSeparator = document.querySelector(".pdp__context-sep");
  if (categoryLabel) categoryLabel.textContent = category;
  if (presentationEl) {
    presentationEl.textContent = presentation;
    presentationEl.hidden = !presentation;
  }
  if (contextSeparator) contextSeparator.hidden = !presentation;

  const brandLabel = document.getElementById("prod-brand-label");
  if (brandLabel) brandLabel.textContent = product.brand || "Marca por confirmar";

  const barPriceEl = document.getElementById("pdp-bar-price");
  if (barPriceEl) barPriceEl.innerHTML = priceHTML;

  // Breadcrumb Catálogo / Familia / Subcategoría, con la familia enlazada a su
  // página. Sin esto la ficha es un callejón sin salida: no hay camino de vuelta
  // a "todas las proteínas" desde un producto concreto.
  const { family, type } = resolveProductCategories(product, categories);
  renderCategoryTrail(family, type, category);

  // No bloquea el render de la ficha: el bloque aparece cuando el catálogo esté.
  window.catalogDb.getProductsWithFlavors?.()
    .then((all) => renderRelatedProducts(product, family, type, all || [], categories))
    .catch(() => {});

  document.getElementById("prod-brand").textContent = product.brand || "Por confirmar";

  document.querySelectorAll("[data-status-pill]").forEach((pill) => {
    pill.textContent = canQuote ? "Disponible" : "Agotado";
    pill.classList.toggle("is-agotado", !canQuote);
  });

  renderFlavorField(product);

  // Cantidad / barra inferior
  const unitsEl = document.querySelector("[data-bar-units]");
  const flavorNoteEl = document.querySelector("[data-bar-flavor]");

  const updateBarSub = () => {
    const qty = getQuantity();
    if (unitsEl) unitsEl.textContent = `${qty} unidad${qty > 1 ? "es" : ""}`;
    if (flavorNoteEl) {
      const select = document.getElementById("prod-flavor-select");
      const hasFlavors = !!product.flavors?.length;
      if (!hasFlavors) {
        flavorNoteEl.textContent = "";
      } else if (select && select.value) {
        const f = product.flavors.find((item) => item.id === select.value);
        flavorNoteEl.textContent = f ? ` · ${f.name}` : " · sabor por elegir";
      } else {
        flavorNoteEl.textContent = " · sabor por elegir";
      }
    }
  };

  wireQuantityStepper(updateBarSub);
  document.getElementById("prod-flavor-select")?.addEventListener("change", () => {
    document.getElementById("prod-flavor-select")?.classList.remove("needs-selection");
    updateBarSub();
  });
  updateBarSub();

  // Acciones
  const addCtas = Array.from(document.querySelectorAll("[data-add-cta]"));

  if (canQuote) {
    // Estado por sabor + nota con sabores agregados + ✓ en la lista de sabores.
    const syncPdpButtons = () => {
      const selected = getSelectedFlavor(product, false);
      const flavorName = selected ? selected.flavor : "";
      const added = !!window.consultation?.hasItem?.(product.id, flavorName);
      addCtas.forEach((btn) => {
        btn.classList.toggle("is-added", added);
        btn.textContent = added ? "✓ En cotización" : "Agregar a cotización";
      });

      // Nota: "En tu cotización: Chocolate, Vainilla"
      const note = document.querySelector("[data-added-note]");
      if (note) {
        const addedFlavors = window.consultation?.getAddedFlavors?.(product.id) || [];
        if (addedFlavors.length) {
          note.textContent = `En tu cotización: ${addedFlavors.join(", ")}`;
          note.hidden = false;
        } else {
          note.textContent = "";
          note.hidden = true;
        }
      }

      // ✓ en los sabores ya agregados.
      const select = document.getElementById("prod-flavor-select");
      if (select && product.flavors?.length) {
        Array.from(select.options).forEach((opt) => {
          if (!opt.value) return; // placeholder
          const f = product.flavors.find((item) => item.id === opt.value);
          if (!f) return;
          const unavailable = f.available === false ? " - No disponible" : "";
          const inCart = window.consultation?.hasItem?.(product.id, f.name) ? " ✓" : "";
          opt.textContent = `${f.name}${unavailable}${inCart}`;
        });
        window.javyDropdown?.refresh?.(select);
      }
    };

    addCtas.forEach((btn) => {
      btn.hidden = false;
      btn.addEventListener("click", () => {
        const selectedFlavor = getSelectedFlavor(product);
        if (product.flavors?.length && !selectedFlavor) {
          btn.textContent = "Elige un sabor";
          window.setTimeout(syncPdpButtons, 1200);
          return;
        }

        const flavorName = selectedFlavor?.flavor || "";
        if (window.consultation?.hasItem?.(product.id, flavorName)) {
          window.consultation?.toast?.(flavorName ? "Ese sabor ya está en tu cotización" : "Ya está en tu cotización");
          return;
        }

        const quantity = getQuantity();
        window.consultation?.addItem?.(product, { ...(selectedFlavor || {}), quantity });
        syncPdpButtons();
      });
    });

    // El estado depende del sabor elegido y de cambios hechos desde el panel.
    document.getElementById("prod-flavor-select")?.addEventListener("change", syncPdpButtons);
    document.addEventListener("consultation:change", syncPdpButtons);
    syncPdpButtons();
  } else {
    addCtas.forEach((btn) => {
      btn.textContent = "Consultar disponibilidad";
      btn.classList.add("pdp__cta--ghost");
      btn.addEventListener("click", () => {
        window.consultation?.askAvailability?.(product);
      });
    });
  }

  renderProductInformation(product);
  setupMobilePurchaseBar();
}

function renderNotFound() {
  document.body.innerHTML = `
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#050709;color:#fff;font-family:'Roboto',system-ui,sans-serif;padding:1.5rem;text-align:center;">
      <div>
        <h1 style="margin-bottom:0.75rem;">Producto no encontrado</h1>
        <p style="margin-bottom:1rem;color:#A9B4C6;">Verifica el enlace o vuelve al catalogo.</p>
        <a href="/supplements-page.html" style="color:#5AB4E9;text-decoration:none;font-weight:500;">Volver al catalogo</a>
      </div>
    </main>
  `;
}

function normalizeTextItems(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/\n+/);
  return values.map((text) => String(text || "").trim()).filter(Boolean);
}

function renderProductInformation(product) {
  const description = normalizeTextItems(product.description_long || product.description || product.descripcion);
  const benefits = normalizeTextItems(product.beneficios);
  const usage = normalizeTextItems(product.uso);

  const descriptionEl = document.getElementById("tab-descripcion");
  const benefitsEl = document.getElementById("tab-beneficios");
  const usageEl = document.getElementById("tab-uso");

  if (descriptionEl) descriptionEl.innerHTML = description.map((text) => `<p>${escapeHTML(text)}</p>`).join("");
  if (benefitsEl) benefitsEl.innerHTML = benefits.map((text) => `<div class="pdp__benefit">${escapeHTML(text)}</div>`).join("");
  if (usageEl) usageEl.innerHTML = usage.map((text) => `<li>${escapeHTML(text)}</li>`).join("");

  const sectionStates = { description: description.length, benefits: benefits.length, usage: usage.length };
  document.querySelectorAll("[data-content-section]").forEach((section) => {
    section.hidden = !sectionStates[section.getAttribute("data-content-section")];
  });

  const details = document.querySelector(".pdp__details");
  if (details) details.hidden = !Object.values(sectionStates).some(Boolean);
}

function setupMobilePurchaseBar() {
  const bar = document.querySelector(".pdp__bar");
  const primaryCta = document.querySelector("[data-primary-cta]");
  const barCta = bar?.querySelector("[data-add-cta]");
  if (!bar || !primaryCta || !barCta) return;

  const mobileQuery = window.matchMedia("(max-width: 767px)");
  let primaryCtaVisible = true;

  const updateBar = () => {
    const shouldShow = mobileQuery.matches && !primaryCtaVisible;
    bar.classList.toggle("is-visible", shouldShow);
    bar.setAttribute("aria-hidden", shouldShow ? "false" : "true");
    barCta.tabIndex = shouldShow ? 0 : -1;
  };

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      primaryCtaVisible = entry.isIntersecting;
      updateBar();
    }, { threshold: 0.15 });
    observer.observe(primaryCta);
  } else {
    const checkVisibility = () => {
      const rect = primaryCta.getBoundingClientRect();
      primaryCtaVisible = rect.bottom > 0 && rect.top < window.innerHeight;
      updateBar();
    };
    window.addEventListener("scroll", checkVisibility, { passive: true });
    checkVisibility();
  }

  mobileQuery.addEventListener("change", updateBar);
  updateBar();
}
