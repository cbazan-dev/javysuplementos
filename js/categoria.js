/* ============================================================================
   PÁGINAS DE CATEGORÍA — /categoria/<slug>/

   Las cards ya vienen escritas en el HTML por scripts/generate-pages.mjs (eso
   es lo que indexa Google y lee el scraper de WhatsApp, que no ejecuta JS).
   Este archivo hace dos cosas sobre ese HTML:

     1. Engancha la cotización, para que la card de una categoría se comporte
        igual que la del catálogo completo.
     2. HIDRATA: refresca precios, ofertas y disponibilidad con lo que hay ahora
        mismo en la base, y agrega al final los productos de la familia que
        entraron después de la última generación.

   Por qué hace falta (2): el HTML se regenera de a ratos, así que sin esto
   alguien que entra por /categoria/proteinas/ ve la foto del día que se generó
   la página — precios viejos y sin los productos nuevos.

   El producto sale de dos lados, en este orden:

     1. catalogDb, que es la misma fuente del catálogo y trae los sabores.
     2. Los data-* de la card, si la base no responde. Alcanza para cotizar
        (sin elegir sabor), así el botón nunca queda muerto por estar offline.
   ============================================================================ */
(function () {
  "use strict";

  function setAddButtonState(button, added) {
    if (!button) return;
    button.classList.toggle("is-added", added);
    button.textContent = added ? "✓ En cotización" : "Agregar a cotización";
  }

  // Igual que syncAddButton() del catálogo, pero sin selector de sabor: la card
  // marca "en cotización" si hay CUALQUIER variante de este producto agregada.
  function syncCard(card, product) {
    const button = card.querySelector(".product-card__btn--buy");
    if (!button) return;
    const added = window.consultation?.getAddedFlavors?.(product.id)?.length || 0;
    const inQuote = added > 0 || !!window.consultation?.hasItem?.(product.id, "");
    setAddButtonState(button, inQuote);
  }

  // Producto de respaldo, armado con lo que la propia card trae en el HTML.
  function productoDeLaCard(card) {
    const d = card.dataset;
    return {
      id: d.productId,
      legacy_id: d.legacyId || d.productId,
      name: d.name || "",
      brand: d.brand || "",
      category: d.category || "",
      price: Number(d.price || 0),
      presentation: d.presentation || "",
      image: d.image || "img/icons/logo.png",
      flavors: [],
    };
  }

  function engancharBotones(card, product) {
    card.querySelector(".product-card__btn--buy")?.addEventListener("click", () => {
      window.consultation?.openAddModal?.(product);
    });
    card.querySelector(".product-card__btn--quote")?.addEventListener("click", () => {
      window.consultation?.askAvailability?.(product, {});
    });
  }

  // Ids de la familia de esta página: ella misma MÁS sus subcategorías. Es el
  // mismo rollup que hace familyIdOf() en scripts/generate-pages.mjs; si difiere,
  // la página muestra un conjunto distinto al que el generador escribió.
  function idsDeLaFamilia(familyId, categories) {
    const ids = new Set([String(familyId)]);
    for (const c of categories) {
      if (String(c.parent_id || "") === String(familyId)) ids.add(String(c.id));
    }
    return ids;
  }

  async function init() {
    const grid = document.querySelector(".catalog-grid");
    const cards = Array.from(document.querySelectorAll(".product-card[data-product-id]"));
    if (!cards.length) return;

    let products = [];
    let categories = [];
    try {
      [products, categories] = await Promise.all([
        window.catalogDb?.getProductsWithFlavors?.() || [],
        window.catalogDb?.getCategories?.().catch(() => []) || [],
      ]);
    } catch (error) {
      // Se sigue con los data-* de la card: cotizar no depende de la red.
      console.warn("[categoria] catálogo no disponible, uso los datos de la página:", error);
    }

    // Hidratar SOLO con datos remotos. Cuando Supabase falla, catalogDb cae al
    // respaldo de js/product-data.js, que se exporta a mano y puede ser MÁS
    // VIEJO que este HTML (generado desde Supabase): pisar los precios con eso
    // sería retroceder. Sin datos frescos, el HTML estático se queda como está.
    const fuenteRemota = window.catalogDb?.getProductsCacheSource?.() === "supabase";
    const puedeHidratar = fuenteRemota && !!window.javyProductCard;

    // La página se genera con el uuid de Supabase, pero el respaldo local usa
    // legacy_id: se indexa por los dos para que el match no dependa de cuál vino.
    const porId = new Map();
    for (const p of products) {
      if (p.id != null) porId.set(String(p.id), p);
      if (p.legacy_id != null) porId.set(String(p.legacy_id), p);
    }

    const enganchadas = [];
    const yaEnLaPagina = new Set();

    for (const card of cards) {
      const d = card.dataset;
      const encontrado = porId.get(d.productId) || porId.get(d.legacyId);
      const product = encontrado || productoDeLaCard(card);

      if (d.productId) yaEnLaPagina.add(String(d.productId));
      if (d.legacyId) yaEnLaPagina.add(String(d.legacyId));

      if (puedeHidratar) {
        if (encontrado) {
          window.javyProductCard.hydrate(card, encontrado);
        } else {
          // Está en el HTML pero ya no en la base: se marca agotado en vez de
          // borrar la card, que movería todo lo que tiene debajo.
          window.javyProductCard.markOrphan(card);
        }
      }

      engancharBotones(card, product);
      syncCard(card, product);
      enganchadas.push([card, product]);
    }

    // Productos que entraron a la familia después de generar el HTML. Van AL
    // FINAL, no intercalados: así no se mueve nada de lo que el visitante ya
    // está mirando, y el orden que indexó Google se conserva.
    const familyId = grid?.dataset.categoryId;
    if (puedeHidratar && grid && familyId && categories.length) {
      const familia = idsDeLaFamilia(familyId, categories);
      const nuevos = products.filter(
        (p) => familia.has(String(p.category_id))
          && !yaEnLaPagina.has(String(p.id))
          && !yaEnLaPagina.has(String(p.legacy_id ?? "")),
      );

      for (const product of nuevos) {
        const card = window.javyProductCard.render(product, { headingLevel: "h2", categories });
        card.dataset.javyNuevo = "1";
        grid.append(card);
        engancharBotones(card, product);
        syncCard(card, product);
        enganchadas.push([card, product]);
      }
    }

    // Agregar o quitar desde el panel de cotización tiene que verse en la card.
    document.addEventListener("consultation:change", () => {
      for (const [card, product] of enganchadas) syncCard(card, product);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
