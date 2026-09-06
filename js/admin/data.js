/* ============================================================================
   Carga de datos desde window.catalogDb (Supabase) hacia el estado central.
   Degradación elegante: si una fuente falla, marca el feature como no soportado.
   ============================================================================ */
import { state } from "./state.js?v=adm-90d40885";

export async function loadAll() {
  const db = window.catalogDb;
  const [products, categories, admins] = await Promise.all([
    db.getProductsWithFlavors({ audit: true, cache: false, includeInactive: true }).catch((e) => { console.warn(e); return []; }),
    db.getAllCategories().catch(() => { state.categoriesSupported = false; return []; }),
    db.getAdminProfiles().catch(() => []),
  ]);
  state.products = products || [];
  state.categories = categories || [];
  state.admins = admins || [];
}

export async function reloadProducts() {
  state.products = await window.catalogDb.getProductsWithFlavors({ audit: true, cache: false, includeInactive: true }).catch(() => state.products);
}
