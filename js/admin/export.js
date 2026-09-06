/* ============================================================================
   Utilidades de exportación de informes: tabla HTML, impresión en ventana aparte
   y generación de PDF (jsPDF + autotable, vendorizados en js/vendor) con guardado
   en el dispositivo o compartir nativo (Web Share API).
   ============================================================================ */
import { esc } from "./helpers.js?v=adm-90d40885";

const PDF = {
  ink: [13, 25, 39], muted: [91, 108, 125], line: [220, 227, 234],
  blue: [1, 145, 198], sky: [90, 180, 233], pale: [239, 248, 252],
  stripe: [247, 250, 252], white: [255, 255, 255],
};
const MARGIN = 42;
const FOOTER_Y = 806;
const LOGO_URL = new URL("../../img/icons/logo.png", import.meta.url).href;

const isRealImage = (url = "") => Boolean(url) && !String(url).includes("product-placeholder.svg");
const absoluteUrl = (url) => new URL(url, document.baseURI).href;

function catalogGroups(items = []) {
  const groups = new Map();
  items.filter(Boolean).slice().sort((a, b) => {
    const byCategory = String(a.category || "Sin categoría").localeCompare(String(b.category || "Sin categoría"), "es");
    if (byCategory) return byCategory;
    const byBrand = String(a.brand || "").localeCompare(String(b.brand || ""), "es");
    return byBrand || String(a.name || "").localeCompare(String(b.name || ""), "es");
  }).forEach((item) => {
    const category = item.category || "Sin categoría";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(item);
  });
  return [...groups.entries()].map(([category, products]) => ({ category, products }));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

// Convierte recursos existentes a miniaturas ligeras que jsPDF puede incrustar.
async function imageData(url, maxSide = 128) {
  if (!isRealImage(url)) return null;
  let objectUrl = "";
  try {
    const response = await fetch(absoluteUrl(url));
    if (!response.ok) throw new Error("No se pudo cargar la imagen");
    const blob = await response.blob();
    objectUrl = URL.createObjectURL(blob);
    const image = await loadImage(objectUrl);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) return null;
    const scale = Math.min(maxSide / width, maxSide / height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL("image/jpeg", 0.84), width: canvas.width, height: canvas.height };
  } catch (_) {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

async function preloadImages(items) {
  const urls = [...new Set(items.map((item) => item.image).filter(isRealImage))];
  const assets = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      assets.set(url, await imageData(url));
    }
  }));
  return assets;
}

function size(doc) {
  return { width: doc.internal.pageSize.getWidth(), height: doc.internal.pageSize.getHeight() };
}

function addLogo(doc, asset, x, y, box) {
  if (!asset) return;
  const ratio = asset.width / asset.height || 1;
  const width = ratio >= 1 ? box : box * ratio;
  const height = ratio >= 1 ? box / ratio : box;
  doc.addImage(asset.data, "JPEG", x + (box - width) / 2, y + (box - height) / 2, width, height);
}

function mainHeader(doc, title, meta, logo) {
  const { width } = size(doc);
  doc.setFillColor(...PDF.ink); doc.rect(0, 0, width, 82, "F");
  doc.setFillColor(...PDF.white); doc.roundedRect(MARGIN, 16, 48, 48, 10, 10, "F");
  addLogo(doc, logo, MARGIN + 4, 20, 40);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...PDF.white);
  doc.text("JAVY SUPLEMENTOS", MARGIN + 62, 37);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...PDF.sky);
  doc.text("INFORME DEL PANEL", MARGIN + 62, 51);
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...PDF.ink);
  doc.text(String(title || "Informe"), MARGIN, 114);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...PDF.muted);
  const lines = doc.splitTextToSize(String(meta || ""), width - MARGIN * 2);
  doc.text(lines, MARGIN, 132);
  const lineY = 140 + Math.max(0, lines.length - 1) * 10;
  doc.setDrawColor(...PDF.line); doc.line(MARGIN, lineY, width - MARGIN, lineY);
  return lineY + 18;
}

function continuationHeader(doc, title) {
  const { width } = size(doc);
  doc.setFillColor(...PDF.ink); doc.rect(0, 0, width, 54, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...PDF.white);
  doc.text("JAVY SUPLEMENTOS", MARGIN, 25);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...PDF.sky);
  doc.text(String(title || "Informe"), MARGIN, 39);
}

function categoryHeading(doc, category, y) {
  const { width } = size(doc);
  doc.setFillColor(...PDF.pale); doc.roundedRect(MARGIN, y, width - MARGIN * 2, 22, 6, 6, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...PDF.blue);
  doc.text(String(category), MARGIN + 10, y + 14);
}

