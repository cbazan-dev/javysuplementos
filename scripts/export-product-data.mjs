#!/usr/bin/env node
/* ============================================================================
   Regenera js/product-data.js (el fallback offline del catálogo) DESDE Supabase,
   para que Supabase sea la única fuente de verdad y el archivo deje de editarse
   a mano.

   Uso:
     node scripts/export-product-data.mjs            # escribe js/product-data.js
     node scripts/export-product-data.mjs --dry-run  # solo muestra el resumen
     node scripts/export-product-data.mjs --input datos.json
         # usa un JSON local en vez de Supabase (entornos sin salida de red).
         # Formato: { "products": [...], "product_flavors": [...] }

   IMPORTANTE:
   - Revisá SIEMPRE el `git diff` antes de commitear. Este archivo es lo que ve
     el cliente si Supabase no responde, así que un error aquí degrada el catálogo.
   - La primera corrida producirá un archivo distinto al curado a mano (orden y
     textos por defecto). Antes de confiar en él, asegurate de que Supabase ya
     tenga TODOS los productos (podés sembrarlos con seedProductsFromLocalData()
     desde Ajustes del panel).
   - Requiere Node 18+ (usa fetch global).
   ============================================================================ */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");
const INPUT_INDEX = process.argv.indexOf("--input");
const INPUT_FILE = INPUT_INDEX > -1 ? process.argv[INPUT_INDEX + 1] : null;

const HEADER = `const PRODUCT_PLACEHOLDER_IMAGE = "img/products/product-placeholder.svg";

function product({
  id,
  nombre,
  precio,
  categoria,
  marca,
  presentacion = "",
  sabores = [],
  objetivos = [],
  disponible = true,
  destacado = false,
  imagen = PRODUCT_PLACEHOLDER_IMAGE,
  imagenPendiente = imagen === PRODUCT_PLACEHOLDER_IMAGE,
  subtitulo,
  beneficios,
  descripcion,
  uso,
}) {
  const flavorText = sabores.length ? \` Sabores disponibles: \${sabores.join(", ")}.\` : "";
  const goalText = objetivos.length ? \` Ideal para: \${objetivos.join(", ")}.\` : "";

  return {
    id,
    nombre,
    subtitulo: subtitulo || \`\${categoria}\${presentacion ? \` \${presentacion}\` : ""}.\${goalText}\`,
    precio,
    categoria,
    marca,
    presentacion,
    sabores,
    objetivos,
    disponible,
    destacado,
    tag: disponible ? "Disponible" : "Consultar stock",
    imagen,
    imagenPendiente,
    alt: nombre,
    whatsappMensaje: \`Hola Javy, quiero asesoría sobre \${nombre}.\`,
    beneficios: beneficios || [
      objetivos.length ? \`Apoya objetivos de \${objetivos.join(", ").toLowerCase()}.\` : "Apoya tu rutina de suplementación.",
      "Producto agregado desde el catálogo disponible.",
      "Javy puede orientarte sobre uso, sabor y disponibilidad.",
    ],
    descripcion: descripcion || [
      \`\${nombre} es un producto de \${marca} dentro de la categoría \${categoria.toLowerCase()}.\`,
      \`Precio de catálogo: $\${Number(precio).toFixed(2)}.\${flavorText}\`,
    ],
    uso: uso || [
      "Consultar la dosis indicada en la etiqueta del producto.",
      "Usar como complemento de una alimentación y entrenamiento adecuados.",
      "Si tienes condiciones médicas o sensibilidad a estimulantes, consulta antes de usar.",
    ],
  };
}

const PRODUCT_LIST = [`;

const FOOTER = `];

const PRODUCTS = Object.fromEntries(PRODUCT_LIST.map((item) => [item.id, item]));
`;

