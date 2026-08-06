/* ============================================================================
   Sección Mensajes (leads): historial del formulario de contacto retirado.
   Aquí el admin conserva las solicitudes anteriores, responde por
   WhatsApp y marca su estado. Lee de window.catalogDb.getLeads(); degrada
   elegante si falta la migración fase7-leads.sql.
   ============================================================================ */
import { esc, ico, agoLabel } from "../helpers.js?v=adm-b0d853ee";
import { setView, paint } from "../view.js?v=adm-b0d853ee";
import { toast, emptyFeature } from "../ui.js?v=adm-b0d853ee";

const STATUS = [["", "Todos"], ["nuevo", "Nuevos"], ["atendido", "Atendidos"], ["archivado", "Archivados"]];
const STATUS_LABEL = { nuevo: "Nuevo", atendido: "Atendido", archivado: "Archivado" };
const STATUS_PILL = { nuevo: "low", atendido: "ok", archivado: "home" };

let ctx = { status: "", items: [] };

export function renderLeads() {
  ctx = { status: ctx.status || "", items: [] };
  setView(shell());
  const view = document.getElementById("adminView");
  view.querySelectorAll("[data-leads-status]").forEach((sel) =>
    sel.addEventListener("change", () => { ctx.status = sel.value; load(); }));
  load();
}

function shell() {
  const opts = STATUS
    .map(([v, l]) => `<option value="${esc(v)}"${v === ctx.status ? " selected" : ""}>${esc(l)}</option>`)
    .join("");
  return `
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Mensajes</p><p>Historial de solicitudes capturadas antes de retirar el formulario. Lo más reciente primero.</p></div>
    </div>
    <div class="ad-filters">
      <span class="ad-filters__ico">${ico("filter")}</span>
      <select class="ad-select" data-leads-status aria-label="Filtrar por estado">${opts}</select>
    </div>
    <div id="adLeadsFeed"></div>`;
}

async function load() {
  const feed = document.getElementById("adLeadsFeed");
  if (!feed) return;
  feed.innerHTML = `<p class="ad-feed__loading">Cargando mensajes…</p>`;
  let rows;
  try {
    rows = await window.catalogDb.getLeads({ status: ctx.status || undefined, limit: 100 });
  } catch (error) {
    paint(feed, emptyFeature(
      "No se pudieron cargar los mensajes",
      `Si recién instalaste esta función, aplica la migración fase7-leads.sql en Supabase. Detalle: ${error.message || error}`
    ));
    return;
  }
  ctx.items = rows;
  renderList();
}

function renderList() {
  const feed = document.getElementById("adLeadsFeed");
  if (!feed) return;
  if (!ctx.items.length) {
    paint(feed, emptyFeature(
      ctx.status ? "Sin mensajes con ese estado" : "Sin mensajes todavía",
      ctx.status
        ? "No hay solicitudes que coincidan con el filtro elegido."
        : "No hay solicitudes históricas guardadas. Las cotizaciones nuevas llegan directamente por WhatsApp."
    ));
    return;
  }
  paint(feed, `<div class="ad-feed">${ctx.items.map(card).join("")}</div>`);
  feed.querySelectorAll("[data-lead-action]").forEach((btn) =>
    btn.addEventListener("click", () =>
      act(btn.getAttribute("data-lead-action"), btn.getAttribute("data-lead-id"))));
}

// Arma el enlace de WhatsApp al cliente (teléfono panameño, prefijo 507).
function waLink(phone) {
  const digits = String(phone || "").replace(/[^0-9]/g, "").replace(/^507/, "");
  return digits ? `https://wa.me/507${digits}` : "";
}

function card(r) {
  const pill = STATUS_PILL[r.status] || "home";
  const wa = waLink(r.phone);
  return `
    <article class="ad-feed__item">
      <span class="ad-feed__icon ad-feed__icon--blue">${ico("mail")}</span>
      <div class="ad-feed__body">
        <p class="ad-feed__text"><strong>${esc(r.name)}</strong> <span class="ad-pill ad-pill--${pill}">${esc(STATUS_LABEL[r.status] || r.status)}</span></p>
        <p class="ad-feed__text">${ico("package")} ${esc(r.product || "—")}</p>
        ${r.message ? `<p class="ad-lead__msg">${esc(r.message)}</p>` : ""}
        <span class="ad-feed__meta">${esc(r.email || "—")} · ${esc(r.phone || "—")} · ${esc(agoLabel(r.created_at))}</span>
        <div class="ad-lead__actions">
          ${wa ? `<a class="ad-btn ad-btn--sm" href="${esc(wa)}" target="_blank" rel="noopener">${ico("message-circle")} Responder</a>` : ""}
          ${r.status !== "atendido" ? `<button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-lead-action="atendido" data-lead-id="${esc(r.id)}">Marcar atendido</button>` : ""}
          ${r.status !== "archivado" ? `<button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-lead-action="archivado" data-lead-id="${esc(r.id)}">Archivar</button>` : ""}
        </div>
      </div>
    </article>`;
}

async function act(status, id) {
  try {
    await window.catalogDb.updateLeadStatus(id, status);
    toast({ msg: status === "atendido" ? "Mensaje marcado como atendido" : "Mensaje archivado" });
    load();
  } catch (error) {
    toast({ tone: "err", msg: error.message || "No se pudo actualizar el mensaje" });
  }
}
