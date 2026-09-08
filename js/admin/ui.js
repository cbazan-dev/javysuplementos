/* ============================================================================
   AdminUI — capa de componentes reutilizables del panel:
   toasts, modales (confirm/prompt), gate, markup de formulario y chips-input.
   Solo depende de helpers (esc, ico, DOM).
   ============================================================================ */
import { $, $$, esc, ico } from "./helpers.js?v=adm-e87897bb";

/* ----------------------------- toasts ----------------------------- */
export function toast({ tone = "ok", msg = "", sub = "" }) {
  const host = $("#adminToastHost");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "ad-toast ad-toast--" + tone;
  const iconName = tone === "err" ? "x" : tone === "info" ? "package" : "save";
  el.innerHTML = `
    <span class="ad-toast__icon">${ico(iconName)}</span>
    <span class="ad-toast__msg">${esc(msg)}${sub ? `<small>${esc(sub)}</small>` : ""}</span>
    <button class="ad-toast__x" type="button" aria-label="Cerrar">${ico("x")}</button>`;
  const remove = () => { el.remove(); };
  el.querySelector(".ad-toast__x").addEventListener("click", remove);
  host.appendChild(el);
  setTimeout(remove, 3600);
}

/* --------------------------- progreso de tarea larga --------------------------- */
/* Overlay con anillo de progreso alrededor del logo. Nace para el PDF de los
   informes: armarlo baja e incrusta una imagen por producto, así que en un
   catálogo grande y con datos móviles pasan varios segundos. Sin señal, el
   botón parecía muerto y el dueño lo tocaba de nuevo.

   El progreso es real (imágenes descargadas y páginas armadas), no una barra
   decorativa: si se queda parado en 40% es porque una imagen está tardando. */
export function progressOverlay({ title = "Generando…", hint = "" } = {}) {
  const host = $("#adminConfirmHost") || document.body;
  const overlay = document.createElement("div");
  overlay.className = "ad-progress-overlay";
  overlay.innerHTML = `
    <div class="ad-progress" role="status" aria-live="polite">
      <div class="ad-progress__ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle class="ad-progress__track" cx="60" cy="60" r="52" />
          <circle class="ad-progress__bar" cx="60" cy="60" r="52" />
        </svg>
        <svg class="ad-progress__spin" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="52" />
        </svg>
        <img class="ad-progress__logo" src="img/icons/logo.png" alt="" />
        <svg class="ad-progress__check" viewBox="0 0 120 120" aria-hidden="true">
          <path d="M38 62 L54 78 L84 44" />
        </svg>
        <span class="ad-progress__pct" data-pct>0%</span>
      </div>
      <h3>${esc(title)}</h3>
      <p class="ad-progress__hint" data-hint>${esc(hint)}</p>
    </div>`;
  host.appendChild(overlay);

  // 52 de radio → 2πr. El anillo se dibuja con dashoffset, que anima suave.
  const LARGO = 2 * Math.PI * 52;
  const bar = overlay.querySelector(".ad-progress__bar");
  const pct = overlay.querySelector("[data-pct]");
  const hintEl = overlay.querySelector("[data-hint]");
  bar.style.strokeDasharray = String(LARGO);
  bar.style.strokeDashoffset = String(LARGO);

  let visto = 0;
  return {
    // El progreso nunca retrocede: una etapa que reporta menos que la anterior
    // (imágenes en caché, por ejemplo) haría saltar el anillo hacia atrás.
    update(fraction, label = "") {
      visto = Math.max(visto, Math.min(1, Math.max(0, Number(fraction) || 0)));
      bar.style.strokeDashoffset = String(LARGO * (1 - visto));
      pct.textContent = `${Math.round(visto * 100)}%`;
      if (label) hintEl.textContent = label;
    },
    done(label = "¡Listo!") {
      this.update(1);
      overlay.classList.add("is-done");
      hintEl.textContent = label;
    },
    // Cierre diferido y sin await: el compartir nativo del celular tiene que
    // salir en el mismo gesto, no después de una animación.
    close(delay = 0) {
      setTimeout(() => {
        overlay.classList.add("is-out");
        setTimeout(() => overlay.remove(), 220);
      }, delay);
    },
  };
}

