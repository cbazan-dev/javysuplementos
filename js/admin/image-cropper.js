/* ============================================================================
   Editor de encuadre (cropper) de imágenes del panel.

   Devuelve un File WebP con la proporción pedida (1:1 por defecto), listo para
   db.uploadProductImage(). El sobrante queda TRANSPARENTE: el catálogo usa
   object-fit: contain en todos lados, así que una imagen con relleno
   transparente se ve igual que hoy y una recortada llena la card.

   Se dibuja con transform sobre un <img>, no con un canvas en vivo: el
   compositor mueve la imagen a 60fps sin repintar, y como exportamos ese mismo
   <img>, la orientación EXIF de las fotos de celular se respeta sola.
   ============================================================================ */
import { esc, ico } from "./helpers.js?v=adm-90d40885";
import { toast } from "./ui.js?v=adm-90d40885";

const RANGE = 1000;          // resolución del slider de zoom
const MAX_ZOOM_FACTOR = 4;   // cuánto se puede acercar más allá de "llenar"
const NUDGE = 10;            // px por flecha

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* Resuelve la fuente a una URL que el canvas pueda exportar sin contaminarse.
   Para las URLs de Supabase Storage bajamos el archivo con fetch (connect-src
   ya lo permite) y lo servimos como blob: same-origin. Con <img crossOrigin>
   el navegador puede reusar la entrada de caché que dejó el <img> normal del
   formulario —marcada como no-CORS— y toBlob() falla con SecurityError de
   forma intermitente. */
async function resolveSource({ file, src }) {
  if (file) return { url: URL.createObjectURL(file), revoke: true };
  if (!src) throw new Error("No hay ninguna imagen para encuadrar.");
  if (!/^https?:/i.test(src)) return { url: src, revoke: false }; // ruta local
  const res = await fetch(src, { mode: "cors", credentials: "omit" });
  if (!res.ok) throw new Error("No se pudo descargar la imagen (HTTP " + res.status + ").");
  return { url: URL.createObjectURL(await res.blob()), revoke: true };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("El navegador no pudo leer la imagen."));
    img.src = url;
  });
}

function baseNameOf(value) {
  const raw = String(value || "").split("?")[0].split("/").pop() || "";
  return raw.replace(/\.[^.]+$/, "").trim() || "producto";
}

/**
 * Abre el editor de encuadre.
 *
 * @param {File}   [o.file]           archivo recién elegido en el <input type=file>
 * @param {string} [o.src]            URL de una imagen ya subida (alternativa a file)
 * @param {number} [o.aspect=1]       ancho/alto del marco y de la salida
 * @param {number} [o.output=800]     ancho del canvas exportado, en px
 * @param {number} [o.quality=0.85]   calidad del WebP
 * @param {string} [o.fileName]       base para el nombre del File resultante
 * @param {string} [o.title]
 * @returns {Promise<File|null>}      null si se canceló o no se pudo abrir
 */
export function openImageCropper(o = {}) {
  // Nunca dejar que un fallo al construir el editor se pierda como promesa
  // rechazada: quien llama solo vería que "no pasa nada".
  try {
    return buildCropper(o);
  } catch (err) {
    toast({
      tone: "err",
      msg: "No se pudo abrir el editor de encuadre",
      sub: (err && err.message) || "Error inesperado.",
    });
    return Promise.resolve(null);
  }
}

