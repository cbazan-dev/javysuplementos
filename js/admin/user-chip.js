/* ============================================================================
   Chip del usuario conectado (esquina superior derecha).

   Muestra quién entró y con qué rol —antes el panel siempre decía "Javy Admin"
   sin importar la cuenta— y abre el menú con "Cambiar mi contraseña" y
   "Cerrar sesión".
   ============================================================================ */
import { state } from "./state.js?v=adm-90d40885";
import { $, esc, ico, initials } from "./helpers.js?v=adm-90d40885";
import { formModal, toast } from "./ui.js?v=adm-90d40885";
import { roleLabel, canWrite } from "./permissions.js?v=adm-90d40885";

const MIN_PASSWORD = 8;

export function renderUserChip() {
  const host = $("#adminUser");
  if (!host) return;

  host.innerHTML = `
    <div class="ad-user">
      <button class="ad-user__btn" type="button" data-user-menu aria-haspopup="true" aria-expanded="false">
        <span class="ad-user__avatar">${esc(initials(state.userName || state.userEmail))}</span>
        <span class="ad-user__id">
          <strong>${esc(state.userName || "Usuario")}</strong>
          <small>${esc(roleLabel(state.role))}</small>
        </span>
        ${ico("arrow-down")}
      </button>
      <div class="ad-user__menu" hidden>
        <p class="ad-user__email">${esc(state.userEmail || "")}</p>
        <button class="ad-user__item" type="button" data-change-password>${ico("key")}Cambiar mi contraseña</button>
        <button class="ad-user__item ad-user__item--danger" type="button" data-logout>${ico("log-out")}Cerrar sesión</button>
      </div>
    </div>`;

  if (window.javyIcons) window.javyIcons.enhance(host);

  const btn = $("[data-user-menu]", host);
  const menu = $(".ad-user__menu", host);
  const user = $(".ad-user", host);
  const setOpen = (open) => {
    menu.hidden = !open;
    user.classList.toggle("is-open", open);
    btn.setAttribute("aria-expanded", String(open));
  };

  btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(menu.hidden); });
  $("[data-change-password]", host).addEventListener("click", () => { setOpen(false); openChangeOwnPassword(); });
  // El listener de [data-logout] ya vive en shell.js; acá solo se cierra el menú.
  document.addEventListener("click", (e) => { if (!host.contains(e.target)) setOpen(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

  // Aviso permanente para el rol Lector: si no, parece que el panel está roto
  // porque no aparece ningún botón de acción.
  if (!canWrite()) {
    host.insertAdjacentHTML("beforebegin",
      `<span class="ad-readonly-badge">${ico("eye")}Solo lectura</span>`);
    if (window.javyIcons) window.javyIcons.enhance(host.parentElement);
  }
}

/* Cambiar la propia contraseña. No pasa por la Edge Function: Supabase permite
   que cada quien cambie la suya con su propia sesión. Se pide la actual y se
   verifica de verdad (un signInWithPassword contra la misma cuenta) para que
   una sesión abierta y olvidada en un dispositivo ajeno no alcance. */
export function openChangeOwnPassword() {
  formModal({
    title: "Cambiar mi contraseña",
    intro: "Vas a necesitar la contraseña actual.",
    confirmLabel: "Cambiar contraseña",
    fields: [
      { key: "actual", label: "Contraseña actual", type: "password", required: true, autocomplete: "current-password" },
      { key: "nueva", label: "Contraseña nueva", type: "password", required: true, autocomplete: "new-password",
        help: `Mínimo ${MIN_PASSWORD} caracteres.` },
      { key: "repetir", label: "Repetir la nueva", type: "password", required: true, autocomplete: "new-password" },
    ],
    onSubmit: async ({ actual, nueva, repetir }) => {
      if (nueva.length < MIN_PASSWORD) throw new Error(`La contraseña nueva necesita al menos ${MIN_PASSWORD} caracteres.`);
      if (nueva !== repetir) throw new Error("Las dos contraseñas nuevas no coinciden.");
      if (nueva === actual) throw new Error("La contraseña nueva tiene que ser distinta de la actual.");
      if (!state.userEmail) throw new Error("No se pudo identificar tu cuenta. Vuelve a iniciar sesión.");

      const { error: authError } = await window.supabaseClient.auth.signInWithPassword({
        email: state.userEmail,
        password: actual,
      });
      if (authError) {
        if (/captcha/i.test(authError.message || "")) {
          throw new Error("Supabase está pidiendo captcha. Cierra sesión y vuelve a entrar antes de cambiarla.");
        }
        throw new Error("La contraseña actual no es correcta.");
      }

      const { error } = await window.supabaseClient.auth.updateUser({ password: nueva });
      if (error) throw new Error(error.message || "No se pudo cambiar la contraseña.");
    },
  }).then((done) => {
    if (done) toast({ tone: "ok", msg: "Contraseña actualizada", sub: "Úsala la próxima vez que entres" });
  });
}
