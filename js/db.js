const PRODUCT_BASE_SELECT = `
  id,
  slug,
  nombre,
  subtitulo,
  precio_centavos,
  moneda,
  tag,
  imagen_url,
  alt,
  whatsapp_mensaje,
  beneficios,
  descripcion,
  uso,
  is_active,
  name,
  brand,
  category,
  category_id,
  price,
  presentation,
  image_url,
  description,
  old_price,
  description_short,
  description_long,
  label,
  show_on_home,
  home_order,
  is_available,
  is_featured,
  available,
  featured,
  flavor_mode,
  tags,
  goals,
  legacy_id,
  created_at,
  updated_at
`;

// Columnas de auditoría (Fase 5). Solo se incluyen si existen en la BD.
const AUDIT_COLS = "created_by, updated_by";

const PRODUCT_FLAVORS_FRAGMENT = `
  product_flavors (
    id,
    name,
    presentation,
    price,
    stock,
    available,
    is_available,
    created_at
  )
`;

const PRODUCT_SELECT = `${PRODUCT_BASE_SELECT}, ${PRODUCT_FLAVORS_FRAGMENT}`;
const PRODUCT_SELECT_AUDIT = `${PRODUCT_BASE_SELECT}, ${AUDIT_COLS}, ${PRODUCT_FLAVORS_FRAGMENT}`;

const COMBO_BASE_SELECT = `
  id, name, slug, description, image_url, price, precio_centavos, old_price,
  is_active, show_on_home, sort_order, created_at, updated_at`;

const COMBO_ITEMS_FRAGMENT = `
  combo_items (
    id, product_id, flavor_id, quantity, sort_order,
    products ( id, name, image_url, price, slug ),
    product_flavors ( id, name )
  )
`;

const COMBO_SELECT = `${COMBO_BASE_SELECT}, ${COMBO_ITEMS_FRAGMENT}`;
const COMBO_SELECT_AUDIT = `${COMBO_BASE_SELECT}, ${AUDIT_COLS}, ${COMBO_ITEMS_FRAGMENT}`;

const DB_PLACEHOLDER_IMAGE = "img/products/product-placeholder.svg";
const PRODUCT_IMAGE_BUCKET = "product-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const DEFAULT_CATEGORIES = [
  { name: "Proteinas", slug: "proteinas", sort_order: 1 },
  { name: "Creatinas", slug: "creatinas", sort_order: 2 },
  { name: "Pre-entrenos", slug: "pre-entrenos", sort_order: 3 },
  { name: "Quemadores", slug: "quemadores", sort_order: 4 },
  { name: "Vitaminas", slug: "vitaminas", sort_order: 5 },
  { name: "Aminoacidos", slug: "aminoacidos", sort_order: 6 },
  { name: "Accesorios", slug: "accesorios", sort_order: 7 },
  { name: "Otros", slug: "otros", sort_order: 8 },
];

let productsCache = null;
let productsCacheSource = "local";

function hasSupabaseClient() {
  return typeof supabaseClient !== "undefined" && Boolean(supabaseClient);
}

