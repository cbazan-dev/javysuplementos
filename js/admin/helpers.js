/* ============================================================================
   Helpers de bajo nivel: DOM, escape, formato, fechas e imágenes.
   Puros o casi puros; no conocen el estado de la app.
   ============================================================================ */
import { PLACEHOLDER } from "./config.js?v=adm-90d40885";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// Rechaza si `promise` no resuelve en `ms`. Sin esto, un fetch colgado
// (Supabase sin timeout propio) dejaba el gate girando para siempre.
export function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} tardó más de ${Math.round(ms / 1000)} segundos. Revisa tu conexión e intenta de nuevo.`));
    }, ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

export function esc(value) {
  // String(value ?? "") tolera null, undefined y números sin tirar
  // (un default de parámetro solo cubre undefined, no null).
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Iniciales para los avatares del equipo: corta por @ . y espacios, así
// "javy@tienda.com" → "JT" y "Ana Pérez" → "AP".
export function initials(value) {
  return String(value || "?")
    .split(/[@._\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export function ico(name) {
  return window.javyIcons ? window.javyIcons.get(name, "ad-ico") : "";
}

export function peso(n) {
  const v = Number(n || 0);
  if (!(v > 0)) return "Consultar";
  return "$" + (Number.isInteger(v) ? v : v.toFixed(2).replace(/\.0+$/, ""));
}

export function hasOffer(p) {
  const price = Number(p.price || 0);
  const old = Number(p.old_price || 0);
  return price > 0 && old > price;
}
export function discountPct(p) {
  if (!hasOffer(p)) return 0;
  return Math.round((1 - Number(p.price) / Number(p.old_price)) * 100);
}

export function daysSince(iso) {
  if (!iso) return Infinity;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return Infinity;
  return Math.floor((Date.now() - then) / 86400000);
}
export function agoLabel(iso) {
  const d = daysSince(iso);
  if (!Number.isFinite(d)) return "sin fecha";
  if (d <= 0) return "hoy";
  if (d === 1) return "hace 1 día";
  if (d < 7) return `hace ${d} días`;
  const w = Math.floor(d / 7);
  if (w === 1) return "hace 1 sem";
  if (w < 4) return `hace ${w} sem`;
  const m = Math.floor(d / 30);
  return m <= 1 ? "hace 1 mes" : `hace ${m} meses`;
}

function onImgErr(img) {
  img.onerror = null;
  img.src = PLACEHOLDER;
}
// attach the safe-fallback to every product image after a render
export function wireImageFallbacks(root) {
  $$("img[data-fallback]", root).forEach((img) => { img.onerror = () => onImgErr(img); });
}

export function isAvailable(p) { return p.available !== false; }

// "Sin imagen" = el producto MUESTRA el placeholder (lo que ve el cliente y la
// lista del admin), no solo que falte en la BD. Usa la imagen ya resuelta
// `p.image` (que cae a una imagen local de product-data.js si hay match); así el
// filtro, la lista y la web quedan coherentes. Mismo criterio que
// isPlaceholderImage() en js/db.js.
export function isMissingImage(p) {
  const src = p.image || "";
  return !src || src.includes("product-placeholder.svg");
}

export function stockTone(p) {
  if (!isAvailable(p)) return ["out", "Agotado"];
  return ["ok", "Disponible"];
}

export const imgTag = (src, cls = "") =>
  `<img ${cls ? `class="${cls}" ` : ""}src="${esc(src || PLACEHOLDER)}" alt="" data-fallback loading="lazy" />`;