/* --------------------------- confirm / prompt --------------------------- */
export function confirmModal({ title, body, confirmLabel = "Confirmar", danger = false }) {
  return new Promise((resolve) => {
    const host = $("#adminConfirmHost");
    const overlay = document.createElement("div");
    overlay.className = "ad-confirm-overlay";
    overlay.innerHTML = `
      <div class="ad-confirm" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${body ? `<p>${esc(body)}</p>` : ""}
        <div class="ad-confirm__actions">
          <button class="ad-btn ad-btn--ghost" data-cancel type="button">Cancelar</button>
          <button class="ad-btn ${danger ? "ad-btn--danger" : "ad-btn--primary"}" data-ok type="button">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const close = (val) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(val); };
    const onKey = (e) => { if (e.key === "Escape") close(false); };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(false); });
    overlay.querySelector("[data-cancel]").addEventListener("click", () => close(false));
    overlay.querySelector("[data-ok]").addEventListener("click", () => close(true));
    document.addEventListener("keydown", onKey);
    host.appendChild(overlay);
    overlay.querySelector("[data-ok]").focus();
  });
}

export function promptModal({ title, label = "", value = "", confirmLabel = "Guardar" }) {
  return new Promise((resolve) => {
    const host = $("#adminConfirmHost");
    const overlay = document.createElement("div");
    overlay.className = "ad-confirm-overlay";
    overlay.innerHTML = `
      <div class="ad-confirm" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        <div class="ad-field">
          ${label ? `<label class="ad-field__label">${esc(label)}</label>` : ""}
          <input class="ad-input" data-input value="${esc(value)}" />
        </div>
        <div class="ad-confirm__actions">
          <button class="ad-btn ad-btn--ghost" data-cancel type="button">Cancelar</button>
          <button class="ad-btn ad-btn--primary" data-ok type="button">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const input = overlay.querySelector("[data-input]");
    const close = (val) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(val); };
    const submit = () => { const v = input.value.trim(); close(v || null); };
    const onKey = (e) => {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    };
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    overlay.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    overlay.querySelector("[data-ok]").addEventListener("click", submit);
    document.addEventListener("keydown", onKey);
    host.appendChild(overlay);
    input.focus();
    input.select();
  });
}

/* Modal de formulario: la versión multi-campo de promptModal(). La usan Accesos
   (crear usuario, cambiar rol, resetear contraseña) y el cambio de contraseña
   propia del chip de usuario.

   fields: [{ key, label, type = "text" | "password" | "email" | "select",
              value, options: [{value,label,hint}], help, required, placeholder }]

   Si se pasa onSubmit, se ejecuta con los valores ANTES de cerrar: si lanza,
   el error se muestra dentro del modal y el usuario no pierde lo que escribió.
   Resuelve con el objeto de valores, o null si se canceló. */
