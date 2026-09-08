/* ============================================================================
   Carga de datos desde window.catalogDb (Supabase) hacia el estado central.
   Degradación elegante: si una fuente falla, marca el feature como no soportado.
   ============================================================================ */
import { state } from "./state.js?v=adm-922c03ee";

export async function loadAll() {
  const db = window.catalogDb;
  const [products, categories, admins, pricing] = await Promise.all([
    db.getProductsWithFlavors({ audit: true, cache: false, includeInactive: true }).catch((e) => { console.warn(e); return []; }),
    db.getAllCategories().catch(() => { state.categoriesSupported = false; return []; }),
    db.getAdminProfiles().catch(() => []),
    // Defensivo a propósito: si el navegador se quedó con un js/db.js viejo en
    // caché, esta función puede no existir todavía. Llamarla a secas tiraba
    // abajo el arranque del panel ENTERO por una sección; así, como mucho, no
    // hay precios internos hasta que baje el js nuevo.
    (typeof db.pricingEnabled === "function" ? db.pricingEnabled() : Promise.resolve(false)).catch(() => false),
  ]);
  state.products = products || [];
  state.categories = categories || [];
  state.admins = admins || [];
  state.pricingSupported = pricing === true;
}

export async function reloadProducts() {
  state.products = await window.catalogDb.getProductsWithFlavors({ audit: true, cache: false, includeInactive: true }).catch(() => state.products);
}
