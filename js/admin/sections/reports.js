/* ============================================================================
   Pestaña Informes (dentro de Ajustes): genera informes del catálogo y de la
   actividad, con fecha de generación, vista en pantalla, impresión y PDF
   (guardar en el dispositivo o compartir).
   ============================================================================ */
import { state, catById } from "../state.js?v=adm-b0d853ee";
import { esc, ico, peso, hasOffer, discountPct, isAvailable, agoLabel } from "../helpers.js?v=adm-b0d853ee";
import { paint } from "../view.js?v=adm-b0d853ee";
import { toast } from "../ui.js?v=adm-b0d853ee";
import { buildTable, printReport, slugify, buildReportPDF, saveOrShare } from "../export.js?v=adm-b0d853ee";

export function renderReportsTab(container) {
  paint(container, `
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Informes</p><p>Genera un resumen del catálogo o de la actividad. Cada informe muestra su fecha de generación y puede imprimirse o guardarse y compartirse en PDF.</p></div>
    </div>
    <div class="ad-rep-grid">
      ${card("precios", "file-text", "Lista de precios", "Todos los productos con su precio actual, oferta y estado.")}
      ${card("stock", "package", "Stock: agotados", "Productos agotados o no disponibles y desde cuándo.")}
      ${card("ofertas", "tags", "Ofertas y descuentos", "Productos en oferta: precio anterior, nuevo y % de descuento.")}
      ${cardActividad()}
    </div>
    <div id="adRepResult" class="ad-rep-result"></div>
  `);

  container.querySelectorAll("[data-rep]").forEach((btn) => {
    btn.addEventListener("click", () => onGenerate(container, btn.getAttribute("data-rep")));
  });
}

function card(key, icon, title, desc) {
  return `<div class="ad-rep-card">
    <span class="ad-rep-card__icon">${ico(icon)}</span>
    <h3>${esc(title)}</h3>
    <p>${esc(desc)}</p>
    <button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-rep="${key}">${ico("file-text")}Generar</button>
  </div>`;
}

function cardActividad() {
  return `<div class="ad-rep-card">
    <span class="ad-rep-card__icon">${ico("clock")}</span>
    <h3>Actividad de administradores</h3>
    <p>Resumen de cambios por administrador en un período.</p>
    <select class="ad-select" data-rep-period aria-label="Período">
      <option value="7">Últimos 7 días</option>
      <option value="30" selected>Últimos 30 días</option>
      <option value="90">Últimos 90 días</option>
      <option value="0">Todo el historial</option>
    </select>
    <button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-rep="actividad">${ico("file-text")}Generar</button>
  </div>`;
}

async function onGenerate(container, key) {
  const result = container.querySelector("#adRepResult");
  paint(result, `<div class="ad-panel"><p class="ad-feed__loading">Generando informe…</p></div>`);
  let rep;
  try {
    if (key === "precios") rep = repPrecios();
    else if (key === "stock") rep = repStock();
    else if (key === "ofertas") rep = repOfertas();
    else if (key === "actividad") rep = await repActividad(Number(container.querySelector("[data-rep-period]")?.value || 30));
    else return;
  } catch (error) {
    paint(result, `<div class="ad-panel"><div class="ad-error"><p>${esc(error.message || error)}</p></div></div>`);
    return;
  }
  renderResult(result, rep);
}

/* ----------------------------- definición de informes ----------------------------- */
function categoryLabel(p) {
  return p.category || (p.category_id ? (catById(p.category_id)?.name || "—") : "—");
}

function repPrecios() {
  const rows = state.products
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"))
    .map((p) => [p.name || "—", categoryLabel(p), p.presentation || "—", peso(p.price), hasOffer(p) ? peso(p.old_price) : "—", isAvailable(p) ? "Disponible" : "Agotado"]);
  return { title: "Lista de precios actuales", columns: ["Producto", "Categoría", "Presentación", "Precio", "Antes (oferta)", "Estado"], rows };
}

