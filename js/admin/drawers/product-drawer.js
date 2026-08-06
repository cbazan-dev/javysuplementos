/* ============================================================================
   Drawer de producto (CRÍTICO): formulario por secciones, cascada Familia→Tipo,
   imagen, chips de sabores/tags, objetivos, validación inline y guardado con
   sincronización de sabores. Comportamiento idéntico al monolito original.
   ============================================================================ */
import { state, catById, families, typesOf } from "../state.js?v=adm-b0d853ee";
import { PLACEHOLDER, HOME_MAX, GOAL_SUGGESTIONS } from "../config.js?v=adm-b0d853ee";
import { $, esc, ico } from "../helpers.js?v=adm-b0d853ee";
import { field, affix, switchRow, switchMarkup, chipTag, bindChips, confirmModal, toast } from "../ui.js?v=adm-b0d853ee";
import { requestRerender } from "../shell.js?v=adm-b0d853ee";
import { reloadProducts } from "../data.js?v=adm-b0d853ee";

// Arreglos de texto (beneficios/uso/descripción) ⇄ textarea (una línea por ítem).
const linesToText = (v) => Array.isArray(v) ? v.join("\n") : (v || "");
const textToLines = (v) => String(v || "").split("\n").map((s) => s.trim()).filter(Boolean);

