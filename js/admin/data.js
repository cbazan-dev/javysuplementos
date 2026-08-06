/* ============================================================================
   Carga de datos desde window.catalogDb (Supabase) hacia el estado central.
   Degradación elegante: si una fuente falla, marca el feature como no soportado.
   ============================================================================ */
import { state } from "./state.js?v=adm-b0d853ee";

export async function loadAll() {
  const db = window.catalogDb;
  const [products, categories, combos, admins] = await Promise.all([
    db.getProductsWithFlavors({ audit: true, cache: false }).catch((e) => { console.warn(e); return []; }),
    db.getAllCategories().catch(() => { state.categoriesSupported = false; return []; }),
    db.getCombos({ audit: true }).catch(() => { state.combosSupported = false; return []; }),
    db.getAdminProfiles().catch(() => []),
  ]);
  state.products = products || [];
  state.categories = categories || [];
  state.combos = combos || [];
  state.admins = admins || [];
}

export async function reloadProducts() {
  state.products = await window.catalogDb.getProductsWithFlavors({ audit: true, cache: false }).catch(() => state.products);
}
