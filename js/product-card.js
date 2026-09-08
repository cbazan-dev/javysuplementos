/* ============================================================================
   CARD DE PRODUCTO — pieza compartida

   El sitio pinta la misma card en cuatro lugares y hasta ahora cada uno tenía
   su propia copia, que fueron divergiendo (el catálogo usa <h3> y la página de
   categoría <h2>; los "relacionados" de la ficha muestran el precio sin "$").
   Este módulo es la versión canónica. Se migra de a un consumidor por vez:

     - js/categoria.js          ← YA usa este módulo
     - js/product-page.js:228   ← pendiente (renderRelatedCard)
     - js/script.js             ← pendiente (home)
     - js/supplements.js:804    ← pendiente (catálogo)

   Si tocas la card, tócala acá. Las copias que quedan llevan un comentario
   apuntando a este archivo.

   Dos operaciones, para dos situaciones distintas:

     render(product)        arma una card nueva desde cero (no existe en el DOM).
     hydrate(card, product) refresca una card que ya vino escrita en el HTML
                            por scripts/generate-pages.mjs.

   `hydrate` parchea campo por campo en vez de reconstruir el nodo: las páginas
   de categoría son HTML estático que Google y el scraper de WhatsApp ya leyeron,
   y rehacer la grilla produce parpadeo y salto de layout. Como la mayoría de las
   cards no cambia de un día para otro, casi ningún parche llega a tocar el DOM.
   ============================================================================ */
