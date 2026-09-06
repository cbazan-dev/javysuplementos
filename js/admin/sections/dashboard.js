/* ============================================================================
   Sección Dashboard: stats, centro de operaciones y últimos agregados.
   ============================================================================ */
import { state } from "../state.js?v=adm-90d40885";
import { STALE_DAYS, HOME_MAX, HOME_MIN } from "../config.js?v=adm-90d40885";
import { $, esc, ico, imgTag, peso, isAvailable, isMissingImage, hasOffer, discountPct, daysSince, agoLabel } from "../helpers.js?v=adm-90d40885";
import { setView } from "../view.js?v=adm-90d40885";
import { go, bindEditClicks } from "../shell.js?v=adm-90d40885";

export function renderDashboard() {
  const p = state.products;
  const activeCount = p.filter(isAvailable).length;
  const homeList = p.filter((x) => x.show_on_home);
  const offers = p.filter(hasOffer);
  const out = p.filter((x) => !isAvailable(x));
  const stale = out.filter((x) => daysSince(x.updated_at) >= STALE_DAYS);
  const noImg = p.filter(isMissingImage).length;

  const stats = [
    { key: "products", label: "Productos activos", value: activeCount, tone: "ok", icon: "layout-dashboard",
      delta: `${p.length} en total`, dir: "flat" },
    { key: "home", label: "En el inicio", value: homeList.length, tone: "blue", icon: "home",
      delta: `${homeList.length} / ${HOME_MAX}`, dir: homeList.length >= HOME_MIN ? "flat" : "down" },
    { key: "offers", label: "Ofertas activas", value: offers.length, tone: "blue", icon: "tags",
      delta: "con descuento", dir: "up" },
    { key: "out", label: "Agotados", value: out.length, tone: "bad", icon: "package",
      delta: out.length ? "requieren acción" : "todo disponible", dir: out.length ? "down" : "flat" },
    { key: "noimg", label: "Sin imagen", value: noImg, tone: noImg ? "bad" : "ok", icon: "upload",
      delta: noImg ? "faltan fotos" : "todas con foto", dir: noImg ? "down" : "flat" },
  ];

  const statCard = (s) => {
    const dirIcon = s.dir === "up" ? "arrow-up" : s.dir === "down" ? "arrow-down" : "clock";
    return `<button class="ad-stat ad-stat--${s.tone} ad-stat--link" type="button" data-stat="${s.key}">
      <div class="ad-stat__top"><span class="ad-stat__label">${esc(s.label)}</span><span class="ad-stat__icon">${ico(s.icon)}</span></div>
      <div class="ad-stat__value">${s.value}</div>
      <span class="ad-stat__delta ad-delta--${s.dir}">${ico(dirIcon)}${esc(s.delta)}</span>
    </button>`;
  };

  const opsAgotados = out.slice().sort((a, b) => daysSince(b.updated_at) - daysSince(a.updated_at)).slice(0, 4);
  const opsOfertas = offers.slice(0, 4);
  const attention = out.length;

  const opsItem = (p2, right) => `
    <div class="ad-ops__item ad-ops__item--link" data-edit="${esc(p2.id)}">
      ${imgTag(p2.image)}
      <div class="ad-ops__info"><strong>${esc(p2.name)}</strong><small>${esc(p2.brand || p2.category || "—")} · ${esc(agoLabel(p2.updated_at))}</small></div>
      ${right}
    </div>`;

  const opsList = (arr, right, empty) =>
    arr.length ? arr.map((x) => opsItem(x, right(x))).join("") : `<p class="ad-ops__empty">${esc(empty)}</p>`;

  const recent = p.slice().sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 6);

  setView(`
    <div class="ad-stats">${stats.map(statCard).join("")}</div>

    <div class="ad-panel">
      <div class="ad-ops__header">
        <h2>Centro de operaciones</h2>
        <span class="ad-ops__attention">${ico("package")}${attention} requieren acción</span>
      </div>
      <div class="ad-ops">
        <div class="ad-ops__panel ad-ops__panel--alert">
          <div class="ad-ops__panel-head"><h3>Agotados</h3><span class="ad-ops__count">${out.length}</span></div>
          <div class="ad-ops__list">${opsList(opsAgotados, () => `<button class="ad-btn ad-btn--ghost ad-btn--sm" type="button">Reactivar</button>`, "Nada agotado 🎉")}</div>
        </div>
        <div class="ad-ops__panel">
          <div class="ad-ops__panel-head"><h3>Ofertas activas</h3><span class="ad-ops__count">${offers.length}</span></div>
          <div class="ad-ops__list">${opsList(opsOfertas, (x) => `<span class="ad-ops__discount">-${discountPct(x)}%</span>`, "Sin ofertas activas.")}</div>
        </div>
        <div class="ad-ops__panel">
          <div class="ad-ops__panel-head"><h3>Agotado hace mucho</h3><span class="ad-ops__count">${stale.length}</span></div>
          <div class="ad-ops__list">${opsList(stale.slice(0, 4), () => `<button class="ad-btn ad-btn--ghost ad-btn--sm" type="button">Revisar</button>`, "Nada pendiente.")}</div>
        </div>
      </div>
    </div>

    <div class="ad-panel">
      <div class="ad-panel__head"><div><p class="ad-kicker">Catálogo</p><h2>Últimos agregados</h2></div></div>
      <div class="ad-recent">
        ${recent.map((p2) => `
          <div class="ad-recent__row">
            ${imgTag(p2.image)}
            <div class="ad-recent__info"><strong>${esc(p2.name)}</strong><small>${esc(p2.brand || "")}${p2.category ? " · " + esc(p2.category) : ""}</small></div>
            <span class="ad-price">${esc(peso(p2.price))}</span>
            <button class="ad-icon-btn" type="button" title="Editar" data-edit="${esc(p2.id)}" data-write-only>${ico("pencil")}</button>
          </div>`).join("") || `<p class="ad-ops__empty">Aún no hay productos.</p>`}
      </div>
    </div>
  `);

  const view = $("#adminView");
  view.querySelectorAll("[data-stat]").forEach((b) => b.addEventListener("click", () => {
    const k = b.getAttribute("data-stat");
    if (k === "home") return go("home");
    if (k === "offers") { state.productFilter = "offers"; return go("products"); }
    if (k === "out") { state.productFilter = "out"; return go("products"); }
    if (k === "noimg") { state.productFilter = "noimg"; return go("products"); }
    state.productFilter = "all"; go("products");
  }));
  bindEditClicks(view);
}
