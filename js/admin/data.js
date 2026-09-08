/* ============================================================================
   Carga de datos desde window.catalogDb (Supabase) hacia el estado central.
   Degradación elegante: si una fuente falla, marca el feature como no soportado.
   ============================================================================ */
import { state } from "./state.js?v=adm-ee26d7ee";

export async function loadAll() {
  const db = window.catalogDb;
  const [products, categories, admins, pricing] = await Promise.all([
    db.getProductsWithFlavors({ audit: true, cache: false, includeInactive: true }).catch((e) => { console.warn(e); return []; }),
    db.getAllCategories().catch(() => { state.categoriesSupported = false; return []; }),
    db.getAdminProfiles().catch(() => []),
    db.pricingEnabled().catch(() => false),
  ]);
  state.products = products || [];
  state.categories = categories || [];
  state.admins = admins || [];
  state.pricingSupported = pricing === true;
}

export async function reloadProducts() {
  state.products = await window.catalogDb.getProductsWithFlavors({ audit: true, cache: false, includeInactive: true }).catch(() => state.products);
}
