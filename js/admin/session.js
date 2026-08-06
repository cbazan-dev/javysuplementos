/* ============================================================================
   Guardia de inactividad del panel admin.

   Tras IDLE_MS sin actividad cierra la sesión y redirige al login. Un minuto
   antes (WARN_MS) muestra un aviso "¿Sigues ahí?" con cuenta regresiva viva y un
   botón para seguir conectado.

   La marca de actividad se comparte entre pestañas vía localStorage, así que estar
   activo en cualquier pestaña del panel mantiene viva la sesión en todas.
   ============================================================================ */
import { $, esc } from "./helpers.js?v=adm-b0d853ee";

const IDLE_MS = 30 * 60 * 1000; // 30 min de inactividad → cierre de sesión
const WARN_MS = 60 * 1000;      // avisar 1 min antes del cierre
const TICK_MS = 5 * 1000;       // frecuencia de chequeo
const WRITE_THROTTLE_MS = 5 * 1000; // no escribir la marca más de una vez cada 5 s
const STORAGE_KEY = "javy:admin:lastActivity";

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"];

export function startIdleGuard({ onLogout }) {
  let lastWrite = 0;       // última vez que persistimos la marca (throttle)
  let warning = null;      // overlay del aviso, o null si está oculto
  let countdownTimer = null;
  let stopped = false;

  function now() { return Date.now(); }

  function readLastActivity() {
    const raw = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : now();
  }

  function markActivity() {
    const t = now();
    if (t - lastWrite < WRITE_THROTTLE_MS) return;
    lastWrite = t;
    try { localStorage.setItem(STORAGE_KEY, String(t)); } catch (_) {}
  }

  // Actividad pasiva: solo cuenta cuando el aviso NO está visible. Con el aviso
  // abierto, únicamente el botón "Seguir conectado" reinicia la marca.
  function onPassiveActivity() {
    if (warning) return;
    markActivity();
  }

  function continueSession() {
    lastWrite = 0;          // forzar escritura inmediata
    markActivity();
    hideWarning();
  }

  function showWarning() {
    if (warning) return;
    const host = $("#adminConfirmHost") || document.body;
    warning = document.createElement("div");
    warning.className = "ad-confirm-overlay";
    warning.innerHTML = `
      <div class="ad-confirm" role="alertdialog" aria-modal="true">
        <h3>¿Sigues ahí?</h3>
        <p>Tu sesión se cerrará por inactividad en <strong data-count>60</strong> s.</p>
        <div class="ad-confirm__actions">
          <button class="ad-btn ad-btn--primary" data-stay type="button">Seguir conectado</button>
        </div>
      </div>`;
    warning.querySelector("[data-stay]").addEventListener("click", continueSession);
    host.appendChild(warning);
    warning.querySelector("[data-stay]").focus();
    updateCountdown();
    countdownTimer = setInterval(updateCountdown, 1000);
  }

  function updateCountdown() {
    if (!warning) return;
    const remaining = Math.max(0, IDLE_MS - (now() - readLastActivity()));
    const seconds = Math.ceil(remaining / 1000);
    const el = warning.querySelector("[data-count]");
    if (el) el.textContent = esc(String(seconds));
  }

  function hideWarning() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    if (warning) { warning.remove(); warning = null; }
  }

  function logout() {
    stop();
    onLogout();
  }

  function check() {
    const elapsed = now() - readLastActivity();
    if (elapsed >= IDLE_MS) {
      logout();
    } else if (elapsed >= IDLE_MS - WARN_MS) {
      showWarning();
    } else {
      hideWarning();
    }
  }

  // Otra pestaña marcó actividad: si aquí estaba el aviso visible, ocultarlo.
  function onStorage(e) {
    if (e.key === STORAGE_KEY && warning) check();
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(tickTimer);
    hideWarning();
    ACTIVITY_EVENTS.forEach((ev) =>
      window.removeEventListener(ev, onPassiveActivity, { passive: true }));
    window.removeEventListener("storage", onStorage);
  }

  // Arranque
  markActivity();
  ACTIVITY_EVENTS.forEach((ev) =>
    window.addEventListener(ev, onPassiveActivity, { passive: true }));
  window.addEventListener("storage", onStorage);
  const tickTimer = setInterval(check, TICK_MS);

  return stop;
}
