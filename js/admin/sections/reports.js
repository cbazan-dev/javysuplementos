/* ============================================================================
   Pestaña Informes (dentro de Ajustes): genera informes del catálogo y de la
   actividad, con fecha de generación, vista en pantalla, impresión y PDF
   (guardar en el dispositivo o compartir).
   ============================================================================ */
import { state, catById, families, typesOf } from "../state.js?v=adm-90d40885";
import { esc, ico, peso, hasOffer, discountPct, isAvailable, isMissingImage, agoLabel } from "../helpers.js?v=adm-90d40885";
import { paint } from "../view.js?v=adm-90d40885";
import { toast } from "../ui.js?v=adm-90d40885";
import { buildTable, printReport, slugify, buildReportPDF, saveOrShare } from "../export.js?v=adm-90d40885";

export function renderReportsTab(container) {
  paint(container, `
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Informes</p><p>Genera un resumen del catálogo o de la actividad. Cada informe muestra su fecha de generación y puede imprimirse o guardarse y compartirse en PDF.</p></div>
    </div>
    ${cardMedida()}
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

  // Contador en vivo: saber cuántos productos entran ANTES de generar evita el
  // ida y vuelta de armar un PDF para descubrir que quedó vacío.
  const refrescarConteo = () => {
    const n = filtrarProductos(leerFiltros(container)).length;
    const el = container.querySelector("[data-rep-count]");
    if (el) el.textContent = n === 1 ? "1 producto" : `${n} productos`;
    const btn = container.querySelector('[data-rep="medida"]');
    if (btn) btn.disabled = n === 0;
  };
  container.querySelectorAll("[data-mf]").forEach((el) => el.addEventListener("change", refrescarConteo));
  refrescarConteo();
}

/* ----------------------------- informe a medida ----------------------------- */
/* Los filtros son los que pidió el dueño: disponibilidad y categoría ("solo
   disponibles", "solo proteínas"), más marca y oferta, que salen gratis del
   mismo modelo. Cada uno es un <select> simple en vez de una cascada
   familia→tipo: para elegir "Creatinas" no hace falta elegir antes su familia. */
const MEDIDA_ESTADOS = [
  ["todos", "Disponibles y agotados"],
  ["disponibles", "Solo disponibles"],
  ["agotados", "Solo agotados"],
];

function opcionesCategoria() {
  // Una opción por familia y otra por cada tipo, agrupadas bajo su familia.
  return families().map((fam) => {
    const tipos = typesOf(fam.id);
    const propias = [`<option value="fam:${esc(fam.id)}">Toda la familia ${esc(fam.name)}</option>`]
      .concat(tipos.map((t) => `<option value="cat:${esc(t.id)}">${esc(t.name)}</option>`));
    return `<optgroup label="${esc(fam.name)}">${propias.join("")}</optgroup>`;
  }).join("");
}

function opcionesMarca() {
  const marcas = [...new Set(state.products.map((p) => (p.brand || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));
  return marcas.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
}

function cardMedida() {
  return `<div class="ad-panel ad-rep-medida">
    <div class="ad-rep-medida__head">
      <div>
        <p class="ad-kicker">Informe a medida</p>
        <h3>Arma el PDF con lo que necesites</h3>
        <p class="ad-field__help">Combina los filtros y genera solo esa parte del catálogo.</p>
      </div>
      <span class="ad-counter"><strong data-rep-count>—</strong></span>
    </div>
    <div class="ad-rep-medida__filtros">
      <div class="ad-field">
        <label class="ad-field__label" for="repEstado">Disponibilidad</label>
        <select class="ad-select" id="repEstado" data-mf="estado">
          ${MEDIDA_ESTADOS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}
        </select>
      </div>
      <div class="ad-field">
        <label class="ad-field__label" for="repCategoria">Categoría</label>
        <select class="ad-select" id="repCategoria" data-mf="categoria">
          <option value="">Todas las categorías</option>
          ${opcionesCategoria()}
        </select>
      </div>
      <div class="ad-field">
        <label class="ad-field__label" for="repMarca">Marca</label>
        <select class="ad-select" id="repMarca" data-mf="marca">
          <option value="">Todas las marcas</option>
          ${opcionesMarca()}
        </select>
      </div>
      <div class="ad-field">
        <label class="ad-field__label" for="repExtra">Filtro extra</label>
        <select class="ad-select" id="repExtra" data-mf="extra">
          <option value="">Sin filtro extra</option>
          <option value="oferta">Solo en oferta</option>
          <option value="inicio">Solo los del inicio</option>
          <option value="sin-precio">Solo sin precio cargado</option>
          <option value="sin-imagen">Solo sin imagen</option>
        </select>
      </div>
    </div>
    <div class="ad-save-row">
      <button class="ad-btn ad-btn--primary" type="button" data-rep="medida">${ico("file-text")}Generar informe</button>
    </div>
  </div>`;
}

function leerFiltros(container) {
  const v = (k) => container.querySelector(`[data-mf="${k}"]`)?.value || "";
  return { estado: v("estado") || "todos", categoria: v("categoria"), marca: v("marca"), extra: v("extra") };
}

function filtrarProductos(f) {
  // Los hijos de una familia se resuelven una vez, no por producto.
  let hijos = null;
  if (f.categoria.startsWith("fam:")) {
    const famId = f.categoria.slice(4);
    hijos = new Set([famId, ...typesOf(famId).map((t) => String(t.id))].map(String));
  }

  return state.products.filter((p) => {
    if (f.estado === "disponibles" && !isAvailable(p)) return false;
    if (f.estado === "agotados" && isAvailable(p)) return false;

    if (hijos && !hijos.has(String(p.category_id))) return false;
    if (f.categoria.startsWith("cat:") && String(p.category_id) !== f.categoria.slice(4)) return false;

    if (f.marca && (p.brand || "").trim() !== f.marca) return false;

    if (f.extra === "oferta" && !hasOffer(p)) return false;
    if (f.extra === "inicio" && !p.show_on_home) return false;
    if (f.extra === "sin-precio" && Number(p.price) > 0) return false;
    if (f.extra === "sin-imagen" && !isMissingImage(p)) return false;
    return true;
  });
}

// Título que dice qué se filtró: un PDF guardado sin esto no se sabe qué trae.
function tituloMedida(f) {
  const partes = [];
  if (f.categoria.startsWith("fam:")) partes.push(catById(f.categoria.slice(4))?.name || "categoría");
  else if (f.categoria.startsWith("cat:")) partes.push(catById(f.categoria.slice(4))?.name || "categoría");
  if (f.marca) partes.push(f.marca);
  if (f.estado !== "todos") partes.push(f.estado === "disponibles" ? "disponibles" : "agotados");
  if (f.extra === "oferta") partes.push("en oferta");
  if (f.extra === "inicio") partes.push("destacados del inicio");
  if (f.extra === "sin-precio") partes.push("sin precio");
  if (f.extra === "sin-imagen") partes.push("sin imagen");
  return partes.length ? `Catálogo — ${partes.join(" · ")}` : "Catálogo completo";
}

function repMedida(f) {
  const products = filtrarProductos(f);
  const rows = products
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"))
    .map((p) => [p.name || "—", p.brand || "—", categoryLabel(p), p.presentation || "—", peso(p.price), isAvailable(p) ? "Disponible" : "Agotado"]);
  return {
    title: tituloMedida(f),
    columns: ["Producto", "Marca", "Categoría", "Presentación", "Precio", "Estado"],
    rows,
    empty: "Ningún producto coincide con esos filtros. Afloja alguno y vuelve a generar.",
    pdf: { products: pdfCatalogItems(products, (p) => (isAvailable(p) ? "" : "Agotado")) },
  };
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
    if (key === "medida") rep = repMedida(leerFiltros(container));
    else if (key === "precios") rep = repPrecios();
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

// Datos exclusivos de PDF/impresión. La tabla visible no cambia de orden ni
// columnas; el catálogo se agrupa por categoría solamente al exportar.
function pdfCatalogItems(products, detail = () => "") {
  return products.map((p) => ({
    name: p.name || "—",
    brand: p.brand || "",
    category: categoryLabel(p),
    price: peso(p.price),
    detail: detail(p),
    image: p.image || "",
  }));
}

function repPrecios() {
  const products = state.products.slice();
  const rows = products
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"))
    .map((p) => [p.name || "—", categoryLabel(p), p.presentation || "—", peso(p.price), hasOffer(p) ? peso(p.old_price) : "—", isAvailable(p) ? "Disponible" : "Agotado"]);
  return {
    title: "Lista de precios actuales",
    columns: ["Producto", "Categoría", "Presentación", "Precio", "Antes (oferta)", "Estado"],
    rows,
    pdf: { products: pdfCatalogItems(products) },
  };
}

function repStock() {
  const products = state.products.filter((p) => !isAvailable(p));
  const rows = products
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"))
    .map((p) => [p.name || "—", categoryLabel(p), p.presentation || "—", peso(p.price), agoLabel(p.updated_at)]);
  return {
    title: "Stock — agotados / por reponer",
    columns: ["Producto", "Categoría", "Presentación", "Precio", "Agotado"], rows,
    empty: "¡Todo el catálogo está disponible! No hay productos agotados.",
    pdf: { products: pdfCatalogItems(products, (p) => agoLabel(p.updated_at)), detailLabel: "Agotado" },
  };
}

function repOfertas() {
  const products = state.products.filter(hasOffer);
  const rows = products
    .sort((a, b) => discountPct(b) - discountPct(a))
    .map((p) => [p.name || "—", peso(p.old_price), peso(p.price), discountPct(p) + "%"]);
  return {
    title: "Ofertas y descuentos",
    columns: ["Producto", "Precio anterior", "Precio oferta", "Descuento"], rows,
    empty: "No hay ofertas activas en este momento.",
    pdf: { products: pdfCatalogItems(products, (p) => `${peso(p.old_price)} · ${discountPct(p)}%`), detailLabel: "Oferta" },
  };
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
      const blob = await buildReportPDF(rep.title, meta, rep.columns, rep.rows, rep.pdf);
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
    if (!printReport(rep.title, meta, rep.columns, rep.rows, rep.pdf)) {
      toast({ tone: "err", msg: "El navegador bloqueó la ventana de impresión", sub: "Permite las ventanas emergentes e intenta de nuevo." });
    }
  });
}
