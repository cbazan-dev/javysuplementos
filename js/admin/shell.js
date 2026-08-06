/* ============================================================================
   AdminApp shell: navegación (sidebar + tab-bar móvil + sheet), router entre
   secciones, búsqueda, logout y coordinación de re-render.

   Mantiene un registro key → renderFn; las secciones piden re-render con
   requestRerender() en vez de llamarse entre sí.
   ============================================================================ */
import { state } from "./state.js?v=adm-b0d853ee";
import { NAV } from "./config.js?v=adm-b0d853ee";
import { $, $$, esc, ico } from "./helpers.js?v=adm-b0d853ee";
import { showViewError } from "./view.js?v=adm-b0d853ee";
import { renderDashboard } from "./sections/dashboard.js?v=adm-b0d853ee";
import { renderProducts } from "./sections/products.js?v=adm-b0d853ee";
import { renderHome } from "./sections/home.js?v=adm-b0d853ee";
import { renderLeads } from "./sections/leads.js?v=adm-b0d853ee";
import { renderCategories } from "./sections/categories.js?v=adm-b0d853ee";
import { renderCombos } from "./sections/combos.js?v=adm-b0d853ee";
import { renderAccess } from "./sections/access.js?v=adm-b0d853ee";
import { renderSettings } from "./sections/settings.js?v=adm-b0d853ee";
import { openProductDrawer } from "./drawers/product-drawer.js?v=adm-b0d853ee";

const renderers = {
  dashboard: renderDashboard, products: renderProducts,
  home: renderHome, leads: renderLeads, categories: renderCategories, combos: renderCombos,
  access: renderAccess, settings: renderSettings,
};

/* ----------------------------- chrome (nav) ----------------------------- */
export function buildChrome() {
  const nav = $("#adminNav");
  const primary = NAV.filter((n) => n.primary);
  const secondary = NAV.filter((n) => !n.primary);

  nav.innerHTML =
    `<span class="ad-nav__group-label">Operación</span>` +
    primary.map(navItem).join("") +
    `<span class="ad-nav__group-label">Configuración</span>` +
    secondary.map(navItem).join("");

  // tab-bar móvil: 4 primarias + "Más"
  $("#adminTabbar").innerHTML =
    primary.map((n) => `
      <button class="ad-tab" type="button" data-go="${n.key}">
        ${ico(n.icon)}${esc(n.label)}
      </button>`).join("") +
    `<button class="ad-tab" type="button" data-sheet-open>${ico("menu")}Más</button>`;

  // sheet "Más"
  $("#adminSheetGrid").innerHTML =
    secondary.map(navItem).join("") +
    `<button class="ad-logout" type="button" data-logout style="grid-column:1 / -1;margin-top:4px">${ico("log-out")}Cerrar sesión</button>`;

  // listeners
  if (window.javyIcons) window.javyIcons.enhance(document);

  document.addEventListener("click", (e) => {
    const goBtn = e.target.closest("[data-go]");
    if (goBtn) { go(goBtn.getAttribute("data-go")); closeSheet(); return; }
    if (e.target.closest("[data-sheet-open]")) { openSheet(); return; }
    if (e.target.closest("[data-close-sheet]")) { closeSheet(); return; }
    if (e.target.closest("[data-logout]") || e.target.closest("#adminLogoutBtn")) { logout(); return; }
  });

}

function navItem(n) {
  return `<button class="ad-nav__item${state.active === n.key ? " is-active" : ""}" type="button" data-go="${n.key}">
    ${ico(n.icon)}<span class="ad-nav__text">${esc(n.label)}</span>
  </button>`;
}

function openSheet() { $("#adminSheet").classList.add("is-open"); }
function closeSheet() { $("#adminSheet").classList.remove("is-open"); }

async function logout() {
  try { await window.supabaseClient.auth.signOut(); } catch (_) {}
  window.location.href = "login.html";
}

/* ----------------------------- router ----------------------------- */
export function go(key) {
  const nav = NAV.find((n) => n.key === key) || NAV[0];
  state.active = nav.key;
  $("#adminTitle").textContent = nav.label;
  $("#adminSubtitle").textContent = nav.subtitle;
  $$(".ad-nav__item, .ad-tab").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-go") === nav.key);
  });
  try {
    (renderers[nav.key] || renderDashboard)();
  } catch (error) {
    console.error("Error al renderizar la sección", nav.key, error);
    showViewError(error, nav.label);
  }
}

// Re-renderiza la sección activa (lo piden los flujos de guardado/borrado).
export function requestRerender() {
  const r = renderers[state.active];
  if (!r) return;
  try {
    r();
  } catch (error) {
    console.error("Error al re-renderizar la sección", state.active, error);
    showViewError(error, state.active);
  }
}

// Cablea los botones [data-edit] de una vista para abrir el drawer de producto.
export function bindEditClicks(root) {
  root.querySelectorAll("[data-edit]").forEach((el) => {
    const id = el.getAttribute("data-edit");
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const product = state.products.find((p) => String(p.id) === String(id));
      if (product) openProductDrawer(product);
    });
  });
}