async function readSupabaseConfig() {
  const txt = await readFile(join(ROOT, "js/supabase-config.js"), "utf8");
  const url = txt.match(/SUPABASE_URL\s*=\s*"([^"]+)"/)?.[1];
  const key = txt.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*"([^"]+)"/)?.[1];
  if (!url || !key) throw new Error("No pude leer SUPABASE_URL / KEY de js/supabase-config.js");
  return { url, key };
}

async function sb(path, { url, key }) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

// Serializa una entrada como llamada product({...}), incluyendo solo lo que
// difiere de los valores por defecto de la fábrica (para mantener el archivo limpio).
function serialize(p) {
  const parts = [
    `id: ${JSON.stringify(p.id)}`,
    `nombre: ${JSON.stringify(p.nombre)}`,
    `precio: ${Number(p.precio) || 0}`,
    `categoria: ${JSON.stringify(p.categoria)}`,
    `marca: ${JSON.stringify(p.marca)}`,
  ];
  if (p.presentacion) parts.push(`presentacion: ${JSON.stringify(p.presentacion)}`);
  if (p.sabores?.length) parts.push(`sabores: ${JSON.stringify(p.sabores)}`);
  if (p.objetivos?.length) parts.push(`objetivos: ${JSON.stringify(p.objetivos)}`);
  if (p.imagen) parts.push(`imagen: ${JSON.stringify(p.imagen)}`);
  if (p.disponible === false) parts.push(`disponible: false`);
  if (p.destacado) parts.push(`destacado: true`);
  return `  product({ ${parts.join(", ")} }),`;
}

async function loadData() {
  if (INPUT_FILE) {
    const raw = JSON.parse(await readFile(INPUT_FILE, "utf8"));
    const products = [...(raw.products || [])].sort((a, b) =>
      String(a.category || "").localeCompare(String(b.category || ""), "es")
      || String(a.name || "").localeCompare(String(b.name || ""), "es"));
    return [products, raw.product_flavors || []];
  }
  const cfg = await readSupabaseConfig();
  return Promise.all([
    sb("products?select=*&order=category.asc,name.asc", cfg),
    sb("product_flavors?select=product_id,name,available,is_available", cfg),
  ]);
}

async function main() {
  const [products, flavors] = await loadData();

  // Sabores disponibles por producto.
  const flavorsByProduct = new Map();
  for (const f of flavors) {
    const ok = f.available !== false && f.is_available !== false;
    if (!ok || !f.name) continue;
    if (!flavorsByProduct.has(f.product_id)) flavorsByProduct.set(f.product_id, []);
    flavorsByProduct.get(f.product_id).push(f.name);
  }

  const entries = products.map((row) => {
    const localImg = (row.image_url || row.imagen_url || "").startsWith("img/")
      ? (row.image_url || row.imagen_url)
      : "";
    return {
      id: row.legacy_id || row.slug || row.id,
      nombre: row.name || row.nombre || "Producto sin nombre",
      precio: row.price != null ? row.price : (row.precio_centavos || 0) / 100,
      categoria: row.category || row.tag || "Otros",
      marca: row.brand || "",
      presentacion: row.presentation || "",
      sabores: flavorsByProduct.get(row.id) || [],
      objetivos: row.goals || [],
      imagen: localImg,
      disponible: row.available !== false && row.is_available !== false && row.is_active !== false,
      destacado: Boolean(row.featured || row.is_featured || row.show_on_home),
    };
  });

  const body = entries.map(serialize).join("\n");
  const out = `${HEADER}\n${body}\n${FOOTER}`;

  console.log(`Productos leídos de Supabase: ${products.length}`);
  console.log(`Sabores disponibles mapeados: ${flavors.length}`);
  if (DRY_RUN) {
    console.log("(--dry-run) No se escribió ningún archivo.");
    return;
  }
  await writeFile(join(ROOT, "js/product-data.js"), out, "utf8");
  console.log("✓ js/product-data.js regenerado. Revisá `git diff` antes de commitear.");
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
