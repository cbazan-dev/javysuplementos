/* ============================================================================
   Sección Combos: paquetes a precio especial con ahorro vs. precio de lista.
   ============================================================================ */
import { state } from "../state.js?v=adm-b0d853ee";
import { $, esc, ico, imgTag, peso } from "../helpers.js?v=adm-b0d853ee";
import { setView } from "../view.js?v=adm-b0d853ee";
import { emptyFeature, switchMarkup, confirmModal, toast } from "../ui.js?v=adm-b0d853ee";
import { openComboDrawer } from "../drawers/combo-drawer.js?v=adm-b0d853ee";

export function renderCombos() {
  if (!state.combosSupported) {
    setView(emptyFeature("Combos no disponibles", "Aplicá la migración de combos en Supabase para crear y gestionar paquetes."));
    return;
  }
  const listPriceOf = (c) => c.items.reduce((s, it) => {
    const p = state.products.find((x) => String(x.id) === String(it.product_id));
    return s + (p ? Number(p.price || 0) : 0) * (it.quantity || 1);
  }, 0);

  const cards = state.combos.map((c) => {
    const listPrice = listPriceOf(c);
    const save = Math.max(0, listPrice - Number(c.price || 0));
    return `
    <div class="ad-combo-card${c.is_active ? "" : " is-inactive"}" data-combo="${esc(c.id)}">
      <div class="ad-combo-card__head">
        <h3>${esc(c.name)}</h3>
        ${switchMarkup(c.is_active, "data-combo-active='" + esc(c.id) + "'")}
      </div>
      <div class="ad-combo-items">
        ${c.items.map((it) => `
          <div class="ad-combo-item">${imgTag(it.product_image)}<div><strong>${esc(it.product_name)}</strong>${it.flavor_name ? `<small>${esc(it.flavor_name)}</small>` : ""}</div><span class="ad-combo-item__qty">×${it.quantity || 1}</span></div>`).join("") || `<small style="color:var(--pb-muted)">Sin productos todavía</small>`}
      </div>
      <div class="ad-combo-card__price">
        <span class="ad-price">${esc(peso(c.price))}</span>
        ${listPrice > 0 ? `<s>${esc(peso(listPrice))}</s>` : ""}
        ${save > 0 ? `<span class="ad-pill ad-pill--ok ad-combo-card__save">Ahorro ${esc(peso(save))}</span>` : ""}
      </div>
      <div style="display:flex;gap:8px">
        <button class="ad-btn ad-btn--ghost ad-btn--sm ad-btn--block" type="button" data-combo-edit="${esc(c.id)}">${ico("pencil")}Editar</button>
        <button class="ad-icon-btn ad-icon-btn--danger" type="button" title="Eliminar" data-combo-del="${esc(c.id)}">${ico("trash")}</button>
      </div>
    </div>`;
  }).join("");

  setView(`
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Paquetes</p><p>Combos de productos a precio especial. Cada combo muestra el ahorro frente al precio de lista.</p></div>
      <button class="ad-btn ad-btn--primary" type="button" data-combo-new>${ico("plus")}Crear combo</button>
    </div>
    ${state.combos.length ? `<div class="ad-combos-grid">${cards}</div>` : `<div class="ad-panel"><p class="ad-ops__empty">Aún no hay combos. Creá el primero.</p></div>`}`);

  const view = $("#adminView");
  view.querySelector("[data-combo-new]").addEventListener("click", () => openComboDrawer(null));
  view.querySelectorAll("[data-combo-edit]").forEach((b) => b.addEventListener("click", () => {
    const combo = state.combos.find((c) => String(c.id) === String(b.getAttribute("data-combo-edit")));
    if (combo) openComboDrawer(combo);
  }));
  view.querySelectorAll("[data-combo-del]").forEach((b) => b.addEventListener("click", () => deleteComboFlow(b.getAttribute("data-combo-del"))));
  view.querySelectorAll("[data-combo-active]").forEach((input) => input.addEventListener("change", () => toggleCombo(input.getAttribute("data-combo-active"), input.checked)));
}

async function toggleCombo(id, active) {
  try {
    const updated = await window.catalogDb.setComboActive(id, active);
    const combo = state.combos.find((c) => String(c.id) === String(id));
    if (combo) Object.assign(combo, updated);
    renderCombos();
  } catch (e) { toast({ tone: "err", msg: "No se pudo actualizar el combo", sub: e.message }); }
}
async function deleteComboFlow(id) {
  const combo = state.combos.find((c) => String(c.id) === String(id));
  if (!combo) return;
  const ok = await confirmModal({ title: "Eliminar combo", body: `Se eliminará “${combo.name}”.`, confirmLabel: "Eliminar", danger: true });
  if (!ok) return;
  try {
    await window.catalogDb.deleteCombo(id);
    state.combos = state.combos.filter((c) => String(c.id) !== String(id));
    toast({ tone: "err", msg: "Combo eliminado", sub: combo.name });
    renderCombos();
  } catch (e) { toast({ tone: "err", msg: "No se pudo eliminar", sub: e.message }); }
}