export function openProductDrawer(product, opts = {}) {
  const isNew = !product || !product.id;
  const data = {
    id: product ? product.id : null,
    name: product ? product.name || "" : "",
    brand: product ? product.brand || "" : "",
    category_id: product ? product.category_id || "" : "",
    presentation: product ? product.presentation || "" : "",
    price: product && product.price ? String(product.price) : "",
    old_price: product && product.old_price ? String(product.old_price) : "",
    image: product ? (product.stored_image_url || product.image || "") : "",
    description_short: product ? product.description_short || "" : "",
    description_long: product ? product.description_long || "" : "",
    beneficios: product ? linesToText(product.beneficios) : "",
    uso: product ? linesToText(product.uso) : "",
    flavors: product ? (product.flavors || []).map((f) => ({ id: f.id || null, name: f.name, available: f.available !== false })) : [],
    noFlavor: product ? product.flavor_mode === "no_flavor" : false,
    tags: product ? [...(product.tags || [])] : [],
    goals: product ? [...(product.goals || [])] : [],
    available: product ? product.available !== false : true,
    featured: product ? !!product.featured : false,
    home: product ? !!product.show_on_home : false,
    home_order: product && product.home_order ? String(product.home_order) : "",
    updated_at: product ? product.updated_at : null,
  };
  // cascada: familia/tipo desde category_id
  let famId = "", typeId = "";
  if (data.category_id) {
    const cat = catById(data.category_id);
    if (cat) {
      if (cat.parent_id) { typeId = cat.id; famId = cat.parent_id; }
      // Un producto ya guardado colgando de la familia se abre con "Sin
      // subcategoría" preseleccionado: la decisión ya está tomada y no tiene
      // sentido bloquear una edición de precio por eso. Los sueltos se
      // detectan con el filtro "Sin subcategoría" y se reparten en lote.
      else { famId = cat.id; typeId = "none"; }
    }
  }
  const draftImageFile = { file: null, cleared: false };
  let touched = false;
  let dirty = false;
  const markDirty = () => { dirty = true; };
  // Imagen que muestra la vista previa (Fase 3). Se cachea para no crear un
  // objectURL nuevo en cada tecleo; se actualiza sólo al cambiar/quitar imagen.
  let previewImgUrl = data.image || PLACEHOLDER;
  let previewObjUrl = null;

  const host = $("#adminDrawerHost");
  const overlay = document.createElement("div");
  overlay.className = "ad-modal-overlay";
  host.appendChild(overlay);

  const metaLine = (!isNew && product.updated_by)
    ? `${esc(product.brand || "")} · última edición por ${esc(product.updated_by)}`
    : (isNew ? (opts.duplicateOf ? `Copia de ${esc(opts.duplicateOf)}` : "Completá los datos esenciales") : esc(product.brand || "Editar producto"));

  function familyOptions() {
    return `<option value="">Elegir…</option>` + families().map((f) => `<option value="${esc(f.id)}"${f.id === famId ? " selected" : ""}>${esc(f.name)}</option>`).join("");
  }
  function typeOptions() {
    const ts = famId ? typesOf(famId) : [];
    // "none" es la opción explícita para dejarlo colgado de la familia. Sin
    // ella el campo se saltaba por omisión, y así terminó la mitad del
    // catálogo sin subcategoría.
    const noneOpt = ts.length
      ? `<option value="none"${typeId === "none" ? " selected" : ""}>Sin subcategoría</option>`
      : "";
    return `<option value="">${famId ? "Elegir…" : "—"}</option>${noneOpt}`
      + ts.map((t) => `<option value="${esc(t.id)}"${t.id === typeId ? " selected" : ""}>${esc(t.name)}</option>`).join("");
  }

  // Secciones del modal: [key, número, etiqueta corta (índice), título largo (encabezado)].
  const SECS = [
    ["esencial", 1, "Esencial", "Información esencial"],
    ["precio", 2, "Precio", "Precio y oferta"],
    ["imagen", 3, "Imagen", "Imagen"],
    ["sabores", 4, "Sabores", "Sabores / variantes"],
    ["descripcion", 5, "Descripción", "Descripción y etiquetas"],
    ["visibilidad", 6, "Visibilidad", "Disponibilidad y visibilidad"],
  ];
  const railItem = ([key, num, short]) => `
    <button class="ad-modal__rail-item${num === 1 ? " is-active" : ""}" type="button" data-go-sec="${key}">
      <span class="ad-modal__rail-num">${num}</span><span>${esc(short)}</span><span class="ad-modal__rail-dot"></span>
    </button>`;
  const sec = (key, body) => {
    const [, num, , title] = SECS.find((s) => s[0] === key);
    return `<section class="ad-modal__sec" data-sec="${key}">
      <h3 class="ad-modal__sec-title"><span class="ad-modal__sec-num">${num}</span>${esc(title)}</h3>
      <div class="ad-modal__sec-body">${body}</div>
    </section>`;
  };

  const manualTextField = (label, dataF, value, placeholder, help, className = "") => `
    <div class="ad-field">
      <label class="ad-field__label" for="product-${dataF}">${esc(label)}</label>
      <textarea id="product-${dataF}" class="ad-textarea ${esc(className)}" data-f="${dataF}" placeholder="${esc(placeholder)}">${esc(value)}</textarea>
      ${help ? `<span class="ad-field__help">${esc(help)}</span>` : ""}
    </div>`;

  overlay.innerHTML = `
    <div class="ad-modal__scrim" data-close></div>
    <div class="ad-modal ad-modal--product" role="dialog" aria-modal="true">
      <div class="ad-modal__head">
        <div><h2>${isNew ? "Nuevo producto" : "Editar producto"}</h2><p data-meta>${metaLine}</p></div>
        <button class="ad-modal__close" type="button" aria-label="Cerrar" data-close>${ico("x")}</button>
      </div>
      <div class="ad-modal__main">
        <nav class="ad-modal__rail" aria-label="Secciones del formulario">${SECS.map(railItem).join("")}</nav>
        <div class="ad-modal__content">
          ${sec("esencial", `
            ${field("Nombre del producto", true, `<input class="ad-input" data-f="name" value="${esc(data.name)}" placeholder="Ej. Isomorph 28 Whey Isolate" />`, "name")}
            <div class="ad-form-grid">
              ${field("Marca", false, `<input class="ad-input" data-f="brand" value="${esc(data.brand)}" placeholder="Ej. APS Nutrition" />`)}
              ${field("Presentación", false, `<input class="ad-input" data-f="presentation" value="${esc(data.presentation)}" placeholder="Ej. 5 lb · 300 g · 30 serv" />`)}
              ${field("Categoría", true, `<select class="ad-select" data-f="family" aria-label="Categoría">${familyOptions()}</select>`, "family")}
              ${field("Subcategoría", true, `<select class="ad-select" data-f="type" aria-label="Subcategoría" ${famId ? "" : "disabled"}>${typeOptions()}</select>`, "type")}
            </div>
          `)}
          ${sec("precio", `
            <div class="ad-form-grid">
              ${field("Precio actual", true, affix(`<input class="ad-input" inputmode="decimal" data-f="price" value="${esc(data.price)}" placeholder="0.00" />`), "price")}
              ${field("Precio anterior", false, affix(`<input class="ad-input" inputmode="decimal" data-f="old_price" value="${esc(data.old_price)}" placeholder="0.00" />`), "old_price", "Para mostrar oferta")}
            </div>
            <span class="ad-pill ad-pill--home" data-offer-pill style="justify-self:start;display:none"></span>
          `)}
          ${sec("imagen", `<div data-image-slot></div>`)}
          ${sec("sabores", `
            ${switchRow("noflavor", "Este producto no tiene sabores", "Se cotiza sin pedir sabor", data.noFlavor)}
            <div data-flavor-section${data.noFlavor ? " hidden" : ""}>
              ${field("Sabores", false, `
                <div class="ad-flavors" data-flavor-list></div>
                <div class="ad-flavor-add">
                  <input class="ad-input" type="text" data-flavor-add placeholder="Agregar sabor (ej. Chocolate)" />
                  <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-flavor-add-btn>${ico("plus")}Agregar</button>
                </div>
                <span class="ad-field__error" data-flavor-msg></span>
              `, null, "Marcá cada sabor como disponible o agotado")}
            </div>
          `)}
          ${sec("descripcion", `
            ${manualTextField("Descripción corta", "description_short", data.description_short, "Una oración que resuma el producto…", "Recomendación: una oración de 80–140 caracteres. Aparece bajo el nombre en la página de detalle.")}
            ${manualTextField("Descripción larga", "description_long", data.description_long, "Texto completo para la página de detalle…", "Recomendación: 2–4 párrafos y 80–180 palabras. Separá cada párrafo con un salto de línea.", "ad-textarea--long")}
            <div class="ad-form-grid">
              ${manualTextField("Beneficios", "beneficios", data.beneficios, "Un beneficio por línea…", "Recomendación: 3–6 beneficios, uno por línea.", "ad-textarea--list")}
              ${manualTextField("Modo de uso", "uso", data.uso, "Una instrucción por línea…", "Recomendación: 2–6 pasos, uno por línea.", "ad-textarea--list")}
            </div>
            ${field("Tags", false, `<div class="ad-chips-input" data-tags>${data.tags.map(chipTag).join("")}<input type="text" placeholder="Ej. Energía" /></div>`, null, "Afectan la búsqueda y los filtros; no aparecen en la card.")}
            ${field("Objetivos", false, `<div style="display:flex;flex-wrap:wrap;gap:8px" data-goals>${GOAL_SUGGESTIONS.concat(data.goals.filter((g) => !GOAL_SUGGESTIONS.includes(g))).map((g) => `<button type="button" class="ad-chip-toggle${data.goals.includes(g) ? " is-active" : ""}" data-goal="${esc(g)}">${esc(g)}</button>`).join("")}</div>`, null, "Afectan la búsqueda y los filtros; no aparecen en la card.")}
          `)}
          ${sec("visibilidad", `
            <div>
              ${switchRow("available", "Disponible", "Visible y cotizable en la tienda", data.available)}
              ${switchRow("featured", "Destacado", "Resalta el producto en su categoría", data.featured)}
              ${switchRow("home", "Mostrar en inicio", "Aparece entre los productos del home (máx. " + HOME_MAX + ")", data.home)}
            </div>
            <div data-home-order-slot>${data.home ? field("Orden en inicio", false, `<input class="ad-input" inputmode="numeric" data-f="home_order" value="${esc(data.home_order)}" placeholder="Ej. 1" style="max-width:120px" />`, null, "Posición entre los destacados del home") : ""}</div>
          `)}
        </div>
        <aside class="ad-modal__preview" aria-label="Vista previa del producto">
          <div class="ad-modal__preview-top">
            <p class="ad-modal__preview-head">Vista previa</p>
            <div class="ad-preview-switch" role="group" aria-label="Tipo de vista previa">
              <button type="button" class="is-active" data-preview-mode="card" aria-pressed="true">Card</button>
              <button type="button" data-preview-mode="detail" aria-pressed="false">Detalle</button>
            </div>
          </div>
          <div class="ad-preview-card" data-preview-host></div>
          <p class="ad-preview-note" data-preview-note></p>
        </aside>
      </div>
      <div class="ad-modal__foot">
        <button class="ad-btn ad-btn--ghost" type="button" data-close>Cancelar</button>
        <button class="ad-btn ad-btn--primary" type="button" data-save>${ico("save")}${isNew ? "Crear producto" : "Guardar cambios"}</button>
      </div>
    </div>`;

  if (window.javyIcons) window.javyIcons.enhance(overlay);
  if (window.javyDropdown) window.javyDropdown.enhanceSelects(overlay);
  document.body.style.overflow = "hidden";

  const get = (sel) => overlay.querySelector(sel);
  const fEl = (name) => overlay.querySelector(`[data-f="${name}"]`);

  // La card usa las mismas clases que el catálogo público. La vista de detalle
  // resume todos los campos editoriales sin guardar ni modificar datos.
  let previewMode = "card";
  const previewPrice = (v) => { const n = Number(v); return n > 0 ? "$" + n.toFixed(2) : "$0.00"; };
  function renderPreview() {
    const host = get("[data-preview-host]");
    if (!host) return;
    const name = (fEl("name").value || "").trim() || "Nombre del producto";
    const brand = (fEl("brand").value || "").trim() || "Marca";
    const pres = (fEl("presentation").value || "").trim();
    const category = catById(typeId || famId)?.name || "Categoría";
    const shortDescription = (fEl("description_short").value || "").trim();
    const longDescription = (fEl("description_long").value || "").trim();
    const benefits = textToLines(fEl("beneficios").value);
    const usage = textToLines(fEl("uso").value);
    const priceV = (fEl("price").value || "").trim();
    const oldV = (fEl("old_price").value || "").trim();
    const availSw = overlay.querySelector('[data-sw="available"]');
    const available = availSw ? availSw.checked : true;
    const priceN = Number(priceV), oldN = Number(oldV);
    const offer = priceN > 0 && oldN > priceN;
    const disc = offer ? Math.round((1 - priceN / oldN) * 100) : 0;
    const priceMarkup = `<span class="ad-detail-preview__price-now">${previewPrice(priceV)}</span>${offer ? `<span class="ad-detail-preview__price-old">${previewPrice(oldV)}</span><span class="ad-detail-preview__discount">-${disc}%</span>` : ""}`;

    if (previewMode === "detail") {
      const paragraphs = longDescription.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      host.className = "ad-detail-preview";
      host.innerHTML = `
        <article>
          <div class="ad-detail-preview__media">
            <img src="${esc(previewImgUrl || PLACEHOLDER)}" alt="" />
          </div>
          <div class="ad-detail-preview__content">
            <div class="ad-detail-preview__eyebrow">
              <span>${esc([category, pres].filter(Boolean).join(" · "))}</span>
              <span class="ad-detail-preview__status ${available ? "is-available" : "is-agotado"}">${available ? "Disponible" : "Agotado"}</span>
            </div>
            <p class="ad-detail-preview__brand">${esc(brand)}</p>
            <h3>${esc(name)}</h3>
            ${shortDescription ? `<p class="ad-detail-preview__short">${esc(shortDescription)}</p>` : `<p class="ad-detail-preview__empty">La descripción corta aparecerá aquí.</p>`}
            <p class="ad-detail-preview__price">${priceMarkup}</p>
          </div>
          <div class="ad-detail-preview__sections">
            <section>
              <h4>Descripción</h4>
              <div class="ad-detail-preview__prose">${paragraphs.length ? paragraphs.map((text) => `<p>${esc(text)}</p>`).join("") : `<p class="ad-detail-preview__empty">Sin descripción larga.</p>`}</div>
            </section>
            <section>
              <h4>Beneficios</h4>
              ${benefits.length ? `<ul>${benefits.map((text) => `<li>${esc(text)}</li>`).join("")}</ul>` : `<p class="ad-detail-preview__empty">Sin beneficios.</p>`}
            </section>
            <section>
              <h4>Cómo usar</h4>
              ${usage.length ? `<ol>${usage.map((text) => `<li>${esc(text)}</li>`).join("")}</ol>` : `<p class="ad-detail-preview__empty">Sin instrucciones de uso.</p>`}
            </section>
          </div>
        </article>`;
      get("[data-preview-note]").textContent = "El detalle refleja la información editorial mientras escribís; las secciones vacías se ocultarán en la tienda.";
      return;
    }

    host.className = "ad-preview-card";
    host.innerHTML = `
      <article class="product-card">
        <div class="product-card__media">
          <img class="product-card__img" src="${esc(previewImgUrl || PLACEHOLDER)}" alt="" />
        </div>
        <div class="product-card__info">
          <div class="product-card__meta">
            <span class="product-card__brand">${esc(brand)}</span>
            <span class="product-card__status ${available ? "is-available" : "is-agotado"}">${available ? "Disponible" : "Agotado"}</span>
          </div>
          <h3 class="product-card__name">${esc(name)}</h3>
          <div class="product-card__price-row">
            <span class="product-card__price-group">
              <span class="product-card__price">${previewPrice(priceV)}</span>
              ${offer ? `<span class="product-card__price-old">${previewPrice(oldV)}</span><span class="product-card__discount">-${disc}%</span>` : ""}
            </span>
            ${pres ? `<span class="product-card__pres">${esc(pres)}</span>` : ""}
          </div>
        </div>
        <div class="product-card__actions">
          <span class="product-card__btn product-card__btn--buy">Agregar a cotización</span>
          <span class="product-card__detail-link">Ver detalles</span>
        </div>
      </article>`;
    get("[data-preview-note]").textContent = "La card muestra imagen, marca, disponibilidad, nombre, precio, oferta y presentación. Categorías, objetivos y tags se usan para búsqueda y filtros.";
  }

  // navegación por secciones: índice lateral + scroll-spy (resalta la sección visible)
  const content = get(".ad-modal__content");
  const railItems = [...overlay.querySelectorAll("[data-go-sec]")];
  const secEls = [...overlay.querySelectorAll(".ad-modal__sec")];
  const setActiveSec = (key) => railItems.forEach((b) => b.classList.toggle("is-active", b.getAttribute("data-go-sec") === key));
  railItems.forEach((b) => b.addEventListener("click", () => {
    const key = b.getAttribute("data-go-sec");
    const el = overlay.querySelector(`.ad-modal__sec[data-sec="${key}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSec(key);
  }));
  // El que scrollea es .ad-modal__content (desktop) o .ad-modal__main (mobile): escuchamos ambos.
  const onScrollSpy = () => {
    const ref = content.getBoundingClientRect().top + 80;
    let current = secEls[0];
    for (const s of secEls) { if (s.getBoundingClientRect().top <= ref) current = s; }
    if (current) setActiveSec(current.getAttribute("data-sec"));
  };
  [content, get(".ad-modal__main")].forEach((sc) => sc && sc.addEventListener("scroll", onScrollSpy, { passive: true }));

  // close handlers — pide confirmación si hay cambios sin guardar
  function destroy() {
    if (window.javyDropdown) window.javyDropdown.destroy(overlay);
    if (previewObjUrl) URL.revokeObjectURL(previewObjUrl);
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  }
  async function close() {
    if (dirty && !(await confirmModal({ title: "Descartar cambios", body: "Tenés cambios sin guardar. ¿Querés descartarlos?", confirmLabel: "Descartar", danger: true }))) return;
    destroy();
  }
  const onKey = (e) => {
    if (e.key === "Escape" && !document.querySelector(".jdd.is-open")) close();
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); doSave(); }
  };
  document.addEventListener("keydown", onKey);
  overlay.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));

  // cualquier cambio en el formulario marca el modal como "sucio" y refresca la preview
  content.addEventListener("input", () => { markDirty(); renderPreview(); });
  content.addEventListener("change", () => { markDirty(); renderPreview(); });

  overlay.querySelectorAll("[data-preview-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      previewMode = button.getAttribute("data-preview-mode") === "detail" ? "detail" : "card";
      overlay.querySelectorAll("[data-preview-mode]").forEach((item) => {
        const active = item.getAttribute("data-preview-mode") === previewMode;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderPreview();
    });
  });

  // cascade
  fEl("family").addEventListener("change", (e) => {
    famId = e.target.value; typeId = "";
    const typeSel = fEl("type");
    typeSel.innerHTML = typeOptions();
    typeSel.disabled = !famId;
    if (window.javyDropdown) window.javyDropdown.refresh(typeSel); // re-sincroniza el dropdown
    if (touched) validate();
  });
  fEl("type").addEventListener("change", (e) => { typeId = e.target.value; });

  // offer pill live
  const updateOfferPill = () => {
    const price = Number(fEl("price").value);
    const old = Number(fEl("old_price").value);
    const pill = get("[data-offer-pill]");
    if (price > 0 && old > price) {
      pill.style.display = "inline-flex";
      pill.textContent = `Oferta -${Math.round((1 - price / old) * 100)}%`;
    } else { pill.style.display = "none"; }
  };
  fEl("price").addEventListener("input", () => { updateOfferPill(); if (touched) validate(); });
  fEl("old_price").addEventListener("input", () => { updateOfferPill(); if (touched) validate(); });
  updateOfferPill();

  // image slot
  const imageSlot = get("[data-image-slot]");
  function renderImage() {
    const showSrc = draftImageFile.file ? URL.createObjectURL(draftImageFile.file)
      : (draftImageFile.cleared ? "" : data.image);
    if (showSrc) {
      imageSlot.innerHTML = `<div class="ad-drop ad-drop--filled"><div class="ad-drop__preview"><img src="${esc(showSrc)}" alt="" /><button type="button" class="ad-btn ad-btn--ghost ad-btn--sm ad-drop__change" data-img-change>${ico("upload")}Cambiar</button></div></div>
        <button type="button" class="ad-btn ad-btn--ghost ad-btn--sm" data-img-clear style="margin-top:8px">${ico("trash")}Quitar imagen</button>
        <input type="file" accept="image/*" data-img-input hidden />`;
    } else {
      imageSlot.innerHTML = `<label class="ad-drop">${ico("upload")}<strong>Subir imagen del producto</strong><small>PNG o WebP con fondo transparente · tocá para elegir</small><input type="file" accept="image/*" data-img-input hidden /></label>`;
    }
    if (window.javyIcons) window.javyIcons.enhance(imageSlot);
    const input = imageSlot.querySelector("[data-img-input]");
    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        draftImageFile.file = file; draftImageFile.cleared = false;
        if (previewObjUrl) URL.revokeObjectURL(previewObjUrl);
        previewObjUrl = URL.createObjectURL(file);
        previewImgUrl = previewObjUrl;
        renderImage(); renderPreview();
      }
    });
    const changeBtn = imageSlot.querySelector("[data-img-change]");
    if (changeBtn) changeBtn.addEventListener("click", () => input.click());
    const clearBtn = imageSlot.querySelector("[data-img-clear]");
    if (clearBtn) clearBtn.addEventListener("click", async () => {
      const ok = await confirmModal({ title: "Quitar imagen", body: "La imagen se quitará al guardar. ¿Continuar?", confirmLabel: "Quitar" });
      if (!ok) return;
      draftImageFile.file = null; draftImageFile.cleared = true;
      if (previewObjUrl) { URL.revokeObjectURL(previewObjUrl); previewObjUrl = null; }
      previewImgUrl = PLACEHOLDER;
      renderImage(); renderPreview();
    });
  }
  renderImage();
  renderPreview();

  // sabores con disponibilidad por sabor
  const flavorRows = data.flavors.map((f) => ({ id: f.id, name: f.name, available: f.available }));
  const flavorListEl = get("[data-flavor-list]");
  function renderFlavors() {
    flavorListEl.innerHTML = flavorRows.length
      ? flavorRows.map((f, i) => `
        <div class="ad-flavor-row">
          <span class="ad-flavor-row__name">${esc(f.name)}</span>
          ${switchMarkup(f.available, `data-flavor-toggle="${i}" aria-label="Disponible: ${esc(f.name)}"`)}
          <button class="ad-icon-btn ad-icon-btn--danger" type="button" data-flavor-del="${i}" title="Quitar">${ico("trash")}</button>
        </div>`).join("")
      : `<p class="ad-flavor-empty">Sin sabores todavía. Agregá uno abajo.</p>`;
    if (window.javyIcons) window.javyIcons.enhance(flavorListEl);
    flavorListEl.querySelectorAll("[data-flavor-toggle]").forEach((cb) => cb.addEventListener("change", () => {
      flavorRows[+cb.getAttribute("data-flavor-toggle")].available = cb.checked; markDirty();
    }));
    flavorListEl.querySelectorAll("[data-flavor-del]").forEach((b) => b.addEventListener("click", async () => {
      const i = +b.getAttribute("data-flavor-del");
      const f = flavorRows[i];
      if (!f) return;
      // Si el sabor ya está guardado, pedir confirmación (al guardar se borra de verdad).
      if (f.id && !(await confirmModal({ title: "Quitar sabor", body: `Se eliminará el sabor «${f.name}» al guardar los cambios.`, confirmLabel: "Quitar", danger: true }))) return;
      flavorRows.splice(i, 1); renderFlavors(); markDirty();
    }));
  }
  renderFlavors();
  const addFlavorInput = get("[data-flavor-add]");
  const flavorMsg = get("[data-flavor-msg]");
  function addFlavor() {
    if (flavorMsg) flavorMsg.textContent = "";
    const v = addFlavorInput.value.trim();
    if (!v) { addFlavorInput.value = ""; return; }
    if (flavorRows.some((f) => f.name.toLowerCase() === v.toLowerCase())) {
      if (flavorMsg) { flavorMsg.innerHTML = `${ico("x")}Ese sabor ya está en la lista`; if (window.javyIcons) window.javyIcons.enhance(flavorMsg); }
      addFlavorInput.focus(); addFlavorInput.select();
      return;
    }
    addFlavorInput.value = "";
    flavorRows.push({ id: null, name: v, available: true });
    renderFlavors(); markDirty(); addFlavorInput.focus();
  }
  get("[data-flavor-add-btn]").addEventListener("click", addFlavor);
  addFlavorInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addFlavor(); } });

  // "sin sabor": oculta la lista de sabores
  const noFlavorSwitch = overlay.querySelector('[data-sw="noflavor"]');
  noFlavorSwitch.addEventListener("change", () => { get("[data-flavor-section]").hidden = noFlavorSwitch.checked; });

  // tags
  const tagNames = [...data.tags];
  bindChips(get("[data-tags]"), {
    onAdd: (n) => tagNames.push(n),
    onRemove: (n) => { const i = tagNames.findIndex((x) => x.toLowerCase() === n.toLowerCase()); if (i >= 0) tagNames.splice(i, 1); },
  });

  // goals toggles
  const goalSet = new Set(data.goals);
  get("[data-goals]").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-goal]");
    if (!btn) return;
    const g = btn.getAttribute("data-goal");
    if (goalSet.has(g)) { goalSet.delete(g); btn.classList.remove("is-active"); }
    else { goalSet.add(g); btn.classList.add("is-active"); }
    markDirty();
  });

  // home switch reveals order field
  const homeSwitch = overlay.querySelector('[data-sw="home"]');
  homeSwitch.addEventListener("change", () => {
    const slot = get("[data-home-order-slot]");
    slot.innerHTML = homeSwitch.checked
      ? field("Orden en inicio", false, `<input class="ad-input" inputmode="numeric" data-f="home_order" value="${esc(data.home_order)}" placeholder="Ej. 1" style="max-width:120px" />`, null, "Posición entre los destacados del home")
      : "";
  });

  // validation
  function errors() {
    const price = fEl("price").value.trim();
    const old = fEl("old_price").value.trim();
    return {
      name: !fEl("name").value.trim() ? "El nombre es obligatorio" : "",
      family: !famId ? "Elegí una familia" : "",
      // Si la familia tiene subcategorías, hay que decidir: una de ellas o
      // "Sin subcategoría" a propósito. Dejarlo vacío es lo que vació el
      // segundo nivel del catálogo público.
      type: famId && typesOf(famId).length && !typeId
        ? "Elegí una subcategoría (o marcá “Sin subcategoría”)"
        : "",
      price: !price ? "El precio es obligatorio" : (isNaN(+price) || +price <= 0) ? "Precio inválido" : "",
      old_price: old && (isNaN(+old) || +old <= +price) ? "Debe ser mayor al precio actual" : "",
    };
  }
  function validate() {
    const errs = errors();
    ["name", "family", "type", "price", "old_price"].forEach((k) => {
      const slot = overlay.querySelector(`[data-err="${k}"]`);
      const input = overlay.querySelector(`[data-f="${k}"]`);
      if (slot) slot.innerHTML = errs[k] ? `${ico("x")}${esc(errs[k])}` : "";
      if (input) input.classList.toggle(input.tagName === "SELECT" ? "ad-select--invalid" : "ad-input--invalid", !!errs[k]);
    });
    // punto rojo en el índice de las secciones con errores
    const SEC_OF = { name: "esencial", family: "esencial", type: "esencial", price: "precio", old_price: "precio" };
    const secWithError = {};
    Object.keys(errs).forEach((k) => { if (errs[k]) secWithError[SEC_OF[k]] = true; });
    railItems.forEach((b) => b.classList.toggle("has-error", !!secWithError[b.getAttribute("data-go-sec")]));
    return Object.values(errs).every((v) => !v);
  }

  // save
  async function doSave() {
    touched = true;
    if (!validate()) {
      const firstErr = railItems.find((b) => b.classList.contains("has-error"));
      if (firstErr) firstErr.click();
      toast({ tone: "err", msg: "Revisá los campos marcados" });
      return;
    }
    // aviso de duplicado al crear (mismo nombre + marca)
    if (isNew) {
      const n = fEl("name").value.trim().toLowerCase();
      const b = fEl("brand").value.trim().toLowerCase();
      const dup = state.products.find((p) => (p.name || "").toLowerCase() === n && (p.brand || "").toLowerCase() === b);
      if (dup && !(await confirmModal({ title: "Producto duplicado", body: `Ya existe “${dup.name}”${dup.brand ? " de " + dup.brand : ""}. ¿Crear de todos modos?`, confirmLabel: "Crear igual" }))) return;
    }
    const saveBtn = get("[data-save]");
    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando…";
    const noFlavor = noFlavorSwitch.checked;
    try {
      await saveProduct({
        isNew, data, famId, typeId, draftImageFile,
        values: {
          name: fEl("name").value.trim(),
          brand: fEl("brand").value.trim(),
          presentation: fEl("presentation").value.trim(),
          price: fEl("price").value.trim(),
          old_price: fEl("old_price").value.trim(),
          description_short: fEl("description_short").value.trim(),
          description_long: fEl("description_long").value.trim(),
          beneficios: textToLines(fEl("beneficios").value),
          uso: textToLines(fEl("uso").value),
          home_order: (overlay.querySelector('[data-f="home_order"]') || {}).value || "",
          available: overlay.querySelector('[data-sw="available"]').checked,
          featured: overlay.querySelector('[data-sw="featured"]').checked,
          home: overlay.querySelector('[data-sw="home"]').checked,
          flavors: noFlavor ? [] : flavorRows.map((f) => ({ name: f.name, available: f.available })),
          flavor_mode: noFlavor ? "no_flavor" : (flavorRows.length ? "has_flavors" : "needs_review"),
          tags: tagNames,
          goals: Array.from(goalSet),
        },
        originalFlavors: product ? (product.flavors || []) : [],
      });
      dirty = false;
      close();
    } catch (e) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = `${ico("save")}${isNew ? "Crear producto" : "Guardar cambios"}`;
      if (window.javyIcons) window.javyIcons.enhance(saveBtn);
      if (e.code === "CONFLICT") {
        const force = await confirmModal({ title: "Otro admin editó esto", body: "Otro administrador modificó este producto mientras lo editabas. ¿Querés sobrescribir sus cambios con los tuyos?", confirmLabel: "Sobrescribir", danger: true });
        if (force) { data.updated_at = null; doSave(); }
      } else {
        toast({ tone: "err", msg: "No se pudo guardar", sub: e.message });
      }
    }
  }
  get("[data-save]").addEventListener("click", () => doSave());

  // focus first input
  setTimeout(() => { const f = fEl("name"); if (f) f.focus(); }, 30);
}

async function saveProduct(ctx) {
  const { isNew, data, famId, typeId, draftImageFile, values, originalFlavors } = ctx;
  const db = window.catalogDb;

  // imagen
  let imageUrl = data.image || "";
  let uploadedUrl = null;
  if (draftImageFile.file) {
    uploadedUrl = await db.uploadProductImage(draftImageFile.file);
    imageUrl = uploadedUrl;
  } else if (draftImageFile.cleared) {
    imageUrl = PLACEHOLDER;
  }

  // categoría: el tipo (hoja) si se eligió uno; "none" es la decisión explícita
  // de dejarlo en la familia.
  const leafId = (typeId && typeId !== "none" ? typeId : famId) || null;
  const leafCat = leafId ? catById(leafId) : null;

  const payload = {
    name: values.name,
    brand: values.brand,
    category: leafCat ? leafCat.name : (data.category || ""),
    category_id: leafId,
    price: values.price,
    old_price: values.old_price === "" ? null : values.old_price,
    presentation: values.presentation,
    image_url: imageUrl,
    description_short: values.description_short,
    description_long: values.description_long,
    beneficios: values.beneficios,
    uso: values.uso,
    flavor_mode: values.flavor_mode,
    available: values.available,
    is_available: values.available,
    featured: values.featured,
    is_featured: values.featured,
    show_on_home: values.home,
    home_order: values.home ? (values.home_order || null) : null,
    tags: values.tags,
    goals: values.goals,
  };

  let saved;
  try {
    if (isNew) {
      saved = await db.createProduct(payload);
    } else {
      saved = await db.updateProduct(data.id, payload, { expectedUpdatedAt: data.updated_at || undefined });
    }
  } catch (e) {
    if (uploadedUrl) await db.removeProductImage(uploadedUrl); // limpiar huérfana
    throw e;
  }

  // sincronizar sabores por nombre
  await syncFlavorsOnSave(saved.id, originalFlavors, values.flavors);

  await reloadProducts();
  toast({ tone: "ok", msg: isNew ? "Producto creado" : "Cambios guardados", sub: values.name });
  // re-render de la sección activa (equivale al if/else del monolito original)
  requestRerender();
}

async function syncFlavorsOnSave(productId, originalFlavors, desiredFlavors) {
  const db = window.catalogDb;
  const norm = (s) => String(s || "").trim().toLowerCase();

  // de-duplicar deseados por nombre, conservando disponibilidad
  const seen = new Set();
  const desired = [];
  for (const f of desiredFlavors || []) {
    const name = String(f.name || "").trim();
    if (!name || seen.has(norm(name))) continue;
    seen.add(norm(name));
    desired.push({ name, available: f.available !== false });
  }
  const desiredLower = desired.map((f) => norm(f.name));
  const origByName = new Map(originalFlavors.map((f) => [norm(f.name), f]));

  // borrar los quitados
  for (const f of originalFlavors) {
    if (f.id && !desiredLower.includes(norm(f.name))) {
      try { await db.deleteFlavor(f.id); } catch (_) {}
    }
  }
  // crear nuevos / actualizar disponibilidad de los que siguen
  for (const f of desired) {
    const existing = origByName.get(norm(f.name));
    if (!existing) {
      try { await db.createFlavor(productId, { name: f.name, available: f.available }); } catch (_) {}
    } else if (existing.id && (existing.available !== false) !== f.available) {
      try { await db.setFlavorAvailability(existing.id, f.available); } catch (_) {}
    }
  }
}
