/* ============================================================================
   Sección Inicio: curación de los productos destacados del home (orden + cupo).
   ============================================================================ */
import { state } from "../state.js?v=adm-b0d853ee";
import { HOME_MAX, HOME_MIN } from "../config.js?v=adm-b0d853ee";
import { $, esc, ico, imgTag, peso } from "../helpers.js?v=adm-b0d853ee";
import { setView } from "../view.js?v=adm-b0d853ee";
import { bindEditClicks } from "../shell.js?v=adm-b0d853ee";
import { toast } from "../ui.js?v=adm-b0d853ee";
import { reloadProducts } from "../data.js?v=adm-b0d853ee";

export function renderHome() {
  let ids = state.products
    .filter((p) => p.show_on_home)
    .sort((a, b) => (a.home_order ?? 999) - (b.home_order ?? 999))
    .map((p) => p.id);

  const draw = () => {
    const items = ids.map((id) => state.products.find((p) => p.id === id)).filter(Boolean);
    const full = ids.length >= HOME_MAX;
    const emptySlots = Math.max(0, HOME_MIN - ids.length);
    const poolOptions = state.products
      .filter((p) => !ids.includes(p.id))
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("");

    setView(`
      <div class="ad-section-intro">
        <div><p class="ad-kicker">Home</p><p>Curá los productos destacados que aparecen en la página principal. Ordená con las flechas. Entre ${HOME_MIN} y ${HOME_MAX} productos.</p></div>
        <span class="ad-counter${full ? " ad-counter--full" : ""}"><strong>${ids.length}</strong> / ${HOME_MAX} en el inicio</span>
      </div>
      <div class="ad-panel">
        <div class="ad-slots">
          ${items.map((p, i) => `
            <div class="ad-slot">
              <span class="ad-slot__order">${i + 1}</span>
              ${imgTag(p.image, "ad-slot__img")}
              <div class="ad-slot__main"><strong>${esc(p.name)}</strong><small>${esc(p.brand || "")} · ${esc(peso(p.price))}</small></div>
              <div class="ad-row__actions">
                <button class="ad-icon-btn" type="button" title="Subir" data-move="${i}|-1" ${i === 0 ? "disabled" : ""}>${ico("arrow-up")}</button>
                <button class="ad-icon-btn" type="button" title="Bajar" data-move="${i}|1" ${i === items.length - 1 ? "disabled" : ""}>${ico("arrow-down")}</button>
                <button class="ad-icon-btn" type="button" title="Editar" data-edit="${esc(p.id)}">${ico("pencil")}</button>
                <button class="ad-icon-btn ad-icon-btn--danger" type="button" title="Quitar del inicio" data-remove="${esc(p.id)}">${ico("x")}</button>
              </div>
            </div>`).join("")}
          ${Array.from({ length: emptySlots }).map((_, i) => `
            <div class="ad-slot ad-slot--empty"><span class="ad-slot__order">${ids.length + i + 1}</span><span>Espacio libre — agregá un producto destacado</span></div>`).join("")}
        </div>
        <div class="ad-field" style="margin-top:14px;max-width:420px">
          <label class="ad-field__label">Agregar producto al inicio</label>
          <div style="display:flex;gap:8px">
            <select class="ad-select" data-pool aria-label="Agregar producto al inicio" ${full ? "disabled" : ""}><option value="">Elegir…</option>${poolOptions}</select>
          </div>
          ${full ? `<span class="ad-field__help">Cupo lleno (${HOME_MAX}). Quitá uno para agregar otro.</span>` : ""}
        </div>
        <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
          <button class="ad-btn ad-btn--primary" type="button" data-save-home>${ico("save")}Guardar inicio</button>
          <span class="ad-field__help" style="align-self:center">${ids.length < HOME_MIN ? `Necesitás al menos ${HOME_MIN} productos para guardar.` : "Listo para guardar."}</span>
        </div>
      </div>`);

    const view = $("#adminView");
    view.querySelectorAll("[data-move]").forEach((b) => b.addEventListener("click", () => {
      const [i, dir] = b.getAttribute("data-move").split("|").map(Number);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      draw();
    }));
    view.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => {
      ids = ids.filter((id) => String(id) !== String(b.getAttribute("data-remove")));
      draw();
    }));
    const pool = view.querySelector("[data-pool]");
    if (pool) pool.addEventListener("change", () => {
      if (pool.value && ids.length < HOME_MAX) { ids.push(pool.value); draw(); }
    });
    view.querySelector("[data-save-home]").addEventListener("click", () => saveHome(ids));
    bindEditClicks(view);
  };

  draw();
}

async function saveHome(ids) {
  if (ids.length < HOME_MIN) { toast({ tone: "err", msg: `Elegí al menos ${HOME_MIN} productos.` }); return; }
  if (ids.length > HOME_MAX) { toast({ tone: "err", msg: `Máximo ${HOME_MAX} productos.` }); return; }
  try {
    await window.catalogDb.updateHomeProducts(ids);
    await reloadProducts();
    toast({ tone: "ok", msg: "Inicio actualizado", sub: `${ids.length} productos destacados` });
    renderHome();
  } catch (e) { toast({ tone: "err", msg: "No se pudo guardar el inicio", sub: e.message }); }
}
