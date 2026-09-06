/* ============================================================================
   Render de la vista principal (#adminView) y pantalla de error de sección.
   ============================================================================ */
import { $, esc, ico, wireImageFallbacks } from "./helpers.js?v=adm-90d40885";

export function setView(html) {
  const view = $("#adminView");
  if (window.javyDropdown) window.javyDropdown.destroy(view);
  view.innerHTML = `<div class="ad-section">${html}</div>`;
  view.closest(".ad-app")?.setAttribute("data-anim", "on");
  wireImageFallbacks(view);
  if (window.javyIcons) window.javyIcons.enhance(view);
  if (window.javyDropdown) window.javyDropdown.enhanceSelects(view);
  return view;
}

// Pinta HTML dentro de un contenedor cualquiera (sub-vistas, pestañas) y aplica
// los mismos realces que setView: íconos, selects embellecidos y fallback de imgs.
export function paint(container, html) {
  if (!container) return container;
  if (window.javyDropdown) window.javyDropdown.destroy(container);
  container.innerHTML = html;
  wireImageFallbacks(container);
  if (window.javyIcons) window.javyIcons.enhance(container);
  if (window.javyDropdown) window.javyDropdown.enhanceSelects(container);
  return container;
}

// Pinta un error legible dentro de #adminView (en vez de dejar la vista en blanco).
export function showViewError(error, where = "") {
  const view = $("#adminView");
  if (!view) return;
  view.innerHTML = `<div class="ad-section"><div class="ad-error">
    <h3>${ico("x")} No se pudo mostrar ${esc(where || "esta sección")}</h3>
    <p>${esc(error && error.message ? error.message : error)}</p>
    ${error && error.stack ? `<pre>${esc(error.stack)}</pre>` : ""}
    <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" onclick="location.reload()">Recargar</button>
  </div></div>`;
  view.closest(".ad-app")?.setAttribute("data-anim", "on");
  if (window.javyIcons) window.javyIcons.enhance(view);
}