function repStock() {
  const rows = state.products
    .filter((p) => !isAvailable(p))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"))
    .map((p) => [p.name || "—", categoryLabel(p), p.presentation || "—", peso(p.price), agoLabel(p.updated_at)]);
  return { title: "Stock — agotados / por reponer", columns: ["Producto", "Categoría", "Presentación", "Precio", "Agotado"], rows, empty: "¡Todo el catálogo está disponible! No hay productos agotados." };
}

function repOfertas() {
  const rows = state.products
    .filter(hasOffer)
    .sort((a, b) => discountPct(b) - discountPct(a))
    .map((p) => [p.name || "—", peso(p.old_price), peso(p.price), discountPct(p) + "%"]);
  return { title: "Ofertas y descuentos", columns: ["Producto", "Precio anterior", "Precio oferta", "Descuento"], rows, empty: "No hay ofertas activas en este momento." };
}

async function repActividad(days) {
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;
  const all = [];
  let offset = 0;
  for (let i = 0; i < 15; i++) {
    const batch = await window.catalogDb.getActivityLog({ limit: 200, offset, since });
    all.push(...batch);
    if (batch.length < 200) break;
    offset += batch.length;
  }
  const byActor = new Map();
  for (const r of all) {
    const key = r.actor_email || "—";
    if (!byActor.has(key)) byActor.set(key, { total: 0, create: 0, update: 0, price: 0, availability: 0, delete: 0 });
    const a = byActor.get(key);
    a.total += 1;
    if (a[r.action] !== undefined) a[r.action] += 1;
  }
  const rows = [...byActor.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([email, a]) => [email.split("@")[0], String(a.total), String(a.create), String(a.update), String(a.price), String(a.availability), String(a.delete)]);
  return { title: "Actividad de administradores", columns: ["Administrador", "Total", "Creaciones", "Ediciones", "Precios", "Disponibilidad", "Eliminaciones"], rows, empty: "No hay actividad registrada en el período elegido (o falta aplicar la migración fase6)." };
}

/* ----------------------------- render del resultado ----------------------------- */
function renderResult(result, rep) {
  const meta = `Generado el ${new Date().toLocaleString("es")} · ${rep.rows.length} ${rep.rows.length === 1 ? "registro" : "registros"}`;

  if (!rep.rows.length) {
    paint(result, `<div class="ad-panel">
      <div class="ad-rep-head"><div><p class="ad-kicker">Informe</p><h2>${esc(rep.title)}</h2><p class="ad-rep-meta">${esc(meta)}</p></div></div>
      <p class="ad-rep-empty">${esc(rep.empty || "No hay datos para este informe.")}</p>
    </div>`);
    return;
  }

  paint(result, `<div class="ad-panel">
    <div class="ad-rep-head">
      <div><p class="ad-kicker">Informe</p><h2>${esc(rep.title)}</h2><p class="ad-rep-meta">${esc(meta)}</p></div>
      <div class="ad-rep-actions">
        <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-rep-print>${ico("printer")}Imprimir</button>
        <button class="ad-btn ad-btn--primary ad-btn--sm" type="button" data-rep-save>${ico("share-2")}Guardar / Compartir</button>
      </div>
    </div>
    <div class="ad-rep-scroll">${buildTable(rep.columns, rep.rows, "ad-table")}</div>
  </div>`);

  result.querySelector("[data-rep-save]").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const blob = buildReportPDF(rep.title, meta, rep.columns, rep.rows);
      const mode = await saveOrShare(`${slugify(rep.title)}.pdf`, blob, {
        title: rep.title,
        text: `${rep.title} — ${meta}`,
      });
      if (mode === "shared") toast({ tone: "ok", msg: "Informe compartido" });
      else if (mode === "saved" || mode === "downloaded") toast({ tone: "ok", msg: "Informe guardado", sub: "Se descargó el PDF del informe." });
    } catch (error) {
      toast({ tone: "err", msg: "No se pudo generar el PDF", sub: error.message || String(error) });
    } finally {
      btn.disabled = false;
    }
  });
  result.querySelector("[data-rep-print]").addEventListener("click", () => {
    if (!printReport(rep.title, meta, rep.columns, rep.rows)) {
      toast({ tone: "err", msg: "El navegador bloqueó la ventana de impresión", sub: "Permite las ventanas emergentes e intenta de nuevo." });
    }
  });
}
