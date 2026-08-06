/* ============================================================================
   Slugs de producto para las URLs limpias (/producto/<slug>/).

   Se derivan de marca + nombre + presentación en vez de usar la columna `slug`
   de Supabase, que arrastra texto repetido ("nutricost-nutricost-casein-5-lb").
   Derivarlos aquí evita tocar datos de producción y mantiene las URLs legibles.

   El resultado se materializa en js/product-urls.js (generado); el navegador
   solo consulta ese mapa, nunca recalcula el slug.
   ============================================================================ */

const MAX_SLUG_LENGTH = 70;

export function slugTokens(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// "8 lb / 242 servidas" y "2 lb - 27 servidas" -> "8 lb" / "2 lb". El primer
// segmento basta para distinguir variantes y evita URLs interminables.
function shortPresentation(presentation) {
  return String(presentation || "").split(/\s*[/·]\s*|\s+-\s+/)[0];
}

// Une marca + nombre + presentación descartando tokens repetidos (conserva la
// primera aparición), que es de donde salen los slugs duplicados actuales.
export function buildSlug(product) {
  const tokens = [
    ...slugTokens(product.brand),
    ...slugTokens(product.name),
    ...slugTokens(shortPresentation(product.presentation)),
  ];

  const seen = new Set();
  const unique = tokens.filter((token) => {
    if (seen.has(token)) return false;
    seen.add(token);
    return true;
  });

  let slug = unique.join("-");
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-[^-]*$/, "");
  }
  return slug || "producto";
}

/* Mapa id -> slug para toda la lista.

   Se ordena por id (no por el orden que devuelva Supabase) para que dos
   corridas produzcan siempre lo mismo; ante una colisión se agrega un sufijo
   derivado del id, que es estable para ese producto. */
export function buildSlugMap(products) {
  const taken = new Set();
  const bySlug = new Map();

  const ordered = [...products].sort((a, b) => String(a.id).localeCompare(String(b.id)));

  for (const product of ordered) {
    let slug = buildSlug(product);
    if (taken.has(slug)) {
      slug = `${slug}-${String(product.id).replace(/-/g, "").slice(0, 6)}`;
    }
    taken.add(slug);
    bySlug.set(String(product.id), slug);
  }

  return bySlug;
}

export function productPath(slug) {
  return `/producto/${slug}/`;
}

export function categoryPath(slug) {
  return `/categoria/${slug}/`;
}

/* Slug de una categoría para los parámetros de filtro del catálogo
   (?fam=proteinas&tipo=whey). La columna `slug` de Supabase arrastra prefijos
   internos ("fam-proteinas", "tipo-whey") que no pintan en una URL pública.

   `js/supplements.js` replica esta misma normalización: si cambia acá, cambia
   allá. Familia y tipo viajan en parámetros distintos, así que dos categorías
   de niveles distintos pueden normalizar al mismo texto sin ambigüedad. */
export function categoryFilterSlug(category) {
  const stripped = String(category?.slug || "").replace(/^(fam|tipo)-/, "");
  return stripped || slugTokens(category?.name).join("-");
}
