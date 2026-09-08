/* Etiqueta de categoría compartida por las cards públicas.
   Con jerarquía: "Familia · Tipo". Sin ella: conserva el texto de categoría
   que ya trae el producto local o de respaldo. */
(() => {
  function text(value) {
    return String(value || "").trim();
  }

  function categoryById(categories, id) {
    const expected = String(id || "");
    return categories.find((category) => String(category.id) === expected) || null;
  }

  function format(product = {}, categories = []) {
    const fallback = text(product.category || product.categoria);
    const own = categoryById(categories, product.category_id);
    if (!own) return fallback;
    if (!own.parent_id) return text(own.name) || fallback;

    const family = categoryById(categories, own.parent_id);
    return [text(family?.name), text(own.name)].filter(Boolean).join(" · ") || fallback;
  }

  // Igual que format(), pero separado en familia/tipo para que la card pueda
  // pintarlos con distinto peso (flecha en vez de punto entre medio).
  function formatParts(product = {}, categories = []) {
    const fallback = text(product.category || product.categoria);
    const own = categoryById(categories, product.category_id);
    if (!own) return { family: fallback, type: "" };
    if (!own.parent_id) return { family: text(own.name) || fallback, type: "" };

    const family = categoryById(categories, own.parent_id);
    return { family: text(family?.name) || fallback, type: text(own.name) };
  }

  window.javyCardCategory = { format, formatParts };
})();