(() => {
  "use strict";

  function escapeHTML(value = "") {
    return value
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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

  // Un producto se puede cotizar si no está marcado agotado y le queda al menos
  // un sabor disponible (o no maneja sabores).
  function canQuote(product) {
    if (!product) return false;
    if (product.available === false) return false;
    if (!product.flavors?.length) return true;
    return product.flavors.some((flavor) => flavor.available !== false);
  }

  // Las rutas de imagen guardadas en la BD son relativas ("img/products/x.webp").
  // Una card puede pintarse en una página que NO vive en la raíz (/catalogo/,
  // /categoria/<slug>/), donde el navegador las resolvería contra ese directorio
  // y daría 404. Se anclan a la raíz, igual que productImageSrc() en
  // js/product-page.js y assetSrc() en scripts/generate-pages.mjs.
  function imageSrc(path) {
    const clean = String(path || "").trim();
    if (!clean) return "/img/images/javi.webp";
    if (/^(https?:)?\/\//i.test(clean)) return clean;
    return clean.startsWith("/") ? clean : "/" + clean;
  }

  function detailUrlFor(product) {
    return window.javyProductUrl?.forProduct?.(product)
      || `/product-page.html?id=${encodeURIComponent(product?.id ?? "")}`;
  }

  function categoryMarkup(product, categories) {
    const parts = window.javyCardCategory?.formatParts?.(product, categories || []);
    const family = parts?.family || product.category || product.categoria || "";
    if (!family) return "";
    const type = parts?.type
      ? `<span class="product-card__category-sep">›</span><span class="product-card__category-type">${escapeHTML(parts.type)}</span>`
      : "";
    return `<span class="product-card__category"><span class="product-card__category-family">${escapeHTML(family)}</span>${type}</span>`;
  }

  /* ------------------------------- render ---------------------------------- */

  /**
   * Arma una card nueva, con los mismos data-* que emite
   * scripts/generate-pages.mjs para que una card hecha acá y una hecha en Node
   * sean indistinguibles para el resto del código.
   *
   * @param {object} product   producto ya normalizado por catalogDb
   * @param {object} [opts]
   * @param {"h2"|"h3"} [opts.headingLevel="h3"]  el generador usa h2 en la
   *        página de categoría; el catálogo y la home usan h3. Mezclarlos dentro
   *        de una misma grilla rompe la jerarquía de encabezados.
   * @param {Array}  [opts.categories=[]]  categorías para la etiqueta familia › tipo
   */
  function render(product, opts = {}) {
    const { headingLevel = "h3", categories = [] } = opts;
    const heading = headingLevel === "h2" ? "h2" : "h3";
    const quotable = canQuote(product);
    const detailUrl = escapeHTML(detailUrlFor(product));
    const name = product.name || product.nombre || "Producto";
    const image = imageSrc(product.image || product.imagen);
    const price = Number(product.price || 0);

    const card = document.createElement("article");
    card.className = `product-card${product.imagenPendiente ? " product-card--image-pending" : ""}`;

    // Mismos data-* que el HTML generado: son el respaldo para cotizar cuando
    // Supabase no responde (ver productoDeLaCard() en js/categoria.js).
    card.dataset.productId = String(product.id ?? "");
    card.dataset.legacyId = String(product.legacy_id ?? product.id ?? "");
    card.dataset.name = name;
    card.dataset.brand = product.brand || "";
    card.dataset.category = product.category || "";
    card.dataset.price = String(price);
    card.dataset.presentation = product.presentation || "";
    card.dataset.image = image;

    card.innerHTML = `
      ${product.featured ? '<span class="product-card__badge">Destacado</span>' : ""}

      <a class="product-card__media product-card__media-link" href="${detailUrl}" aria-label="Ver ${escapeHTML(name)}">
        <img src="${escapeHTML(image)}" alt="${escapeHTML(name)}" class="product-card__img" loading="lazy" decoding="async" />
      </a>

      <div class="product-card__info">
        <div class="product-card__meta">
          <span class="product-card__brand">${escapeHTML(product.brand || "Marca en revisión")}</span>
          <span class="product-card__status ${quotable ? "is-available" : "is-agotado"}">${quotable ? "Disponible" : "Agotado"}</span>
        </div>
        ${categoryMarkup(product, categories)}
        <${heading} class="product-card__name">
          <a class="product-card__name-link" href="${detailUrl}">${escapeHTML(name)}</a>
        </${heading}>
        <div class="product-card__price-row">
          <span class="product-card__price-group">
            <span class="product-card__price">${escapeHTML(formatPrice(product.price))}</span>
            ${hasOffer(product) ? `<span class="product-card__price-old">${escapeHTML(formatPrice(product.old_price))}</span><span class="product-card__discount">-${discountPercent(product)}%</span>` : ""}
          </span>
          ${product.presentation ? `<span class="product-card__pres">${escapeHTML(product.presentation)}</span>` : ""}
        </div>
      </div>

      <div class="product-card__actions">
        <button class="product-card__btn product-card__btn--${quotable ? "buy" : "quote"}" type="button">${quotable ? "Agregar a cotización" : "Consultar disponibilidad"}</button>
        <a class="product-card__detail-link" href="${detailUrl}">Ver detalles</a>
      </div>
    `;

    return card;
  }

  /* ------------------------------- hydrate --------------------------------- */

  // Solo escribe si el valor cambió: un DOM que no se toca no re-layoutea, y en
  // la práctica la mayoría de las cards vienen con el dato correcto del HTML.
  function setText(el, value) {
    if (el && el.textContent.trim() !== value) el.textContent = value;
  }

  // El precio tachado y el "-N%" aparecen y desaparecen según haya oferta, así
  // que hay que crearlos o quitarlos, no solo reescribirlos.
  function syncOffer(card, product) {
    const group = card.querySelector(".product-card__price-group");
    if (!group) return;

    let oldEl = group.querySelector(".product-card__price-old");
    let discountEl = group.querySelector(".product-card__discount");

    if (!hasOffer(product)) {
      oldEl?.remove();
      discountEl?.remove();
      return;
    }

    if (!oldEl) {
      oldEl = document.createElement("span");
      oldEl.className = "product-card__price-old";
      group.append(oldEl);
    }
    if (!discountEl) {
      discountEl = document.createElement("span");
      discountEl.className = "product-card__discount";
      group.append(discountEl);
    }
    setText(oldEl, formatPrice(product.old_price));
    setText(discountEl, `-${discountPercent(product)}%`);
  }

  // El botón cambia de clase Y de texto según se pueda cotizar. No se toca
  // is-added: de eso se encarga la sincronización con el panel de cotización.
  function syncActionButton(card, product) {
    const button = card.querySelector(".product-card__btn");
    if (!button) return;
    const quotable = canQuote(product);

    button.classList.toggle("product-card__btn--buy", quotable);
    button.classList.toggle("product-card__btn--quote", !quotable);

    // Si ya está en la cotización, el texto lo pone syncAddButton del consumidor;
    // pisarlo acá haría parpadear el "✓ En cotización".
    if (button.classList.contains("is-added")) return;
    setText(button, quotable ? "Agregar a cotización" : "Consultar disponibilidad");
  }

  /**
   * Refresca una card que ya está en el DOM con los datos frescos de la base.
   * Devuelve true si algo cambió (útil para diagnóstico).
   */
  function hydrate(card, product) {
    if (!card || !product) return false;

    const before = card.innerHTML;

    setText(card.querySelector(".product-card__price"), formatPrice(product.price));
    syncOffer(card, product);

    const quotable = canQuote(product);
    const status = card.querySelector(".product-card__status");
    if (status) {
      status.classList.toggle("is-available", quotable);
      status.classList.toggle("is-agotado", !quotable);
      setText(status, quotable ? "Disponible" : "Agotado");
    }

    syncActionButton(card, product);

    const brand = card.querySelector(".product-card__brand");
    if (brand && product.brand) setText(brand, product.brand);

    const pres = card.querySelector(".product-card__pres");
    if (pres && product.presentation) setText(pres, product.presentation);

    // Los data-* son el respaldo offline: si quedaran con el precio viejo, un
    // fallo posterior de red mostraría un precio que ya no existe.
    card.dataset.price = String(Number(product.price || 0));

    return card.innerHTML !== before;
  }

  /**
   * Marca una card cuyo producto ya no está en la base. No se borra el nodo: la
   * ausencia puede ser transitoria, y quitar la card mueve todo lo que está
   * debajo. La baja real la resuelve la regeneración del HTML.
   */
  function markOrphan(card) {
    if (!card) return;
    card.dataset.javyHuerfano = "1";

    const status = card.querySelector(".product-card__status");
    if (status) {
      status.classList.remove("is-available");
      status.classList.add("is-agotado");
      setText(status, "Agotado");
    }

    const button = card.querySelector(".product-card__btn");
    if (button && !button.classList.contains("is-added")) {
      button.classList.remove("product-card__btn--buy");
      button.classList.add("product-card__btn--quote");
      setText(button, "Consultar disponibilidad");
    }
  }

  window.javyProductCard = {
    escapeHTML,
    imageSrc,
    formatPrice,
    hasOffer,
    discountPercent,
    canQuote,
    render,
    hydrate,
    markOrphan,
  };
})();