export function formModal({ title, intro = "", fields = [], confirmLabel = "Guardar", danger = false, onSubmit = null }) {
  return new Promise((resolve) => {
    const host = $("#adminConfirmHost");
    const overlay = document.createElement("div");
    overlay.className = "ad-confirm-overlay";

    const control = (f) => {
      if (f.type === "select") {
        const opts = (f.options || []).map((o) =>
          `<option value="${esc(o.value)}"${String(o.value) === String(f.value) ? " selected" : ""}>${esc(o.label)}</option>`
        ).join("");
        return `<select class="ad-select" data-key="${esc(f.key)}">${opts}</select>`;
      }
      return `<input class="ad-input" type="${esc(f.type || "text")}" data-key="${esc(f.key)}"
        value="${esc(f.value || "")}" placeholder="${esc(f.placeholder || "")}"
        autocomplete="${esc(f.autocomplete || "off")}" />`;
    };

    overlay.innerHTML = `
      <div class="ad-confirm ad-confirm--form" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${intro ? `<p>${esc(intro)}</p>` : ""}
        <div class="ad-form-modal__fields">
          ${fields.map((f) => `
            <div class="ad-field">
              ${f.label ? `<label class="ad-field__label">${esc(f.label)}${f.required ? `<span class="ad-field__req" title="Obligatorio">*</span>` : ""}</label>` : ""}
              ${control(f)}
              ${f.help ? `<span class="ad-field__help">${esc(f.help)}</span>` : ""}
            </div>`).join("")}
        </div>
        <span class="ad-field__error" data-form-error></span>
        <div class="ad-confirm__actions">
          <button class="ad-btn ad-btn--ghost" data-cancel type="button">Cancelar</button>
          <button class="ad-btn ${danger ? "ad-btn--danger" : "ad-btn--primary"}" data-ok type="button">${esc(confirmLabel)}</button>
        </div>
      </div>`;

    const okBtn = overlay.querySelector("[data-ok]");
    const errBox = overlay.querySelector("[data-form-error]");
    const inputs = $$("[data-key]", overlay);

    const close = (val) => { overlay.remove(); document.removeEventListener("keydown", onKey); resolve(val); };
    const values = () => Object.fromEntries(inputs.map((i) => [i.getAttribute("data-key"), i.value.trim()]));
    const setError = (msg) => {
      errBox.textContent = msg || "";
      overlay.querySelector(".ad-confirm").classList.toggle("has-error", Boolean(msg));
    };

    const submit = async () => {
      setError("");
      const data = values();
      const faltante = fields.find((f) => f.required && !data[f.key]);
      if (faltante) {
        setError(`Falta completar: ${faltante.label}.`);
        overlay.querySelector(`[data-key="${faltante.key}"]`)?.focus();
        return;
      }
      if (!onSubmit) { close(data); return; }

      okBtn.disabled = true;
      okBtn.classList.add("is-loading");
      try {
        await onSubmit(data);
        close(data);
      } catch (e) {
        setError(e?.message || "No se pudo completar la operación.");
        okBtn.disabled = false;
        okBtn.classList.remove("is-loading");
      }
    };

    const onKey = (e) => {
      if (e.key === "Escape") close(null);
      if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); submit(); }
    };

    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(null); });
    overlay.querySelector("[data-cancel]").addEventListener("click", () => close(null));
    okBtn.addEventListener("click", submit);
    document.addEventListener("keydown", onKey);
    host.appendChild(overlay);
    inputs[0]?.focus();
  });
}

/* ----------------------------- menús "⋯" ----------------------------- */
/* Menú contextual de una fila (.ad-menu > [data-menu-toggle] + .ad-menu__panel).
   Los listeners se delegan en document y se cablean una sola vez, así sirven
   para el markup que cada sección vuelve a pintar en cada render. */
export function closeAllMenus() {
  document.querySelectorAll(".ad-menu.is-open").forEach((m) => {
    m.classList.remove("is-open");
    m.querySelector("[data-menu-toggle]")?.setAttribute("aria-expanded", "false");
    const panel = m.querySelector(".ad-menu__panel");
    if (panel) panel.hidden = true;
  });
}

let menusWired = false;
export function ensureMenuListeners() {
  if (menusWired) return;
  menusWired = true;
  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-menu-toggle]");
    if (toggle) {
      const menu = toggle.closest(".ad-menu");
      const willOpen = !menu.classList.contains("is-open");
      closeAllMenus();
      if (willOpen) {
        menu.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
        menu.querySelector(".ad-menu__panel").hidden = false;
      }
      return;
    }
    // clic fuera del panel cierra (un clic en un ítem lo maneja su propia acción)
    if (!e.target.closest(".ad-menu__panel")) closeAllMenus();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllMenus(); });
}

/* ----------------------------- gate ----------------------------- */
export function setGate(msg) {
  const el = $("#adminGateMessage");
  if (el) el.textContent = msg;
}