function buildCropper(o) {
  const {
    file = null, src = "", aspect = 1, output = 800,
    quality = 0.85, fileName = "", title = "Ajustar encuadre",
  } = o;

  return new Promise((resolve) => {
    const host = document.getElementById("adminConfirmHost") || document.body;
    const overlay = document.createElement("div");
    overlay.className = "ad-cropper-overlay is-loading";
    overlay.innerHTML = `
      <div class="ad-cropper" role="dialog" aria-modal="true" aria-labelledby="adCropTitle">
        <div class="ad-cropper__head">
          <h3 id="adCropTitle">${esc(title)}</h3>
          <button class="ad-cropper__x" type="button" data-crop-cancel aria-label="Cerrar">${ico("x")}</button>
        </div>

        <div class="ad-cropper__frame" data-crop-frame tabindex="0" role="application"
             aria-label="Arrastra para mover la imagen; usa la barra de zoom para acercar">
          <img class="ad-cropper__img" data-crop-img alt="" draggable="false" />
          <div class="ad-cropper__guides" aria-hidden="true"></div>
          <p class="ad-cropper__loading" data-crop-loading>Cargando imagen…</p>
        </div>

        <p class="ad-cropper__error" data-crop-error hidden></p>

        <div class="ad-cropper__controls">
          <div class="ad-cropper__zoom">
            <span class="ad-cropper__zoom-ico" aria-hidden="true">${ico("search")}</span>
            <input class="ad-cropper__range" type="range" data-crop-zoom
                   min="0" max="${RANGE}" step="1" value="0" aria-label="Nivel de zoom" />
          </div>
          <div class="ad-cropper__presets" role="group" aria-label="Encuadres rápidos">
            <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-crop-fit>Ajustar</button>
            <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-crop-fill>Llenar</button>
            <button class="ad-btn ad-btn--ghost ad-btn--sm" type="button" data-crop-center>Centrar</button>
          </div>
        </div>

        <p class="ad-cropper__hint">Lo que quede dentro del cuadro es lo que se verá en la card y en la página del producto. Lo que sobre queda transparente.</p>

        <div class="ad-cropper__actions">
          <button class="ad-btn ad-btn--ghost" type="button" data-crop-cancel>Cancelar</button>
          <button class="ad-btn ad-btn--primary" type="button" data-crop-ok disabled>${ico("save")}Usar este encuadre</button>
        </div>
      </div>`;

    if (window.javyIcons) window.javyIcons.enhance(overlay);

    const q = (sel) => overlay.querySelector(sel);
    const frameEl = q("[data-crop-frame]");
    const imgEl = q("[data-crop-img]");
    const rangeEl = q("[data-crop-zoom]");
    const errEl = q("[data-crop-error]");
    const okBtn = q("[data-crop-ok]");
    let loadingEl = q("[data-crop-loading]");

    frameEl.style.aspectRatio = String(aspect);

    /* ------------------------------ estado ------------------------------ */
    let natW = 0, natH = 0;              // tamaño natural (ya con EXIF aplicado)
    let frameW = 0, frameH = 0;          // marco en px CSS
    let scale = 1, offsetX = 0, offsetY = 0;
    let scaleMin = 0.01, scaleMax = 1, scaleCover = 1, scaleContain = 1;
    let ready = false;
    let sourceUrl = null, revokeUrl = false;
    let ro = null;

    const apply = () => {
      imgEl.style.transform =
        "translate3d(" + offsetX + "px," + offsetY + "px,0) scale(" + scale + ")";
    };

    // En el eje donde la imagen cubre el marco se puede panear, pero nunca
    // dejar un hueco. En el eje donde no lo cubre queda centrada, igual que el
    // place-items:center de .product-card__media.
    function clampOffsets() {
      const dW = natW * scale, dH = natH * scale;
      offsetX = dW >= frameW ? clamp(offsetX, frameW - dW, 0) : (frameW - dW) / 2;
      offsetY = dH >= frameH ? clamp(offsetY, frameH - dH, 0) : (frameH - dH) / 2;
    }

    // Slider logarítmico: uno lineal deja casi todo el recorrido en zooms inútiles.
    const toRange = (s) =>
      Math.round(RANGE * Math.log(s / scaleMin) / Math.log(scaleMax / scaleMin));
    const fromRange = (t) =>
      scaleMin * Math.pow(scaleMax / scaleMin, t / RANGE);
    const syncRange = () => { rangeEl.value = String(clamp(toRange(scale), 0, RANGE)); };

    function zoomTo(next, fx, fy) {
      const target = clamp(next, scaleMin, scaleMax);
      const k = target / scale;
      offsetX = fx - (fx - offsetX) * k;
      offsetY = fy - (fy - offsetY) * k;
      scale = target;
      clampOffsets(); apply(); syncRange();
    }

    const doCenter = () => {
      offsetX = (frameW - natW * scale) / 2;
      offsetY = (frameH - natH * scale) / 2;
      clampOffsets(); apply();
    };
    const doFit = () => { scale = scaleContain; doCenter(); syncRange(); };
    const doFill = () => { scale = scaleCover; doCenter(); syncRange(); };

    // El tamaño del marco se fija acá, en píxeles, y no se delega al CSS.
    // Resolverlo con aspect-ratio + max-height (o con min(100%, 48dvh)) daba un
    // cuadro de alto cero según el navegador y el contenedor: el editor abría
    // vacío, sin error visible, y desde afuera parecía que subir la foto no
    // hacía nada. Medido acá es determinista y no depende de que la hoja de
    // estilos del panel haya llegado a aplicarse.
    let ladoActual = 0;
    function layoutFrame() {
      frameEl.style.width = "100%";
      frameEl.style.height = "auto";
      const hueco = frameEl.clientWidth || 320;                  // ancho disponible real
      const tope = Math.max(160, Math.min(window.innerHeight - 300, 420));
      const lado = Math.round(Math.max(160, Math.min(hueco, tope)));
      frameEl.style.width = lado + "px";
      frameEl.style.height = Math.round(lado / aspect) + "px";
      const cambio = lado !== ladoActual;
      ladoActual = lado;
      return cambio;
    }

    function measure(keepFraming) {
      const prevW = frameW, prevH = frameH;
      frameW = frameEl.clientWidth;
      frameH = frameEl.clientHeight;
      if (!frameW || !frameH) return;
      scaleContain = Math.min(frameW / natW, frameH / natH);
      scaleCover = Math.max(frameW / natW, frameH / natH);
      scaleMin = scaleContain;
      scaleMax = scaleCover * MAX_ZOOM_FACTOR;
      if (keepFraming && prevW && prevH) {
        // Al rotar el teléfono el marco cambia de tamaño: reescalar preserva
        // exactamente el encuadre que el admin ya eligió.
        const k = frameW / prevW;
        scale = clamp(scale * k, scaleMin, scaleMax);
        offsetX *= k;
        offsetY *= (frameH / prevH);
        clampOffsets(); apply(); syncRange();
      }
    }

    /* ------------------------------ cierre ------------------------------ */
    let closed = false;
    function close(value) {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKey, true);
      if (ro) ro.disconnect();
      if (revokeUrl && sourceUrl) URL.revokeObjectURL(sourceUrl);
      overlay.remove();
      resolve(value);
    }

    // El drawer de producto escucha keydown en document (burbujeo) para cerrar
    // con Escape y guardar con Ctrl+S. Este handler va en CAPTURA para poder
    // cortarle la propagación: si no, Escape cierra también el drawer.
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault(); e.stopPropagation(); close(null); return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault(); e.stopPropagation(); return;
      }
      if (!ready || !overlay.contains(e.target)) return;
      if (e.target === rangeEl) return; // el slider ya maneja flechas y +/-
      switch (e.key) {
        case "ArrowLeft":  offsetX -= e.shiftKey ? 1 : NUDGE; break;
        case "ArrowRight": offsetX += e.shiftKey ? 1 : NUDGE; break;
        case "ArrowUp":    offsetY -= e.shiftKey ? 1 : NUDGE; break;
        case "ArrowDown":  offsetY += e.shiftKey ? 1 : NUDGE; break;
        case "+": case "=": e.preventDefault(); zoomTo(scale * 1.08, frameW / 2, frameH / 2); return;
        case "-": case "_": e.preventDefault(); zoomTo(scale / 1.08, frameW / 2, frameH / 2); return;
        case "0": e.preventDefault(); doFill(); return;
        default: return;
      }
      e.preventDefault();
      clampOffsets(); apply();
    }
    document.addEventListener("keydown", onKey, true);

    // Ojo: no cierra al clickear el fondo. Un arrastre que termina fuera del
    // marco no debe descartar el encuadre. Tampoco toca body.style.overflow:
    // eso lo maneja el drawer que está detrás.
    overlay.querySelectorAll("[data-crop-cancel]").forEach((b) =>
      b.addEventListener("click", () => close(null)));

    /* ------------------------------ gestos ------------------------------ */
    const pts = new Map();
    let pinchDist = 0, pinchMid = null;

    const midOf = (a, b) => {
      const r = frameEl.getBoundingClientRect();
      return { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    };
    function resetPinch() {
      const [a, b] = [...pts.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid = midOf(a, b);
    }

    frameEl.addEventListener("pointerdown", (e) => {
      if (!ready) return;
      frameEl.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) resetPinch();
    });

    frameEl.addEventListener("pointermove", (e) => {
      if (!ready || !pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        offsetX += e.clientX - prev.x;
        offsetY += e.clientY - prev.y;
        clampOffsets(); apply();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = midOf(a, b);
        if (pinchMid) { offsetX += mid.x - pinchMid.x; offsetY += mid.y - pinchMid.y; }
        pinchMid = mid;
        if (pinchDist > 0) zoomTo(scale * (dist / pinchDist), mid.x, mid.y);
        else { clampOffsets(); apply(); }
        pinchDist = dist;
      }
    });

    ["pointerup", "pointercancel"].forEach((type) =>
      frameEl.addEventListener(type, (e) => {
        pts.delete(e.pointerId);
        if (pts.size < 2) { pinchDist = 0; pinchMid = null; }
        if (pts.size === 2) resetPinch();
      }));

    // passive:false o Chrome ignora el preventDefault y scrollea el modal.
    frameEl.addEventListener("wheel", (e) => {
      if (!ready) return;
      e.preventDefault();
      const r = frameEl.getBoundingClientRect();
      zoomTo(scale * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    rangeEl.addEventListener("input", () => {
      if (!ready) return;
      zoomTo(fromRange(Number(rangeEl.value)), frameW / 2, frameH / 2);
    });
    q("[data-crop-fit]").addEventListener("click", () => { if (ready) doFit(); });
    q("[data-crop-fill]").addEventListener("click", () => { if (ready) doFill(); });
    q("[data-crop-center]").addEventListener("click", () => { if (ready) doCenter(); });

    /* --------------------------- exportación ---------------------------- */
    function showError(message) {
      errEl.textContent = message;
      errEl.hidden = false;
    }

    async function exportFile() {
      const outW = Math.round(output);
      const outH = Math.round(output / aspect);
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      // Rect de DESTINO (5 argumentos). Con el de origen, en modo "Ajustar" el
      // recorte cae fuera de la imagen (sx negativo) y los motores difieren.
      // Sin fillRect: el sobrante queda transparente.
      const k = outW / frameW;
      ctx.drawImage(imgEl, offsetX * k, offsetY * k, natW * scale * k, natH * scale * k);

      const toBlob = (type, q2) =>
        new Promise((res) => { try { canvas.toBlob(res, type, q2); } catch (_) { res(null); } });

      let blob = await toBlob("image/webp", quality);
      // PNG como respaldo: sin pérdida y conserva el alfa. Nunca JPEG, que
      // convierte la transparencia en negro.
      if (!blob || blob.type !== "image/webp") blob = await toBlob("image/png");
      if (!blob) throw new Error("El navegador no pudo generar la imagen recortada.");

      const ext = blob.type === "image/png" ? "png" : "webp";
      const base = baseNameOf(fileName || (file && file.name) || src);
      return new File([blob], base + "." + ext, { type: blob.type, lastModified: Date.now() });
    }

    okBtn.addEventListener("click", async () => {
      if (!ready) return;
      okBtn.disabled = true;
      try {
        close(await exportFile());
      } catch (err) {
        okBtn.disabled = false;
        showError(err && err.message ? err.message : "No se pudo recortar la imagen.");
        toast({ tone: "err", msg: "No se pudo recortar la imagen", sub: "Prueba subiendo el archivo original." });
      }
    });

    host.appendChild(overlay);

    /* ------------------------------ arranque ---------------------------- */
    (async () => {
      try {
        const resolved = await resolveSource({ file, src });
        sourceUrl = resolved.url;
        revokeUrl = resolved.revoke;
        const img = await loadImage(sourceUrl);
        if (closed) { if (revokeUrl) URL.revokeObjectURL(sourceUrl); return; }
        natW = img.naturalWidth;
        natH = img.naturalHeight;
        if (!natW || !natH) throw new Error("La imagen no tiene un tamaño legible.");

        imgEl.src = sourceUrl;
        imgEl.style.width = natW + "px";
        imgEl.style.height = natH + "px";
        imgEl.style.transformOrigin = "0 0";

        layoutFrame();
        measure(false);
        if (!frameW || !frameH) throw new Error("No se pudo medir el área de recorte.");
        doFill();               // llenar + centrado: para una foto cuadrada es la foto entera
        ready = true;
        overlay.classList.remove("is-loading");
        loadingEl.remove();
        loadingEl = null;
        okBtn.disabled = false;
        frameEl.focus({ preventScroll: true });

        // Se observa el diálogo, no el marco: el marco lo redimensiona
        // layoutFrame(), y observarlo se realimentaría en bucle.
        if (typeof ResizeObserver === "function") {
          ro = new ResizeObserver(() => {
            if (!ready) return;
            if (layoutFrame()) measure(true);   // solo si el lado cambió de verdad
          });
          ro.observe(q(".ad-cropper"));
        }
      } catch (err) {
        const message = err && err.message ? err.message : "No se pudo abrir el editor de encuadre.";
        toast({ tone: "err", msg: "No se pudo abrir el editor de encuadre", sub: message });
        close(null);
      }
    })();
  });
}
