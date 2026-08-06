/* ============================================================================
   Pestaña Historial (dentro de Ajustes): feed cronológico de la actividad del
   panel (quién creó/editó/eliminó qué) con filtros y paginación "Ver más".
   Lee de window.catalogDb.getActivityLog(). Degrada elegante si no hay tabla.
   ============================================================================ */
import { state } from "../state.js?v=adm-b0d853ee";
import { esc, ico } from "../helpers.js?v=adm-b0d853ee";
import { paint } from "../view.js?v=adm-b0d853ee";
import { emptyFeature } from "../ui.js?v=adm-b0d853ee";

const PAGE = 30;

const ENTITY_LABELS = { product: "Producto", flavor: "Sabor", category: "Categoría", combo: "Combo", admin: "Acceso", lead: "Mensaje" };
const ACTION_META = {
  create: { icon: "plus", tone: "ok" },
  update: { icon: "pencil", tone: "blue" },
  price: { icon: "tags", tone: "blue" },
  availability: { icon: "power", tone: "amber" },
  delete: { icon: "trash", tone: "bad" },
};

let ctx = null;

export function renderHistoryTab(container) {
  ctx = { container, items: [], offset: 0, done: false, filters: { entityType: "", action: "", actor: "" } };
  paint(container, shell());
  container.querySelectorAll("[data-hist]").forEach((sel) => {
    sel.addEventListener("change", () => {
      ctx.filters[sel.getAttribute("data-hist")] = sel.value;
      ctx.items = [];
      ctx.offset = 0;
      ctx.done = false;
      loadMore();
    });
  });
  loadMore();
}

function shell() {
  const f = ctx.filters;
  const ent = opts([["", "Todo tipo"], ["product", "Productos"], ["flavor", "Sabores"], ["combo", "Combos"], ["category", "Categorías"], ["admin", "Accesos"]], f.entityType);
  const act = opts([["", "Toda acción"], ["create", "Creaciones"], ["update", "Ediciones"], ["price", "Cambios de precio"], ["availability", "Disponibilidad"], ["delete", "Eliminaciones"]], f.action);
  const actorPairs = [["", "Todos"]].concat((state.admins || []).filter((a) => a.email).map((a) => [a.email, a.email.split("@")[0]]));
  const actor = opts(actorPairs, f.actor);
  return `
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Auditoría</p><p>Quién creó, editó o eliminó qué, y cuándo. Lo más reciente primero.</p></div>
    </div>
    <div class="ad-filters">
      <span class="ad-filters__ico">${ico("filter")}</span>
      <select class="ad-select" data-hist="entityType" aria-label="Filtrar por tipo">${ent}</select>
      <select class="ad-select" data-hist="action" aria-label="Filtrar por acción">${act}</select>
      <select class="ad-select" data-hist="actor" aria-label="Filtrar por administrador">${actor}</select>
    </div>
    <div id="adHistFeed"></div>
    <div id="adHistMore" class="ad-feed__more"></div>`;
}

function opts(pairs, selected) {
  return pairs.map(([v, l]) => `<option value="${esc(v)}"${v === selected ? " selected" : ""}>${esc(l)}</option>`).join("");
}

async function loadMore() {
  const feed = ctx.container.querySelector("#adHistFeed");
  const more = ctx.container.querySelector("#adHistMore");
  if (ctx.offset === 0) feed.innerHTML = `<p class="ad-feed__loading">Cargando historial…</p>`;
  let rows;
  try {
    rows = await window.catalogDb.getActivityLog({
      limit: PAGE,
      offset: ctx.offset,
      entityType: ctx.filters.entityType || undefined,
      action: ctx.filters.action || undefined,
      actor: ctx.filters.actor || undefined,
    });
  } catch (error) {
    feed.innerHTML = `<div class="ad-error"><p>${esc(error.message || error)}</p></div>`;
    more.innerHTML = "";
    return;
  }

  if (ctx.offset === 0 && rows.length === 0) {
    const hasFilters = ctx.filters.entityType || ctx.filters.action || ctx.filters.actor;
    paint(feed, emptyFeature(
      hasFilters ? "Sin resultados" : "Sin actividad todavía",
      hasFilters
        ? "No hay cambios que coincidan con los filtros elegidos."
        : "Cuando crees, edites o elimines productos, combos o categorías, los cambios aparecerán aquí. Si recién instalaste esta función, aplica la migración fase6-actividad.sql en Supabase."
    ));
    more.innerHTML = "";
    return;
  }

  ctx.items = ctx.items.concat(rows);
  ctx.offset += rows.length;
  ctx.done = rows.length < PAGE;
  renderList();
}

function renderList() {
  const feed = ctx.container.querySelector("#adHistFeed");
  const more = ctx.container.querySelector("#adHistMore");
  paint(feed, `<div class="ad-feed">${ctx.items.map(itemHtml).join("")}</div>`);
  if (ctx.done) {
    more.innerHTML = `<p class="ad-feed__end">No hay más cambios.</p>`;
  } else {
    more.innerHTML = `<button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-hist-more>Ver más</button>`;
    const btn = more.querySelector("[data-hist-more]");
    btn.addEventListener("click", () => { btn.disabled = true; btn.textContent = "Cargando…"; loadMore(); });
  }
}

function itemHtml(row) {
  const meta = ACTION_META[row.action] || { icon: "pencil", tone: "blue" };
  const who = row.actor_email ? row.actor_email.split("@")[0] : "Sistema";
  const when = new Date(row.created_at);
  const abs = isNaN(when) ? "" : when.toLocaleString("es");
  const entity = ENTITY_LABELS[row.entity_type] || row.entity_type || "";
  const text = row.summary || `${row.action} ${row.entity_name || ""}`.trim();
  return `
    <div class="ad-feed__item">
      <span class="ad-feed__icon ad-feed__icon--${meta.tone}">${ico(meta.icon)}</span>
      <div class="ad-feed__body">
        <p class="ad-feed__text"><strong>${esc(who)}</strong> ${esc(text)}</p>
        <span class="ad-feed__meta" title="${esc(abs)}">${esc(relTime(when))}${entity ? " · " + esc(entity) : ""}</span>
      </div>
    </div>`;
}

function relTime(date) {
  if (isNaN(date)) return "sin fecha";
  const min = Math.floor((Date.now() - date.getTime()) / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  const w = Math.floor(d / 7);
  if (w < 4) return `hace ${w} sem`;
  const m = Math.floor(d / 30);
  return m <= 1 ? "hace 1 mes" : `hace ${m} meses`;
}