function addFooters(doc) {
  const { width } = size(doc);
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setDrawColor(...PDF.line); doc.line(MARGIN, FOOTER_Y - 12, width - MARGIN, FOOTER_Y - 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...PDF.muted);
    doc.text("Javy Suplementos · Informe generado desde el panel administrativo", MARGIN, FOOTER_Y);
    doc.text(`Página ${page} de ${total}`, width - MARGIN, FOOTER_Y, { align: "right" });
  }
}

function baseTable(head, body, startY, topMargin = 96) {
  return {
    theme: "plain", head: [head], body, startY,
    margin: { top: topMargin, left: MARGIN, right: MARGIN, bottom: 48 },
    showHead: "everyPage", pageBreak: "auto", rowPageBreak: "avoid",
    styles: { font: "helvetica", fontSize: 8.5, textColor: PDF.ink, fillColor: PDF.white, lineColor: PDF.line, lineWidth: 0.4, cellPadding: { top: 6, right: 7, bottom: 6, left: 7 }, overflow: "linebreak", valign: "middle" },
    headStyles: { fillColor: PDF.ink, textColor: PDF.white, fontStyle: "bold", fontSize: 7.5, cellPadding: { top: 7, right: 7, bottom: 7, left: 7 } },
    alternateRowStyles: { fillColor: PDF.stripe },
  };
}

// Tabla HTML simple desde columnas + filas (celdas en texto plano, se escapan aquí).
export function buildTable(columns, rows, className = "") {
  const head = `<thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows.map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table${className ? ` class="${className}"` : ""}>${head}${body}</table>`;
}

// Arma el PDF del informe y lo devuelve como Blob. Los informes de catálogo
// pueden pasar products sin cambiar la tabla que se ve en la web.
export async function buildReportPDF(title, meta, columns, rows, options = {}) {
  const ns = window.jspdf;
  if (!ns || !ns.jsPDF) throw new Error("No se pudo cargar el generador de PDF. Recarga la página e intenta de nuevo.");
  const doc = new ns.jsPDF({ unit: "pt", format: "a4" });
  const products = options.products || [];
  const logo = await imageData(LOGO_URL, 160);
  if (!logo) throw new Error("No se pudo cargar el logo de Javy para el informe.");

  doc.setProperties({ title: String(title || "Informe"), author: "Javy Suplementos", subject: "Informe de catálogo" });
  let cursorY = mainHeader(doc, title, meta, logo);

  if (!products.length) {
    doc.autoTable({
      ...baseTable(columns, rows, cursorY, 76),
      willDrawPage: (data) => { if (data.pageNumber > 1) continuationHeader(doc, title); },
    });
    addFooters(doc);
    return doc.output("blob");
  }

  const assets = await preloadImages(products);
  const { height } = size(doc);
  const detailLabel = options.detailLabel || "";
  catalogGroups(products).forEach(({ category, products: group }) => {
    // El título de categoría siempre viaja con la cabecera y primera fila.
    if (cursorY + 90 > height - 48) {
      doc.addPage();
      continuationHeader(doc, title);
      cursorY = 72;
    }
    categoryHeading(doc, category, cursorY);
    const head = detailLabel ? ["", "Producto", "Precio actual", detailLabel] : ["", "Producto", "Precio actual"];
    const tableWidth = size(doc).width - MARGIN * 2;
    const body = group.map((item) => {
      const product = item.brand ? `${item.name || "—"}\n${item.brand}` : (item.name || "—");
      return detailLabel ? [item.image || "", product, item.price || "Consultar", item.detail || "—"] : [item.image || "", product, item.price || "Consultar"];
    });
    doc.autoTable({
      ...baseTable(head, body, cursorY + 30, 116),
      tableWidth,
      styles: { ...baseTable(head, body, 0).styles, minCellHeight: 46 },
      columnStyles: detailLabel
        ? { 0: { cellWidth: 38 }, 1: { cellWidth: 240 }, 2: { cellWidth: 72, halign: "right", fontStyle: "bold" }, 3: { cellWidth: tableWidth - 350 } }
        : { 0: { cellWidth: 38 }, 1: { cellWidth: tableWidth - 128 }, 2: { cellWidth: 90, halign: "right", fontStyle: "bold" } },
      willDrawPage: (data) => {
        if (data.pageNumber > 1) {
          continuationHeader(doc, title);
          categoryHeading(doc, category, 72);
        }
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 0) data.cell.text = [];
      },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const asset = assets.get(data.cell.raw);
        if (!asset) return;
        const max = 31;
        const ratio = asset.width / asset.height || 1;
        const imageWidth = ratio >= 1 ? max : max * ratio;
        const imageHeight = ratio >= 1 ? max / ratio : max;
        doc.addImage(asset.data, "JPEG", data.cell.x + (data.cell.width - imageWidth) / 2, data.cell.y + (data.cell.height - imageHeight) / 2, imageWidth, imageHeight);
      },
    });
    cursorY = doc.lastAutoTable.finalY + 18;
  });

  addFooters(doc);
  return doc.output("blob");
}