// Estado de error del gate: mensaje + detalle técnico + botón Reintentar
// (el listener del botón lo pone boot-guard.js). Solo textContent: el detalle
// puede traer texto arbitrario de un Error.
export function setGateError(message, detail = "") {
  setGate(message);
  const box = $("#adminGateError");
  const det = $("#adminGateErrorDetail");
  const loader = document.querySelector(".ad-gate__loader");
  if (det) det.textContent = detail;
  if (loader) loader.hidden = true;
  if (box) box.hidden = false;
}

/* ----------------------------- estados vacíos ----------------------------- */
export function emptyFeature(title, body) {
  return `<div class="ad-panel"><div class="ad-empty"><span class="ad-empty__icon">${ico("package")}</span><h3>${esc(title)}</h3><p>${esc(body)}</p></div></div>`;
}

/* ----------------------------- switches ----------------------------- */
export function switchMarkup(checked, attrs = "") {
  return `<label class="ad-switch"><input type="checkbox" ${checked ? "checked" : ""} ${attrs} /><span class="ad-switch__track"></span></label>`;
}

/* ----------------------------- markup de formulario ----------------------------- */
export function collapse(num, title, open, inner) {
  return `<div class="ad-collapse${open ? " is-open" : ""}">
    <button type="button" class="ad-collapse__head">
      <span class="ad-collapse__num">${num}</span><span class="ad-collapse__title">${esc(title)}</span>
      <span class="ad-collapse__chev">${ico("arrow-down")}</span>
    </button>
    <div class="ad-collapse__body">${inner}</div>
  </div>`;
}
export function field(label, required, control, errKey, help) {
  return `<div class="ad-field">
    ${label ? `<label class="ad-field__label">${esc(label)}${required ? `<span class="ad-field__req" title="Obligatorio">*</span>` : ""}</label>` : ""}
    ${control}
    ${errKey ? `<span class="ad-field__error" data-err="${errKey === "cname" ? "cname" : errKey}"></span>` : ""}
    ${help ? `<span class="ad-field__help">${esc(help)}</span>` : ""}
  </div>`;
}
export function affix(input) {
  return `<div class="ad-input-affix"><span class="ad-input-affix__sign">$</span>${input}</div>`;
}
export function switchRow(key, label, hint, checked) {
  return `<label class="ad-switch ad-switch--row">
    <span class="ad-switch__body"><span class="ad-switch__label">${esc(label)}</span><span class="ad-switch__hint">${esc(hint)}</span></span>
    <input type="checkbox" data-sw="${key}" ${checked ? "checked" : ""} /><span class="ad-switch__track"></span>
  </label>`;
}

/* ----------------------------- chips-input ----------------------------- */
export function chipTag(name) {
  return `<span class="ad-chip-tag">${esc(name)}<button type="button" aria-label="Quitar ${esc(name)}" data-chip-remove>${ico("x")}</button></span>`;
}

// Reusable chips input behaviour. onAdd/onRemove receive the flavor name.
export function bindChips(container, { onAdd, onRemove }) {
  if (!container) return;
  const input = container.querySelector("input");
  const addFromInput = () => {
    const v = input.value.trim();
    input.value = "";
    if (!v) return;
    const existing = $$(".ad-chip-tag", container).map((c) => c.textContent.trim().toLowerCase());
    if (existing.includes(v.toLowerCase())) return;
    const chip = document.createElement("span");
    chip.className = "ad-chip-tag";
    chip.innerHTML = `${esc(v)}<button type="button" aria-label="Quitar ${esc(v)}" data-chip-remove>${ico("x")}</button>`;
    container.insertBefore(chip, input);
    if (window.javyIcons) window.javyIcons.enhance(chip);
    if (onAdd) onAdd(v);
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addFromInput(); } });
  input.addEventListener("blur", addFromInput);
  container.addEventListener("click", (e) => {
    const rm = e.target.closest("[data-chip-remove]");
    if (!rm) return;
    const chip = rm.closest(".ad-chip-tag");
    const name = chip.textContent.trim();
    chip.remove();
    if (onRemove) onRemove(name);
  });
}
