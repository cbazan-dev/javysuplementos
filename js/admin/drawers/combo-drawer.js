/* ============================================================================
   Drawer de combos: builder de filas (producto/sabor/cantidad), cálculo de
   ahorro vs. precio de lista, imagen y guardado de items.
   ============================================================================ */
import { state } from "../state.js?v=adm-b0d853ee";
import { PLACEHOLDER } from "../config.js?v=adm-b0d853ee";
import { $, esc, ico, peso, wireImageFallbacks } from "../helpers.js?v=adm-b0d853ee";
import { field, affix, switchRow, toast } from "../ui.js?v=adm-b0d853ee";
import { requestRerender } from "../shell.js?v=adm-b0d853ee";

export function openComboDrawer(combo) {
  const isNew = !combo;
  const draft = {
    id: combo ? combo.id : null,
    name: combo ? combo.name : "",
    description: combo ? combo.description : "",
    price: combo && combo.price ? String(combo.price) : "",
    old_price: combo && combo.old_price ? String(combo.old_price) : "",
    image: combo ? (combo.image_url || "") : "",
    is_active: combo ? combo.is_active !== false : true,
    show_on_home: combo ? !!combo.show_on_home : false,
    rows: combo ? combo.items.map((it) => ({ product_id: String(it.product_id), flavor_id: it.flavor_id ? String(it.flavor_id) : "", quantity: it.quantity || 1 })) : [{ product_id: "", flavor_id: "", quantity: 1 }],
  };
  const draftImageFile = { file: null, cleared: false };

  const host = $("#adminDrawerHost");
  const overlay = document.createElement("div");
  overlay.className = "ad-modal-overlay";
  host.appendChild(overlay);

  const SECS = [
    ["info", 1, "Información", "Información"],
    ["productos", 2, "Productos", "Productos del combo"],
    ["imagen", 3, "Imagen", "Imagen"],
    ["visibilidad", 4, "Visibilidad", "Visibilidad"],
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

  overlay.innerHTML = `
    <div class="ad-modal__scrim" data-close></div>
    <div class="ad-modal" role="dialog" aria-modal="true">
      <div class="ad-modal__head">
        <div><h2>${isNew ? "Nuevo combo" : "Editar combo"}</h2><p>${combo && combo.updated_by ? "Última edición por " + esc(combo.updated_by) : "Paquete a precio especial"}</p></div>
        <button class="ad-modal__close" type="button" aria-label="Cerrar" data-close>${ico("x")}</button>
      </div>
      <div class="ad-modal__main">
        <nav class="ad-modal__rail" aria-label="Secciones del formulario">${SECS.map(railItem).join("")}</nav>
        <div class="ad-modal__content">
          ${sec("info", `
            ${field("Nombre del combo", true, `<input class="ad-input" data-c="name" value="${esc(draft.name)}" placeholder="Ej. Pack Volumen Limpio" />`, "cname")}
            ${field("Descripción", false, `<textarea class="ad-textarea" data-c="description" placeholder="Qué incluye y para quién es ideal">${esc(draft.description)}</textarea>`)}
          `)}
          ${sec("productos", `<div data-rows></div>
            <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-add-row style="justify-self:start;margin-top:4px">${ico("plus")}Agregar producto</button>
            <div class="ad-builder-summary">
              <div>
                <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <span style="color:var(--pb-muted);font-size:.82rem">Precio de lista: <s data-list>$0</s></span>
                  <span class="ad-pill ad-pill--ok" data-save-pill style="display:none"></span>
                </div>
                <div style="width:160px;margin-top:8px">
                  ${field("Precio del combo", true, affix(`<input class="ad-input" inputmode="decimal" data-c="price" value="${esc(draft.price)}" placeholder="0.00" />`), "cprice")}
                </div>
              </div>
              <div class="ad-builder-summary__totals"><span class="ad-price" data-total>$0</span></div>
            </div>
          `)}
          ${sec("imagen", `<div data-image-slot></div>`)}
          ${sec("visibilidad", `
            ${switchRow("active", "Activo", "Visible en la web", draft.is_active)}
            ${switchRow("chome", "Mostrar en inicio", "Aparece en la home", draft.show_on_home)}
          `)}
        </div>
      </div>
      <div class="ad-modal__foot">
        <button class="ad-btn ad-btn--ghost" type="button" data-close>Cancelar</button>
        <button class="ad-btn ad-btn--primary" type="button" data-save>${ico("save")}${isNew ? "Crear combo" : "Guardar cambios"}</button>
      </div>
    </div>`;

  if (window.javyIcons) window.javyIcons.enhance(overlay);
  document.body.style.overflow = "hidden";

  const get = (sel) => overlay.querySelector(sel);

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
  const onScrollSpy = () => {
    const ref = content.getBoundingClientRect().top + 80;
    let current = secEls[0];
    for (const s of secEls) { if (s.getBoundingClientRect().top <= ref) current = s; }
    if (current) setActiveSec(current.getAttribute("data-sec"));
  };
  [content, get(".ad-modal__main")].forEach((sc) => sc && sc.addEventListener("scroll", onScrollSpy, { passive: true }));

  const close = () => {
    if (window.javyDropdown) window.javyDropdown.destroy(overlay);
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
    overlay.remove();
  };
  const onKey = (e) => {
    if (e.key === "Escape" && !document.querySelector(".jdd.is-open")) close();
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); get("[data-save]").click(); }
  };
  document.addEventListener("keydown", onKey);
  overlay.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", close));

  const productById = (id) => state.products.find((p) => String(p.id) === String(id));

  function renderRows() {
    const container = get("[data-rows]");
    if (window.javyDropdown) window.javyDropdown.destroy(container);
    container.style.display = "grid";
    container.style.gap = "10px";
    container.innerHTML = draft.rows.map((r, i) => {
      const p = r.product_id ? productById(r.product_id) : null;
      const flavors = p ? p.flavors : [];
      return `
      <div class="ad-builder-row" data-row="${i}">
        <img src="${esc(p ? p.image : PLACEHOLDER)}" alt="" data-fallback style="opacity:${p ? 1 : 0.3}" />
        ${field(i === 0 ? "Producto" : "", false, `<select class="ad-select" data-rf="product" aria-label="Producto ${i + 1}"><option value="">Elegir producto…</option>${state.products.map((pp) => `<option value="${esc(pp.id)}"${String(pp.id) === String(r.product_id) ? " selected" : ""}>${esc(pp.name)}</option>`).join("")}</select>`)}
        ${field(i === 0 ? "Sabor" : "", false, `<select class="ad-select" data-rf="flavor" aria-label="Sabor del producto ${i + 1}" ${p ? "" : "disabled"}><option value="">${p ? "Elegir…" : "—"}</option>${flavors.map((fl) => `<option value="${esc(fl.id)}"${String(fl.id) === String(r.flavor_id) ? " selected" : ""}>${esc(fl.name)}</option>`).join("")}</select>`)}
        ${field(i === 0 ? "Cant." : "", false, `<input class="ad-input" inputmode="numeric" data-rf="qty" value="${esc(r.quantity)}" />`)}
        <button class="ad-icon-btn ad-icon-btn--danger" type="button" title="Quitar" data-rf="del" ${draft.rows.length === 1 ? "disabled" : ""}>${ico("trash")}</button>
      </div>`;
    }).join("");
    wireImageFallbacks(container);
    if (window.javyIcons) window.javyIcons.enhance(container);
    if (window.javyDropdown) window.javyDropdown.enhanceSelects(container);

    container.querySelectorAll("[data-row]").forEach((row) => {
      const i = Number(row.getAttribute("data-row"));
      row.querySelector('[data-rf="product"]').addEventListener("change", (e) => {
        draft.rows[i].product_id = e.target.value; draft.rows[i].flavor_id = ""; renderRows(); updateSummary();
        window.requestAnimationFrame(() => {
          get(`[data-row="${i}"] [data-rf="flavor"]`)?._jdd?._btn?.focus({ preventScroll: true });
        });
      });
      const flavorSel = row.querySelector('[data-rf="flavor"]');
      if (flavorSel) flavorSel.addEventListener("change", (e) => { draft.rows[i].flavor_id = e.target.value; });
      row.querySelector('[data-rf="qty"]').addEventListener("input", (e) => { draft.rows[i].quantity = Math.max(1, parseInt(e.target.value, 10) || 1); updateSummary(); });
      const del = row.querySelector('[data-rf="del"]');
      del.addEventListener("click", () => { draft.rows.splice(i, 1); renderRows(); updateSummary(); });
    });
  }

  function listPrice() {
    return draft.rows.reduce((s, r) => { const p = productById(r.product_id); return s + (p ? Number(p.price || 0) : 0) * (r.quantity || 1); }, 0);
  }
  function updateSummary() {
    const lp = listPrice();
    const price = Number(get('[data-c="price"]').value) || 0;
    const save = draft.rows.filter((r) => r.product_id).length >= 2 ? Math.max(0, lp - price) : 0;
    get("[data-list]").textContent = peso(lp);
    get("[data-total]").textContent = peso(price);
    const pill = get("[data-save-pill]");
    if (save > 0) { pill.style.display = "inline-flex"; pill.textContent = `Ahorro ${peso(save)}`; }
    else { pill.style.display = "none"; }
  }

  get("[data-add-row]").addEventListener("click", () => { draft.rows.push({ product_id: "", flavor_id: "", quantity: 1 }); renderRows(); updateSummary(); });
  get('[data-c="price"]').addEventListener("input", updateSummary);
  renderRows();
  updateSummary();

  // image
  const imageSlot = get("[data-image-slot]");
  function renderImage() {
    const showSrc = draftImageFile.file ? URL.createObjectURL(draftImageFile.file) : (draftImageFile.cleared ? "" : draft.image);
    imageSlot.innerHTML = showSrc
      ? `<div class="ad-drop ad-drop--filled"><div class="ad-drop__preview"><img src="${esc(showSrc)}" alt="" /><button type="button" class="ad-btn ad-btn--ghost ad-btn--sm ad-drop__change" data-img-change>${ico("upload")}Cambiar</button></div></div><input type="file" accept="image/*" data-img-input hidden />`
      : `<label class="ad-drop">${ico("upload")}<strong>Subir imagen del combo</strong><small>PNG o WebP · tocá para elegir</small><input type="file" accept="image/*" data-img-input hidden /></label>`;
    if (window.javyIcons) window.javyIcons.enhance(imageSlot);
    const input = imageSlot.querySelector("[data-img-input]");
    input.addEventListener("change", (e) => { const f = e.target.files[0]; if (f) { draftImageFile.file = f; draftImageFile.cleared = false; renderImage(); } });
    const ch = imageSlot.querySelector("[data-img-change]");
    if (ch) ch.addEventListener("click", () => input.click());
  }
  renderImage();

  get("[data-save]").addEventListener("click", async () => {
    const name = get('[data-c="name"]').value.trim();
    const price = Number(get('[data-c="price"]').value);
    const validRows = draft.rows.filter((r) => r.product_id);
    const lp = listPrice();
    if (!name) { toast({ tone: "err", msg: "El nombre es obligatorio" }); return; }
    if (validRows.length < 2) { toast({ tone: "err", msg: "Agregá al menos 2 productos" }); return; }
    if (!(price > 0)) { toast({ tone: "err", msg: "Poné un precio válido" }); return; }
    if (price >= lp) { toast({ tone: "err", msg: "El precio del combo debe ser menor al de lista" }); return; }

    const saveBtn = get("[data-save]");
    saveBtn.disabled = true; saveBtn.textContent = "Guardando…";
    try {
      let imageUrl = draft.image || "";
      let uploaded = null;
      if (draftImageFile.file) { uploaded = await window.catalogDb.uploadProductImage(draftImageFile.file); imageUrl = uploaded; }
      const payload = {
        name,
        description: get('[data-c="description"]').value.trim(),
        price: get('[data-c="price"]').value.trim(),
        old_price: get('[data-c="old_price"]') ? get('[data-c="old_price"]').value.trim() : draft.old_price,
        image_url: imageUrl,
        is_active: overlay.querySelector('[data-sw="active"]').checked,
        show_on_home: overlay.querySelector('[data-sw="chome"]').checked,
      };
      let savedCombo;
      try {
        savedCombo = isNew ? await window.catalogDb.createCombo(payload) : await window.catalogDb.updateCombo(draft.id, payload);
      } catch (e) { if (uploaded) await window.catalogDb.removeProductImage(uploaded); throw e; }

      await window.catalogDb.saveComboItems(savedCombo.id, validRows.map((r) => ({ product_id: r.product_id, flavor_id: r.flavor_id || null, quantity: r.quantity || 1 })));
      state.combos = await window.catalogDb.getCombos({ audit: true }).catch(() => state.combos);
      toast({ tone: "ok", msg: isNew ? "Combo creado" : "Combo actualizado", sub: name });
      close();
      requestRerender();
    } catch (e) {
      saveBtn.disabled = false; saveBtn.innerHTML = `${ico("save")}${isNew ? "Crear combo" : "Guardar cambios"}`;
      if (window.javyIcons) window.javyIcons.enhance(saveBtn);
      toast({ tone: "err", msg: "No se pudo guardar el combo", sub: e.message });
    }
  });

  setTimeout(() => { const f = get('[data-c="name"]'); if (f) f.focus(); }, 30);
}
