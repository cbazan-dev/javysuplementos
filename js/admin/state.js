/* ============================================================================
   Estado central del panel + getters derivados de la jerarquía de categorías.
   ============================================================================ */

export const state = {
  products: [],
  categories: [],
  combos: [],
  admins: [],
  userId: null,
  userEmail: null,
  userName: null,
  role: null,
  active: "dashboard",
  settingsTab: "estado",
  productFilter: "all",
  productCategory: "all",
  productSubcategory: "all",
  search: "",
  combosSupported: true,
  categoriesSupported: true,
  // ¿Está aplicada la migración fase10 (tabla product_pricing)? Si no, la
  // sección Precios lo dice en vez de romperse.
  pricingSupported: false,
};

/* Orden estable: por sort_order y, a igualdad, alfabético en español. */
export function byOrder(a, b) {
  const oa = a.sort_order ?? 100, ob = b.sort_order ?? 100;
  if (oa !== ob) return oa - ob;
  return (a.name || "").localeCompare(b.name || "", "es");
}

/* Jerarquía Familia → Tipo sobre state.categories. */
export const families = () => state.categories.filter((c) => !c.parent_id).sort(byOrder);
export const typesOf = (famId) => state.categories.filter((c) => c.parent_id === famId).sort(byOrder);
export const catById = (id) => state.categories.find((c) => c.id === id) || null;

/* ¿El producto cae bajo la familia `catId` (y, si se pide, bajo la subcategoría
   `subId` exacta)? "all" no filtra; "none" = colgado de la familia sin bajar a
   una subcategoría. Vive acá, y no en una sección, porque lo usan tanto
   Productos como Precios y duplicarlo garantizaría que se desincronicen. */
export function matchesCategoryFilter(p, catId, subId) {
  if (catId === "all") return true;
  const cat = catById(p.category_id);
  if (!cat) return false;
  if (!(cat.id === catId || cat.parent_id === catId)) return false;
  if (subId === "all") return true;
  if (subId === "none") return String(p.category_id) === String(catId);
  return String(p.category_id) === String(subId);
}