function isUuid(value = "") {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function createSlug(value = "") {
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " y ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getProductSlug(productData = {}) {
  const source = productData.slug || productData.legacy_id || [
    productData.brand,
    productData.name,
    productData.presentation,
  ].filter(Boolean).join(" ");

  return createSlug(source) || `producto-${Date.now()}`;
}

function getUsefulText(...values) {
  return values.find((value) => {
    if (typeof value !== "string") return false;
    const cleanValue = value.trim();
    return cleanValue && cleanValue !== "Producto sin nombre";
  })?.trim() || "";
}

function toTextLines(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => item?.toString().trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return fallback;
}

function isPlaceholderImage(image = "") {
  return !image || image === DB_PLACEHOLDER_IMAGE || image.includes("product-placeholder.svg");
}

function isLocalProductImage(image = "") {
  return /^\.?\/?img\/products\//.test(image);
}

function findLocalProductMatch(product = {}) {
  if (typeof PRODUCTS === "undefined") return null;

  const candidates = [
    product.legacy_id,
    product.legacyId,
    product.local_id,
    product.slug,
    product.id,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (PRODUCTS[candidate]) return PRODUCTS[candidate];
  }

  const name = getUsefulText(product.name, product.nombre);
  if (!name) return null;

  const productSlug = createSlug(name);
  return Object.values(PRODUCTS).find((localProduct) => createSlug(localProduct.nombre || localProduct.name) === productSlug) || null;
}

function normalizeFlavor(flavor, index = 0) {
  if (typeof flavor === "string") {
    return {
      id: `local-flavor-${index}-${flavor.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      name: flavor,
      presentation: "",
      price: null,
      stock: null,
      available: true,
    };
  }

  return {
    id: flavor?.id || `local-flavor-${index}`,
    name: flavor?.name || flavor?.nombre || "",
    presentation: flavor?.presentation || flavor?.presentacion || "",
    price: flavor?.price == null || flavor?.price === "" ? null : Number(flavor.price),
    stock: flavor?.stock == null || flavor?.stock === "" ? null : Number(flavor.stock),
    available: flavor?.available ?? flavor?.is_available ?? flavor?.disponible ?? true,
  };
}

function normalizeFlavorMode(value, flavors = []) {
  if (["has_flavors", "no_flavor", "needs_review"].includes(value)) return value;
  return flavors.length ? "has_flavors" : "needs_review";
}

function normalizeProductFromDb(product) {
  const flavors = (product.product_flavors || product.flavors || product.sabores || [])
    .map(normalizeFlavor)
    .filter((flavor) => flavor.name)
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const remoteImage = product.image_url || product.imagen_url || product.image || product.imagen || "";
  // Sin fallback a la imagen local de product-data.js: si la BD no trae una imagen
  // real, se muestra el placeholder (en web y admin). Catálogo honesto: lo que se
  // ve es lo que está subido. (La caída total de Supabase sigue mostrando las
  // imágenes locales porque normalizeLocalProduct las pasa como image_url.)
  const image = isPlaceholderImage(remoteImage) ? DB_PLACEHOLDER_IMAGE : remoteImage;
  const available = product.is_available ?? product.available ?? product.is_active ?? product.disponible ?? true;
  const featured = product.is_featured ?? product.featured ?? product.destacado ?? false;
  const flavorMode = normalizeFlavorMode(product.flavor_mode || product.flavorMode, flavors);
  const showOnHome = product.show_on_home ?? product.en_inicio ?? featured ?? false;
  const homeOrder = product.home_order == null || product.home_order === "" ? null : Number(product.home_order);
  const goals = asArray(product.goals || product.objetivos);
  const tags = asArray(product.tags || product.etiquetas);
  const name = getUsefulText(product.name, product.nombre);
  const brand = product.brand || product.marca || "";
  const category = getUsefulText(product.category === "Producto" ? "" : product.category, product.categoria, product.tag) || "Producto";
  const presentation = product.presentation || product.presentacion || "";
  const price = Number(product.price ?? product.precio ?? (product.precio_centavos != null ? product.precio_centavos / 100 : 0));
  // Los campos editoriales son manuales: una cadena o arreglo vacío debe seguir
  // vacío, no convertirse en contenido genérico durante la normalización.
  const descriptionText = product.description_long ?? product.description ?? product.descripcion ?? "";
  const descriptionShort = product.description_short ?? product.subtitulo ?? "";
  const descriptionLines = toTextLines(descriptionText);

  return {
    id: product.id,
    slug: product.slug || createSlug(product.legacy_id || name),
    legacy_id: product.legacy_id || product.legacyId || product.id,
    name,
    brand,
    category,
    category_id: product.category_id ?? null,
    price,
    old_price: product.old_price == null || product.old_price === "" ? null : Number(product.old_price),
    presentation,
    image,
    image_url: image,
    // Imagen tal cual está guardada en la BD, sin el fallback a imagen local.
    // El admin debe editar/persistir ESTO, no el `image` resuelto para mostrar.
    stored_image_url: remoteImage,
    description: descriptionText,
    description_short: descriptionShort,
    description_long: descriptionText,
    available,
    is_available: available,
    featured,
    is_featured: featured,
    flavor_mode: flavorMode,
    show_on_home: showOnHome,
    home_order: homeOrder,
    label: product.label || product.tag_visual || "",
    tags,
    goals,
    flavors,
    created_at: product.created_at,
    updated_at: product.updated_at,
    created_by: product.created_by || null,
    updated_by: product.updated_by || null,
    source: product.source || "supabase",

    nombre: name,
    marca: brand,
    categoria: category,
    precio: price,
    presentacion: presentation,
    imagen: image,
    imagenPendiente: image === DB_PLACEHOLDER_IMAGE,
    disponible: available,
    destacado: featured,
    modoSabor: flavorMode,
    enInicio: showOnHome,
    sabores: flavors.map((flavor) => flavor.name),
    objetivos: goals,
    tag: available ? "Disponible" : "Consultar stock",
    alt: name,
    subtitulo: descriptionShort,
    beneficios: toTextLines(product.beneficios),
    descripcion: descriptionLines,
    uso: toTextLines(product.uso),
  };
}

function normalizeLocalProduct(product) {
  return normalizeProductFromDb({
    ...product,
    id: product.id,
    name: product.nombre,
    brand: product.marca,
    category: product.categoria,
    price: product.precio,
    presentation: product.presentacion,
    image_url: product.imagen,
    available: product.disponible,
    featured: product.destacado,
    goals: product.objetivos,
    flavors: product.sabores,
    legacy_id: product.id,
    source: "local",
  });
}

function isUsableRemoteProduct(product) {
  const isRepairPlaceholder =
    product.name === "Producto sin nombre" &&
    product.category === "Producto" &&
    !product.legacy_id &&
    !product.brand &&
    !product.presentation &&
    !product.description;

  return !isRepairPlaceholder;
}

function getLocalProducts() {
  if (typeof PRODUCT_LIST !== "undefined") {
    return PRODUCT_LIST.map(normalizeLocalProduct);
  }

  if (typeof PRODUCTS !== "undefined") {
    return Object.values(PRODUCTS).map(normalizeLocalProduct);
  }

  return [];
}

function mapProductToDb(productData = {}) {
  const name = productData.name?.trim();
  const brand = productData.brand?.trim() || null;
  const category = productData.category?.trim();
  const price = productData.price === "" || productData.price == null ? null : Number(productData.price);
  const oldPrice = productData.old_price === "" || productData.old_price == null ? null : Number(productData.old_price);
  const presentation = productData.presentation?.trim() || null;
  const imageUrl = productData.image_url?.trim() || productData.image?.trim() || DB_PLACEHOLDER_IMAGE;
  const descriptionShort = productData.description_short?.trim() || null;
  const descriptionLong = productData.description_long?.trim() || null;
  const descriptionLines = toTextLines(descriptionLong);
  const description = descriptionLines.join("\n") || null;
  const available = productData.is_available ?? productData.available ?? true;
  const featured = productData.is_featured ?? productData.featured ?? false;
  const flavorMode = normalizeFlavorMode(productData.flavor_mode || productData.flavorMode);
  const showOnHome = productData.show_on_home ?? productData.featured ?? false;
  const homeOrder = productData.home_order === "" || productData.home_order == null ? null : Number(productData.home_order);
  const label = productData.label?.trim() || null;
  const subtitle = descriptionShort || "";
  const benefits = toTextLines(productData.beneficios);
  const usage = toTextLines(productData.uso);

  const payload = {
    slug: getProductSlug(productData),
    nombre: name,
    subtitulo: subtitle,
    precio_centavos: price == null ? 0 : Math.round(price * 100),
    moneda: "USD",
    tag: available ? "Disponible" : "Consultar stock",
    imagen_url: imageUrl,
    alt: name,
    whatsapp_mensaje: `Hola Javy, quiero asesoría sobre ${name}.`,
    beneficios: benefits,
    descripcion: descriptionLines,
    uso: usage,
    is_active: available,
    name,
    brand,
    category,
    price,
    old_price: oldPrice,
    presentation,
    image_url: imageUrl,
    description,
    description_short: descriptionShort,
    description_long: descriptionLong,
    available,
    is_available: available,
    featured,
    is_featured: featured,
    flavor_mode: flavorMode,
    show_on_home: Boolean(showOnHome),
    home_order: homeOrder,
    label,
    tags: asArray(productData.tags),
    goals: asArray(productData.goals),
    legacy_id: productData.legacy_id?.trim() || null,
  };

  // Sólo tocar category_id si el form lo manda; así editar un producto no borra
  // la categoría mapeada por la migración mientras el selector aún no existe.
  if (productData.category_id !== undefined) {
    payload.category_id = productData.category_id || null;
  }

  return payload;
}

function ensureSupabaseForWrite() {
  if (!hasSupabaseClient()) {
    throw new Error("Supabase no esta disponible. Revisa el CDN y supabase-config.js.");
  }
}

// Email del admin autenticado (para sellar created_by/updated_by). Cacheado.
let cachedUserEmail;
async function getCurrentUserEmail() {
  if (cachedUserEmail !== undefined) return cachedUserEmail;
  try {
    const { data } = await supabaseClient.auth.getUser();
    cachedUserEmail = data?.user?.email || null;
  } catch (error) {
    cachedUserEmail = null;
  }
  return cachedUserEmail;
}

// ¿Existen las columnas de auditoría (Fase 5)? Se detecta una vez. Si la migración
// no se aplicó, todo sigue funcionando sin sellar/seleccionar esas columnas.
let auditColumnsEnabled;
async function auditEnabled() {
  if (auditColumnsEnabled !== undefined) return auditColumnsEnabled;
  if (!hasSupabaseClient()) return (auditColumnsEnabled = false);
  try {
    const { error } = await supabaseClient.from("products").select("updated_by").limit(1);
    auditColumnsEnabled = !error;
  } catch (error) {
    auditColumnsEnabled = false;
  }
  return auditColumnsEnabled;
}

// Devuelve { updated_by } (y created_by si se pide) sólo si las columnas existen.
async function auditStamp(includeCreated = false) {
  if (!(await auditEnabled())) return {};
  const email = await getCurrentUserEmail();
  return includeCreated ? { created_by: email, updated_by: email } : { updated_by: email };
}

// ===== Historial de actividad (Fase 6) =====
// ¿Existe la tabla activity_log? Se detecta una vez. Si la migración fase6 no se
// aplicó, todo sigue funcionando sin registrar historial.
let activityLogEnabledFlag;
async function activityLogEnabled() {
  if (activityLogEnabledFlag !== undefined) return activityLogEnabledFlag;
  if (!hasSupabaseClient()) return (activityLogEnabledFlag = false);
  try {
    const { error } = await supabaseClient.from("activity_log").select("id").limit(1);
    activityLogEnabledFlag = !error;
  } catch (error) {
    activityLogEnabledFlag = false;
  }
  return activityLogEnabledFlag;
}

// Formato de precio para los textos del historial ("de $50 a $60").
function priceLabel(value) {
  const n = Number(value || 0);
  if (!(n > 0)) return "—";
  return "$" + (Number.isInteger(n) ? n : n.toFixed(2).replace(/\.0+$/, ""));
}

// Registra una acción en el historial. Fire-and-forget: NUNCA rompe la escritura
// que la originó (si falla el log, solo se avisa por consola).
async function logActivity(entry) {
  try {
    if (!(await activityLogEnabled())) return;
    await supabaseClient.from("activity_log").insert({
      actor_email: await getCurrentUserEmail(),
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id ?? null,
      entity_name: entry.entity_name ?? null,
      field: entry.field ?? null,
      old_value: entry.old_value == null ? null : String(entry.old_value),
      new_value: entry.new_value == null ? null : String(entry.new_value),
      summary: entry.summary ?? null,
    });
  } catch (error) {
    console.warn("No se pudo registrar la actividad:", error?.message || error);
  }
}

// Lee el historial (más reciente primero) con filtros y paginación opcionales.
async function getActivityLog(options = {}) {
  if (!(await activityLogEnabled())) return [];
  const { limit = 50, offset = 0, entityType, actor, action, since } = options;
  let query = supabaseClient
    .from("activity_log")
    .select("id, created_at, actor_email, action, entity_type, entity_id, entity_name, field, old_value, new_value, summary")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (entityType) query = query.eq("entity_type", entityType);
  if (actor) query = query.eq("actor_email", actor);
  if (action) query = query.eq("action", action);
  if (since) query = query.gte("created_at", since);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Historial de leads del formulario retirado (más reciente primero). Solo admins (RLS).
async function getLeads(options = {}) {
  ensureSupabaseForWrite();
  const { limit = 100, offset = 0, status } = options;
  let query = supabaseClient
    .from("leads")
    .select("id, created_at, name, email, phone, product, message, status, source")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Cambia el estado de un lead ('nuevo' | 'atendido' | 'archivado').
async function updateLeadStatus(id, status) {
  ensureSupabaseForWrite();
  const { data, error } = await supabaseClient
    .from("leads")
    .update({ status })
    .eq("id", id)
    .select("id, name, status")
    .single();
  if (error) throw error;
  await logActivity({
    action: "update", entity_type: "lead", entity_id: id, entity_name: data.name,
    new_value: status,
    summary: `marcó el mensaje de ${data.name || "un cliente"} como ${status}`,
  });
  return data;
}

async function getProductsWithFlavors(options = {}) {
  const useCache = options.cache !== false;
  const allowFallback = options.fallback !== false;

  if (useCache && productsCache) return productsCache;

  if (hasSupabaseClient()) {
    try {
      // Las columnas de auditoría (email del editor) sólo se piden en el admin
      // (options.audit), nunca en el catálogo público, para no exponer correos.
      const productSelect = (options.audit && await auditEnabled()) ? PRODUCT_SELECT_AUDIT : PRODUCT_SELECT;
      const { data, error } = await supabaseClient
        .from("products")
        .select(productSelect)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data?.length) {
        const normalizedProducts = data.map(normalizeProductFromDb);
        const usableProducts = normalizedProducts.filter(isUsableRemoteProduct);

        if (usableProducts.length || !allowFallback) {
          productsCache = allowFallback ? usableProducts : normalizedProducts;
          productsCacheSource = "supabase";
          return productsCache;
        }

        console.warn("Supabase solo tiene productos de reparacion. La web usara datos locales hasta migrar el catalogo.");
      }

      if (data?.length && !allowFallback) {
        productsCache = data.map(normalizeProductFromDb);
        productsCacheSource = "supabase";
        return productsCache;
      }
    } catch (error) {
      console.warn("No se pudieron cargar productos desde Supabase:", error.message);
      if (!allowFallback) throw error;
    }
  }

  if (!allowFallback) return [];

  productsCache = getLocalProducts();
  productsCacheSource = "local";
  return productsCache;
}

async function getProductById(id) {
  const products = await getProductsWithFlavors();
  return products.find((product) => product.id === id || product.legacy_id === id) || null;
}

async function getCategories() {
  if (hasSupabaseClient()) {
    try {
      const { data, error } = await supabaseClient
        .from("categories")
        .select("id, name, slug, sort_order, is_active, parent_id")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) throw error;
      if (data?.length) return data;
    } catch (error) {
      console.warn("No se pudieron cargar categorias desde Supabase:", error.message);
    }
  }

  return DEFAULT_CATEGORIES;
}

// Todas las categorías (incluidas inactivas) para la gestión del admin.
async function getAllCategories() {
  ensureSupabaseForWrite();
  const { data, error } = await supabaseClient
    .from("categories")
    .select("id, name, slug, sort_order, is_active, parent_id")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

function categorySlugify(value = "") {
  return value
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Mueve varios productos a una categoría de una sola vez. Es lo que hace
// viable repartir los productos que cuelgan de una familia sin abrir un
// formulario por producto.
async function updateProductsCategory(ids = [], categoryId) {
  ensureSupabaseForWrite();
  const list = ids.map(String).filter(Boolean);
  if (!list.length) return 0;

  // `category` (texto) se deriva de la categoría destino para que no se
  // desincronice del category_id, que es la fuente de verdad.
  const { data: cat, error: catError } = await supabaseClient
    .from("categories").select("id, name").eq("id", categoryId).maybeSingle();
  if (catError) throw catError;
  if (!cat) throw new Error("La categoría destino no existe.");

  const { error } = await supabaseClient
    .from("products")
    .update({ category_id: cat.id, category: cat.name, ...(await auditStamp()) })
    .in("id", list);
  if (error) throw error;

  productsCache = null;
  await logActivity({
    action: "update",
    entity_type: "product",
    entity_name: `${list.length} productos`,
    summary: `movió ${list.length} producto(s) a la categoría «${cat.name}»`,
  });
  return list.length;
}

async function createCategory({ name, parentId = null, sortOrder = 100 }) {
  ensureSupabaseForWrite();
  const trimmed = name?.trim();
  if (!trimmed) throw new Error("El nombre de la categoría es obligatorio.");

  // El slug lleva sufijo de timestamp, así que nunca choca y los duplicados
  // pasaban sin aviso: así nacieron "ISO" e "ISO (aislada)" conviviendo.
  let siblingsQuery = supabaseClient.from("categories").select("id, name");
  siblingsQuery = parentId
    ? siblingsQuery.eq("parent_id", parentId)
    : siblingsQuery.is("parent_id", null);
  const { data: siblings } = await siblingsQuery;
  const clash = (siblings || []).find(
    (c) => (c.name || "").trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (clash) {
    throw new Error(`Ya existe «${clash.name}» en este nivel. Usá esa o elegí otro nombre.`);
  }
  // Slug único: fam- para familias, tipo- para tipos, + base del nombre.
  const base = categorySlugify(trimmed) || "categoria";
  const slug = `${parentId ? "tipo" : "fam"}-${base}-${Date.now().toString(36)}`;

  const { data, error } = await supabaseClient
    .from("categories")
    .insert({ name: trimmed, slug, parent_id: parentId, sort_order: sortOrder, is_active: true, ...(await auditStamp(true)) })
    .select("id, name, slug, sort_order, is_active, parent_id")
    .single();

  if (error) throw error;
  await logActivity({ action: "create", entity_type: "category", entity_id: data.id, entity_name: data.name, summary: `creó la categoría «${data.name}»` });
  return data;
}

async function updateCategory(id, changes = {}) {
  ensureSupabaseForWrite();
  const payload = { ...(await auditStamp()) };
  if (changes.name !== undefined) payload.name = changes.name?.trim();
  if (changes.sort_order !== undefined) payload.sort_order = Number(changes.sort_order);
  if (changes.is_active !== undefined) payload.is_active = Boolean(changes.is_active);
  if (changes.parent_id !== undefined) payload.parent_id = changes.parent_id;

  const { data, error } = await supabaseClient
    .from("categories")
    .update(payload)
    .eq("id", id)
    .select("id, name, slug, sort_order, is_active, parent_id")
    .single();

  if (error) throw error;
  // Solo registramos cambios significativos (nombre/activación), no los reordenamientos.
  const parts = [];
  if (changes.name !== undefined) parts.push(`renombrada a «${data.name}»`);
  if (changes.is_active !== undefined) parts.push(changes.is_active ? "activada" : "desactivada");
  if (parts.length) {
    await logActivity({ action: "update", entity_type: "category", entity_id: id, entity_name: data.name, summary: `categoría «${data.name}»: ${parts.join(", ")}` });
  }
  return data;
}

// Cuántos productos usan una categoría (o cualquiera de sus tipos hijos).
async function getCategoryProductCount(categoryId, childIds = []) {
  ensureSupabaseForWrite();
  const ids = [categoryId, ...childIds];
  const { count, error } = await supabaseClient
    .from("products")
    .select("id", { count: "exact", head: true })
    .in("category_id", ids);

  if (error) throw error;
  return count || 0;
}

async function deleteCategory(id) {
  ensureSupabaseForWrite();
  let name = null;
  try {
    const { data: prev } = await supabaseClient.from("categories").select("name").eq("id", id).maybeSingle();
    name = prev?.name;
  } catch (_) { /* el historial es opcional */ }
  const { error } = await supabaseClient.from("categories").delete().eq("id", id);
  if (error) throw error;
  await logActivity({ action: "delete", entity_type: "category", entity_id: id, entity_name: name, summary: `eliminó la categoría «${name || id}»` });
}

async function getAdminProfile(userId) {
  ensureSupabaseForWrite();
  if (!userId) return null;

  const { data, error } = await supabaseClient
    .from("admin_profiles")
    .select("id, user_id, role, is_active")
    .eq("user_id", userId)
    .eq("role", "admin")
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

// Lista de perfiles admin (para la pantalla de Accesos). Solo admins (RLS).
async function getAdminProfiles() {
  ensureSupabaseForWrite();
  const { data, error } = await supabaseClient
    .from("admin_profiles")
    .select("id, user_id, email, role, is_active, created_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function setAdminProfileActive(id, active) {
  ensureSupabaseForWrite();
  const { data, error } = await supabaseClient
    .from("admin_profiles")
    .update({ is_active: Boolean(active) })
    .eq("id", id)
    .select("id, user_id, email, role, is_active, created_at")
    .single();

  if (error) throw error;
  await logActivity({
    action: "availability", entity_type: "admin", entity_id: data.user_id || null, entity_name: data.email,
    new_value: data.is_active ? "activo" : "inactivo",
    summary: `${data.is_active ? "activó" : "desactivó"} el acceso de ${data.email || "un administrador"}`,
  });
  return data;
}

async function getHomeProducts() {
  const products = await getProductsWithFlavors();
  const homeProducts = products
    .filter((product) => product.show_on_home)
    .sort((a, b) => {
      const orderA = a.home_order ?? 999;
      const orderB = b.home_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name, "es");
    });

  if (homeProducts.length) return homeProducts.slice(0, 8);

  return products
    .filter((product) => product.featured)
    .slice(0, 8);
}

async function updateHomeProducts(productIds = []) {
  ensureSupabaseForWrite();

  const cleanIds = [...new Set(productIds.filter(Boolean))];
  if (cleanIds.length < 4) {
    throw new Error("No puedes mostrar menos de 4 productos en el inicio.");
  }

  if (cleanIds.length > 8) {
    throw new Error("No puedes mostrar mas de 8 productos en el inicio.");
  }

  const { error: resetError } = await supabaseClient
    .from("products")
    .update({ show_on_home: false, home_order: null, is_featured: false, featured: false })
    .not("id", "is", null);

  if (resetError) throw resetError;

  for (const [index, id] of cleanIds.entries()) {
    const { error } = await supabaseClient
      .from("products")
      .update({
        show_on_home: true,
        home_order: index + 1,
        is_featured: true,
        featured: true,
      })
      .eq("id", id);

    if (error) throw error;
  }

  productsCache = null;
  return getHomeProducts();
}

// Convierte/redimensiona una imagen a WebP en el navegador antes de subirla,
// para que pese poco en todo el sitio. Devuelve un Blob webp o null si falla
// (navegador viejo, formato no rasterizable) -> en ese caso se sube el original.
async function compressImageToWebp(file, maxSide = 800, quality = 0.82) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    return blob && blob.type === "image/webp" ? blob : null;
  } catch (_) {
    return null;
  }
}

async function uploadProductImage(file) {
  ensureSupabaseForWrite();
  if (!file) return "";

  // Validar antes de subir: el bucket es público y la extensión del nombre
  // es falsificable, así que comprobamos el tipo MIME real y el tamaño.
  if (!file.type || !file.type.startsWith("image/")) {
    throw new Error("El archivo debe ser una imagen (JPG, PNG o WebP).");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("La imagen supera el límite de 5 MB. Optimízala antes de subirla.");
  }

  // Optimizar a WebP; si la conversión no aplica o no achica, subir el original.
  let body = file;
  let extension = file.name.split(".").pop()?.toLowerCase() || "webp";
  let contentType = file.type;
  const webp = await compressImageToWebp(file);
  if (webp && webp.size < file.size) {
    body = webp;
    extension = "webp";
    contentType = "image/webp";
  }

  const safeName = createSlug(file.name.replace(/\.[^.]+$/, "")) || "producto";
  const path = `${Date.now()}-${safeName}.${extension}`;

  const { error } = await supabaseClient.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(path, body, {
      cacheControl: "3600",
      upsert: false,
      contentType,
    });

  if (error) throw error;

  const { data } = supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || "";
}

// Borra del bucket una imagen recién subida cuya URL pública conocemos.
// Se usa para limpiar huérfanas cuando el guardado del producto falla
// después de haber subido la imagen. Best-effort: no propaga errores.
async function removeProductImage(publicUrl) {
  if (!publicUrl) return;
  const marker = `/${PRODUCT_IMAGE_BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return; // no es una URL de nuestro bucket (p.ej. imagen externa)
  const path = decodeURIComponent(publicUrl.slice(idx + marker.length));
  try {
    await supabaseClient.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  } catch (_) {
    // Silencioso: limpiar la huérfana es secundario al error original.
  }
}

async function createProduct(productData) {
  ensureSupabaseForWrite();
  const payload = mapProductToDb(productData);
  Object.assign(payload, await auditStamp(true));
  const { data, error } = await supabaseClient
    .from("products")
    .insert(payload)
    .select(PRODUCT_BASE_SELECT)
    .single();

  if (error) throw error;
  productsCache = null;
  const result = normalizeProductFromDb(data);
  await logActivity({ action: "create", entity_type: "product", entity_id: result.id, entity_name: result.name, summary: `creó el producto «${result.name}»` });
  return result;
}

// `options.expectedUpdatedAt`: si se pasa, sólo actualiza si el updated_at en BD
// sigue igual al que se cargó (guard de edición concurrente). Si otro admin lo
// cambió, no actualiza ninguna fila y se lanza un error con code "CONFLICT".
async function updateProduct(id, productData, options = {}) {
  ensureSupabaseForWrite();

  // Guard de edición concurrente: si el updated_at en BD ya no coincide con el
  // que se cargó, otro admin lo modificó. Comparamos cadenas de la misma
  // serialización (PostgREST), así que la igualdad es exacta cuando no cambió.
  if (options.expectedUpdatedAt) {
    const { data: current, error: checkError } = await supabaseClient
      .from("products")
      .select("updated_at")
      .eq("id", id)
      .maybeSingle();
    if (checkError) throw checkError;
    if (current && current.updated_at && current.updated_at !== options.expectedUpdatedAt) {
      const conflict = new Error("Otro admin modificó este producto mientras lo editabas.");
      conflict.code = "CONFLICT";
      throw conflict;
    }
  }

  // Estado anterior, para describir el cambio en el historial (antes → después).
  let prevRow = null;
  try {
    const { data: prev } = await supabaseClient
      .from("products")
      .select("name, price, old_price, available")
      .eq("id", id)
      .maybeSingle();
    prevRow = prev;
  } catch (_) { /* el historial es opcional */ }

  const payload = mapProductToDb(productData);
  delete payload.legacy_id;
  Object.assign(payload, await auditStamp());

  const { data, error } = await supabaseClient
    .from("products")
    .update(payload)
    .eq("id", id)
    .select(PRODUCT_BASE_SELECT)
    .single();

  if (error) throw error;
  productsCache = null;
  const result = normalizeProductFromDb(data);

  const changes = [];
  if (prevRow) {
    if ((prevRow.name || "") !== (result.name || "")) changes.push(`nombre «${prevRow.name}» → «${result.name}»`);
    if (Number(prevRow.price || 0) !== Number(result.price || 0)) changes.push(`precio ${priceLabel(prevRow.price)} → ${priceLabel(result.price)}`);
    if (Number(prevRow.old_price || 0) !== Number(result.old_price || 0)) changes.push(`oferta ${priceLabel(prevRow.old_price)} → ${priceLabel(result.old_price)}`);
    if ((prevRow.available !== false) !== (result.available !== false)) changes.push(result.available !== false ? "marcado disponible" : "marcado agotado");
  }
  await logActivity({
    action: "update", entity_type: "product", entity_id: id, entity_name: result.name,
    summary: changes.length ? `editó «${result.name}»: ${changes.join(", ")}` : `editó «${result.name}»`,
  });
  return result;
}

// Update parcial: toca SOLO las columnas de disponibilidad. No pasa por
// mapProductToDb, así que no reescribe imagen, slug ni precio_centavos.
async function setProductAvailability(id, available) {
  ensureSupabaseForWrite();
  const isAvailable = Boolean(available);
  const { data, error } = await supabaseClient
    .from("products")
    .update({
      available: isAvailable,
      is_available: isAvailable,
      is_active: isAvailable,
      tag: isAvailable ? "Disponible" : "Consultar stock",
      ...(await auditStamp()),
    })
    .eq("id", id)
    .select(PRODUCT_BASE_SELECT)
    .single();

  if (error) throw error;
  productsCache = null;
  const result = normalizeProductFromDb(data);
  await logActivity({
    action: "availability", entity_type: "product", entity_id: id, entity_name: result.name,
    field: "disponibilidad", new_value: isAvailable ? "disponible" : "agotado",
    summary: `marcó «${result.name}» como ${isAvailable ? "disponible" : "agotado"}`,
  });
  return result;
}

// Update parcial de precio: toca SOLO las columnas de precio. No pasa por
// mapProductToDb, así que no reescribe imagen, slug ni disponibilidad.
// `oldPrice` undefined = no tocar la oferta; null o "" = quitar la oferta.
async function setProductPricing(id, { price, oldPrice } = {}) {
  ensureSupabaseForWrite();
  // Precio anterior, para el texto del historial ("de $50 a $60").
  let prevPrice = null;
  try {
    const { data: prev } = await supabaseClient.from("products").select("price").eq("id", id).maybeSingle();
    prevPrice = prev?.price;
  } catch (_) { /* el historial es opcional */ }
  const numericPrice = price === "" || price == null ? null : Number(price);
  if (numericPrice != null && !Number.isFinite(numericPrice)) {
    throw new Error("El precio no es un número válido.");
  }
  const payload = {
    price: numericPrice,
    precio_centavos: numericPrice == null ? 0 : Math.round(numericPrice * 100),
    ...(await auditStamp()),
  };
  if (oldPrice !== undefined) {
    const numericOld = oldPrice === "" || oldPrice == null ? null : Number(oldPrice);
    if (numericOld != null && !Number.isFinite(numericOld)) {
      throw new Error("El precio anterior no es un número válido.");
    }
    payload.old_price = numericOld;
  }

  const { data, error } = await supabaseClient
    .from("products")
    .update(payload)
    .eq("id", id)
    .select(PRODUCT_BASE_SELECT)
    .single();

  if (error) throw error;
  productsCache = null;
  const result = normalizeProductFromDb(data);
  await logActivity({
    action: "price", entity_type: "product", entity_id: id, entity_name: result.name,
    field: "precio", old_value: priceLabel(prevPrice), new_value: priceLabel(result.price),
    summary: `cambió el precio de «${result.name}» de ${priceLabel(prevPrice)} a ${priceLabel(result.price)}`,
  });
  return result;
}

// Update parcial de disponibilidad de un sabor: no reescribe nombre/precio/stock.
async function setFlavorAvailability(id, available) {
  ensureSupabaseForWrite();
  const isAvailable = Boolean(available);
  const { data, error } = await supabaseClient
    .from("product_flavors")
    .update({ available: isAvailable, is_available: isAvailable, ...(await auditStamp()) })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  productsCache = null;
  const result = normalizeFlavor(data);
  await logActivity({
    action: "availability", entity_type: "flavor", entity_id: id, entity_name: result.name,
    field: "disponibilidad", new_value: isAvailable ? "disponible" : "agotado",
    summary: `marcó el sabor «${result.name}» como ${isAvailable ? "disponible" : "agotado"}`,
  });
  return result;
}

async function deleteProduct(id) {
  ensureSupabaseForWrite();
  // Nombre antes de borrar, para que el historial sea legible.
  let name = null;
  try {
    const { data: prev } = await supabaseClient.from("products").select("name").eq("id", id).maybeSingle();
    name = prev?.name;
  } catch (_) { /* el historial es opcional */ }
  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) throw error;
  productsCache = null;
  await logActivity({ action: "delete", entity_type: "product", entity_id: id, entity_name: name, summary: `eliminó el producto «${name || id}»` });
}

async function createFlavor(productId, flavorData) {
  ensureSupabaseForWrite();
  const { data, error } = await supabaseClient
    .from("product_flavors")
    .insert({
      product_id: productId,
      name: flavorData.name?.trim(),
      available: flavorData.is_available ?? flavorData.available ?? true,
      is_available: flavorData.is_available ?? flavorData.available ?? true,
      ...(await auditStamp(true)),
    })
    .select()
    .single();

  if (error) throw error;
  productsCache = null;
  const result = normalizeFlavor(data);
  await logActivity({ action: "create", entity_type: "flavor", entity_id: result.id, entity_name: result.name, summary: `agregó el sabor «${result.name}»` });
  return result;
}

async function updateFlavor(id, flavorData) {
  ensureSupabaseForWrite();
  const { data, error } = await supabaseClient
    .from("product_flavors")
    .update({
      name: flavorData.name?.trim(),
      available: flavorData.is_available ?? flavorData.available ?? true,
      is_available: flavorData.is_available ?? flavorData.available ?? true,
      ...(await auditStamp()),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  productsCache = null;
  const result = normalizeFlavor(data);
  await logActivity({ action: "update", entity_type: "flavor", entity_id: id, entity_name: result.name, summary: `editó el sabor «${result.name}»` });
  return result;
}

async function deleteFlavor(id) {
  ensureSupabaseForWrite();
  let name = null;
  try {
    const { data: prev } = await supabaseClient.from("product_flavors").select("name").eq("id", id).maybeSingle();
    name = prev?.name;
  } catch (_) { /* el historial es opcional */ }
  const { error } = await supabaseClient.from("product_flavors").delete().eq("id", id);
  if (error) throw error;
  productsCache = null;
  await logActivity({ action: "delete", entity_type: "flavor", entity_id: id, entity_name: name, summary: `eliminó el sabor «${name || id}»` });
}

async function seedProductsFromLocalData() {
  ensureSupabaseForWrite();

  const localProducts = getLocalProducts();
  if (!localProducts.length) {
    return { created: 0, skipped: 0, flavorsCreated: 0, errors: ["No hay productos locales para migrar."] };
  }

  const legacyIds = localProducts.map((product) => product.legacy_id).filter(Boolean);
  const { data: existingRows, error: existingError } = await supabaseClient
    .from("products")
    .select("id, legacy_id")
    .in("legacy_id", legacyIds);

  if (existingError) throw existingError;

  const existingByLegacyId = new Map((existingRows || []).map((row) => [row.legacy_id, row.id]));
  const summary = { created: 0, skipped: 0, flavorsCreated: 0, errors: [] };

  for (const product of localProducts) {
    if (existingByLegacyId.has(product.legacy_id)) {
      summary.skipped += 1;
      continue;
    }

    try {
      const createdProduct = await createProduct({
        name: product.name,
        brand: product.brand,
        category: product.category,
        price: product.price,
        presentation: product.presentation,
        image_url: product.image,
        description: Array.isArray(product.descripcion) ? product.descripcion.join("\n") : product.description,
        description_short: product.subtitulo,
        description_long: Array.isArray(product.descripcion) ? product.descripcion.join("\n") : product.description,
        beneficios: product.beneficios,
        descripcion: product.descripcion,
        uso: product.uso,
        available: product.available,
        is_available: product.available,
        featured: product.featured,
        is_featured: product.featured,
        show_on_home: product.show_on_home || product.featured,
        home_order: product.home_order,
        label: product.label,
        tags: product.tags,
        goals: product.goals,
        legacy_id: product.legacy_id,
      });

      summary.created += 1;

      for (const flavor of product.flavors) {
        await createFlavor(createdProduct.id, {
          name: flavor.name,
          available: flavor.available,
        });
        summary.flavorsCreated += 1;
      }
    } catch (error) {
      summary.errors.push(`${product.name}: ${error.message}`);
    }
  }

  productsCache = null;
  return summary;
}

// ===== Combos =====
function normalizeCombo(combo) {
  const items = (combo.combo_items || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item) => {
      const product = item.products || null;
      return {
        id: item.id,
        product_id: item.product_id,
        flavor_id: item.flavor_id,
        quantity: item.quantity ?? 1,
        product_name: product?.name || "Producto",
        product_image: product?.image_url || DB_PLACEHOLDER_IMAGE,
        product_slug: product?.slug || null,
        flavor_name: item.product_flavors?.name || null,
      };
    });

  const price = combo.price == null
    ? (combo.precio_centavos ? combo.precio_centavos / 100 : null)
    : Number(combo.price);

  return {
    id: combo.id,
    name: combo.name,
    slug: combo.slug,
    description: combo.description || "",
    image: combo.image_url || DB_PLACEHOLDER_IMAGE,
    image_url: combo.image_url || "",
    price,
    old_price: combo.old_price == null || combo.old_price === "" ? null : Number(combo.old_price),
    is_active: combo.is_active !== false,
    show_on_home: Boolean(combo.show_on_home),
    sort_order: combo.sort_order ?? 100,
    items,
    created_at: combo.created_at,
    updated_at: combo.updated_at,
    created_by: combo.created_by || null,
    updated_by: combo.updated_by || null,
  };
}

function mapComboToDb(data = {}) {
  const price = data.price === "" || data.price == null ? null : Number(data.price);
  const oldPrice = data.old_price === "" || data.old_price == null ? null : Number(data.old_price);
  return {
    name: data.name?.trim(),
    description: data.description?.trim() || null,
    image_url: data.image_url?.trim() || null,
    price,
    precio_centavos: price == null ? 0 : Math.round(price * 100),
    old_price: oldPrice,
    is_active: data.is_active ?? true,
    show_on_home: Boolean(data.show_on_home),
    sort_order: data.sort_order ?? 100,
  };
}

async function getCombos(options = {}) {
  if (!hasSupabaseClient()) return [];
  const comboSelect = (options.audit && await auditEnabled()) ? COMBO_SELECT_AUDIT : COMBO_SELECT;
  let query = supabaseClient.from("combos").select(comboSelect).order("sort_order", { ascending: true });
  if (options.activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeCombo);
}

async function createCombo(data) {
  ensureSupabaseForWrite();
  const payload = mapComboToDb(data);
  payload.slug = `${categorySlugify(data.name) || "combo"}-${Date.now().toString(36)}`;
  Object.assign(payload, await auditStamp(true));
  const { data: row, error } = await supabaseClient.from("combos").insert(payload).select(COMBO_SELECT).single();
  if (error) throw error;
  const result = normalizeCombo(row);
  await logActivity({ action: "create", entity_type: "combo", entity_id: result.id, entity_name: result.name, summary: `creó el combo «${result.name}»` });
  return result;
}

async function updateCombo(id, data) {
  ensureSupabaseForWrite();
  let prevRow = null;
  try {
    const { data: prev } = await supabaseClient.from("combos").select("name, price, old_price, is_active").eq("id", id).maybeSingle();
    prevRow = prev;
  } catch (_) { /* el historial es opcional */ }
  const payload = mapComboToDb(data);
  Object.assign(payload, await auditStamp());
  const { data: row, error } = await supabaseClient.from("combos").update(payload).eq("id", id).select(COMBO_SELECT).single();
  if (error) throw error;
  const result = normalizeCombo(row);

  const changes = [];
  if (prevRow) {
    if ((prevRow.name || "") !== (result.name || "")) changes.push(`nombre «${prevRow.name}» → «${result.name}»`);
    if (Number(prevRow.price || 0) !== Number(result.price || 0)) changes.push(`precio ${priceLabel(prevRow.price)} → ${priceLabel(result.price)}`);
    if (Number(prevRow.old_price || 0) !== Number(result.old_price || 0)) changes.push(`oferta ${priceLabel(prevRow.old_price)} → ${priceLabel(result.old_price)}`);
    if ((prevRow.is_active !== false) !== (result.is_active !== false)) changes.push(result.is_active !== false ? "activado" : "desactivado");
  }
  await logActivity({
    action: "update", entity_type: "combo", entity_id: id, entity_name: result.name,
    summary: changes.length ? `editó el combo «${result.name}»: ${changes.join(", ")}` : `editó el combo «${result.name}»`,
  });
  return result;
}

// Update parcial: solo activa/desactiva el combo.
async function setComboActive(id, active) {
  ensureSupabaseForWrite();
  const { data, error } = await supabaseClient
    .from("combos")
    .update({ is_active: Boolean(active), ...(await auditStamp()) })
    .eq("id", id)
    .select(COMBO_SELECT)
    .single();
  if (error) throw error;
  const result = normalizeCombo(data);
  await logActivity({
    action: "availability", entity_type: "combo", entity_id: id, entity_name: result.name,
    field: "estado", new_value: active ? "activo" : "inactivo",
    summary: `${active ? "activó" : "desactivó"} el combo «${result.name}»`,
  });
  return result;
}

async function deleteCombo(id) {
  ensureSupabaseForWrite();
  let name = null;
  try {
    const { data: prev } = await supabaseClient.from("combos").select("name").eq("id", id).maybeSingle();
    name = prev?.name;
  } catch (_) { /* el historial es opcional */ }
  const { error } = await supabaseClient.from("combos").delete().eq("id", id);
  if (error) throw error;
  await logActivity({ action: "delete", entity_type: "combo", entity_id: id, entity_name: name, summary: `eliminó el combo «${name || id}»` });
}

// Reemplaza por completo los items de un combo.
async function saveComboItems(comboId, items = []) {
  ensureSupabaseForWrite();
  const { error: delError } = await supabaseClient.from("combo_items").delete().eq("combo_id", comboId);
  if (delError) throw delError;
  if (!items.length) return;
  const rows = items.map((item, index) => ({
    combo_id: comboId,
    product_id: item.product_id,
    flavor_id: item.flavor_id || null,
    quantity: item.quantity || 1,
    sort_order: index,
  }));
  const { error: insError } = await supabaseClient.from("combo_items").insert(rows);
  if (insError) throw insError;
}

function getProductsCacheSource() {
  return productsCacheSource;
}

window.catalogDb = {
  getProductsWithFlavors,
  getProductById,
  getCategories,
  getAllCategories,
  updateProductsCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryProductCount,
  getCombos,
  createCombo,
  updateCombo,
  setComboActive,
  deleteCombo,
  saveComboItems,
  getAdminProfile,
  getAdminProfiles,
  setAdminProfileActive,
  getHomeProducts,
  updateHomeProducts,
  uploadProductImage,
  removeProductImage,
  createProduct,
  updateProduct,
  setProductAvailability,
  setProductPricing,
  setFlavorAvailability,
  deleteProduct,
  createFlavor,
  updateFlavor,
  deleteFlavor,
  normalizeProductFromDb,
  seedProductsFromLocalData,
  getProductsCacheSource,
  getActivityLog,
  getLeads,
  updateLeadStatus,
  isUuid,
};