// Guarda o comparte un archivo según el dispositivo:
//   1) celular (pantalla táctil) con compartir nativo → hoja del sistema
//      (Guardar en Archivos, WhatsApp, etc.)
//   2) escritorio con File System Access → diálogo "Guardar como"
//   3) resto → descarga directa a la carpeta de Descargas
// Cancelar el diálogo o el compartir NO se trata como error. Devuelve el modo usado.
export async function saveOrShare(filename, blob, share = {}) {
  const type = blob.type || "application/octet-stream";
  const file = new File([blob], filename, { type });
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

  // 1) Compartir nativo (ideal en celular).
  if (coarse && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: share.title, text: share.text });
      return "shared";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancel";
      // si el compartir falla por otra razón, seguimos al guardado/descarga
    }
  }

  // 2) "Guardar como" (Chromium de escritorio).
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error && error.name === "AbortError") return "cancel";
      // cualquier otro fallo → descarga directa
    }
  }

  // 3) Descarga directa (respaldo universal).
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return "downloaded";
}

function printCatalog(items, detailLabel = "") {
  return catalogGroups(items).map(({ category, products }) => `
    <section class="catalog-group">
      <h2>${esc(category)}</h2>
      <table><thead><tr><th class="image-col"></th><th>Producto</th><th class="price-col">Precio actual</th>${detailLabel ? `<th>${esc(detailLabel)}</th>` : ""}</tr></thead>
      <tbody>${products.map((item) => `<tr>
        <td class="image-col">${isRealImage(item.image) ? `<img src="${esc(absoluteUrl(item.image))}" alt="" />` : ""}</td>
        <td><strong>${esc(item.name || "—")}</strong>${item.brand ? `<small>${esc(item.brand)}</small>` : ""}</td>
        <td class="price-col">${esc(item.price || "Consultar")}</td>${detailLabel ? `<td>${esc(item.detail || "—")}</td>` : ""}
      </tr>`).join("")}</tbody></table>
    </section>`).join("");
}

// Abre una ventana con el informe listo para imprimir / "Guardar como PDF".
// Devuelve false si el navegador bloqueó la ventana emergente.
export function printReport(title, meta, columns, rows, options = {}) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const products = options.products || [];
  const content = products.length ? printCatalog(products, options.detailLabel) : buildTable(columns, rows);
  const doc = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    @page{size:A4;margin:16mm 14mm 18mm;} *{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;color:#0d1927;margin:0;font-size:10pt;}
    .report-header{display:flex;align-items:center;gap:14px;padding:0 0 16px;border-bottom:2px solid #0191c6;margin-bottom:20px;}.report-header img{width:48px;height:48px;object-fit:contain;}.brand{font-size:9pt;font-weight:700;letter-spacing:.08em;color:#0191c6;margin:0 0 3px;}.report-header h1{font-size:19pt;margin:0;line-height:1.1;}.meta{color:#5b6c7d;font-size:9pt;margin:5px 0 0;}
    .catalog-group{break-inside:avoid-page;page-break-inside:avoid;margin:0 0 18px;}.catalog-group h2{font-size:11pt;color:#0191c6;background:#eff8fc;border-radius:5px;padding:7px 10px;margin:0 0 7px;}table{width:100%;border-collapse:collapse;font-size:9pt;}thead{display:table-header-group;}tr{break-inside:avoid;page-break-inside:avoid;}th,td{border-bottom:1px solid #dce3ea;padding:7px 8px;text-align:left;vertical-align:middle;}th{background:#0d1927;color:#fff;text-transform:uppercase;font-size:7.5pt;letter-spacing:.05em;}tbody tr:nth-child(even) td{background:#f7fafc;}td strong{display:block;font-size:9.5pt;}td small{display:block;color:#5b6c7d;margin-top:2px;}.image-col{width:42px;text-align:center;}.image-col img{width:30px;height:30px;object-fit:contain;}.price-col{text-align:right;font-weight:700;white-space:nowrap;}
    .report-footer{position:fixed;bottom:-11mm;left:0;right:0;border-top:1px solid #dce3ea;padding-top:4px;color:#5b6c7d;font-size:8pt;display:flex;justify-content:space-between;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
  </style></head><body>
    <header class="report-header"><img src="${LOGO_URL}" alt="Javy Suplementos" /><div><p class="brand">JAVY SUPLEMENTOS · INFORME DEL PANEL</p><h1>${esc(title)}</h1><p class="meta">${esc(meta)}</p></div></header>
    ${content}<footer class="report-footer"><span>Javy Suplementos · Informe generado desde el panel administrativo</span><span>${esc(meta)}</span></footer>
    <script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>
  </body></html>`;
  w.document.open();
  w.document.write(doc);
  w.document.close();
  return true;
}

// "Lista de precios actuales" → "lista-de-precios-actuales"
export function slugify(text) {
  return String(text || "informe")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
