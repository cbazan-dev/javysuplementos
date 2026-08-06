/* ============================================================================
   Utilidades de exportación de informes: tabla HTML, impresión en ventana aparte
   y generación de PDF (jsPDF + autotable, vendorizados en js/vendor) con guardado
   en el dispositivo o compartir nativo (Web Share API).
   ============================================================================ */
import { esc } from "./helpers.js?v=adm-b0d853ee";

// Tabla HTML simple desde columnas + filas (celdas en texto plano, se escapan aquí).
export function buildTable(columns, rows, className = "") {
  const head = `<thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows.map((r) => `<tr>${r.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return `<table${className ? ` class="${className}"` : ""}>${head}${body}</table>`;
}

// Arma el PDF del informe (título + fecha + tabla) y lo devuelve como Blob.
// Usa jsPDF + autotable, cargados como globales (window.jspdf) desde js/vendor.
export function buildReportPDF(title, meta, columns, rows) {
  const ns = window.jspdf;
  if (!ns || !ns.jsPDF) throw new Error("No se pudo cargar el generador de PDF. Recarga la página e intenta de nuevo.");
  const doc = new ns.jsPDF({ unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(17);
  doc.text(String(title || "Informe"), 40, 48);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(String(meta || ""), 40, 64);

  doc.autoTable({
    head: [columns],
    body: rows,
    startY: 80,
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, overflow: "linebreak", textColor: 30 },
    headStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [250, 250, 250] },
    margin: { left: 40, right: 40 },
  });

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

// Abre una ventana con el informe listo para imprimir / "Guardar como PDF".
// Devuelve false si el navegador bloqueó la ventana emergente.
export function printReport(title, meta, columns, rows) {
  const w = window.open("", "_blank");
  if (!w) return false;
  const doc = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>
    *{box-sizing:border-box;} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:28px;}
    h1{font-size:18px;margin:0 0 4px;} .meta{color:#555;font-size:12px;margin:0 0 18px;}
    table{width:100%;border-collapse:collapse;font-size:12px;}
    th,td{border:1px solid #ccc;padding:6px 9px;text-align:left;}
    th{background:#f3f4f6;text-transform:uppercase;font-size:10px;letter-spacing:.04em;}
    tr:nth-child(even) td{background:#fafafa;}
  </style></head><body>
    <h1>${esc(title)}</h1>
    <p class="meta">${esc(meta)}</p>
    ${buildTable(columns, rows)}
    <script>window.onload=function(){setTimeout(function(){window.print();},150);};<\/script>
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
