/* ============================================================================
   Sección Accesos: quién entra al panel y qué puede hacer.

   Crear, eliminar y resetear contraseñas pasa por la Edge Function
   `admin-users` (esas operaciones tocan auth.users y necesitan la llave
   secreta). Cambiar rol y activar/desactivar va directo a la tabla, donde RLS
   deja pasar solo a un Admin.
   ============================================================================ */
import { state } from "../state.js?v=adm-90d40885";
import { $, $$, esc, ico, initials } from "../helpers.js?v=adm-90d40885";
import { setView } from "../view.js?v=adm-90d40885";
import { switchMarkup, toast, confirmModal, formModal, ensureMenuListeners, closeAllMenus } from "../ui.js?v=adm-90d40885";
import { ROLES, roleLabel, canManageUsers } from "../permissions.js?v=adm-90d40885";

const MIN_PASSWORD = 8;

export function renderAccess() {
  const puedeGestionar = canManageUsers();

  const rows = state.admins.map((a) => {
    const esUno = a.user_id === state.userId;
    const nombre = a.display_name || a.email || "(sin nombre)";

    // Nadie se toca a sí mismo desde acá: ni se desactiva ni se elimina. Para
    // cambiar la propia contraseña está el menú del chip de usuario.
    const acciones = !puedeGestionar
      ? `<span class="ad-pill">${esc(roleLabel(a.role))}</span>`
      : esUno
        ? `<span class="ad-pill ad-pill--ok">Tu cuenta</span>`
        : `
          ${switchMarkup(a.is_active, `data-admin-toggle="${esc(a.id)}" aria-label="Acceso de ${esc(nombre)}"`)}
          <div class="ad-menu" data-menu>
            <button class="ad-icon-btn" type="button" data-menu-toggle title="Más opciones" aria-haspopup="menu" aria-expanded="false">${ico("more-horizontal")}</button>
            <div class="ad-menu__panel" role="menu" hidden>
              <button class="ad-menu__item" type="button" role="menuitem" data-user-edit="${esc(a.id)}">${ico("pencil")}Nombre y rol</button>
              <button class="ad-menu__item" type="button" role="menuitem" data-user-password="${esc(a.id)}">${ico("key")}Resetear contraseña</button>
              <button class="ad-menu__item ad-menu__item--danger" type="button" role="menuitem" data-user-delete="${esc(a.id)}">${ico("trash")}Eliminar usuario</button>
            </div>
          </div>`;

    return `
    <div class="ad-row ad-row--user${a.is_active ? "" : " is-off"}">
      <span class="ad-row__avatar">${esc(initials(nombre))}</span>
      <div class="ad-row__main">
        <strong>${esc(nombre)}${esUno ? ` <span class="ad-pill ad-pill--home">Tú</span>` : ""}</strong>
        <small>${esc(a.email || "sin correo")}</small>
      </div>
      <div class="ad-row__tags">
        <span class="ad-pill ad-pill--role ad-pill--role-${esc(a.role || "viewer")}">${esc(roleLabel(a.role))}</span>
        ${a.is_active ? "" : `<span class="ad-pill ad-pill--out">Sin acceso</span>`}
      </div>
      <div class="ad-row__actions">${acciones}</div>
    </div>`;
  }).join("");

  setView(`
    <div class="ad-section-intro">
      <div>
        <p class="ad-kicker">Equipo</p>
        <p>Quién entra al panel y qué puede hacer cada uno. Crea usuarios, asígnales un rol y quítales el acceso cuando dejen de necesitarlo.</p>
        ${puedeGestionar ? "" : `<p class="ad-section-intro__note">${ico("shield")}Solo un Admin puede crear, editar o eliminar usuarios.</p>`}
      </div>
      ${puedeGestionar ? `<button class="ad-btn ad-btn--primary" type="button" data-user-new>${ico("plus")}Nuevo usuario</button>` : ""}
    </div>

    <div class="ad-roles-legend">
      ${ROLES.map((r) => `
        <div class="ad-roles-legend__item">
          <span class="ad-pill ad-pill--role ad-pill--role-${esc(r.value)}">${esc(r.label)}</span>
          <p>${esc(r.hint)}</p>
        </div>`).join("")}
    </div>

    <div class="ad-panel">${rows || `<p class="ad-ops__empty">Todavía no hay nadie más en el equipo. Agrega el primer usuario.</p>`}</div>`);

  const view = $("#adminView");
  if (window.javyIcons) window.javyIcons.enhance(view);

  $("[data-user-new]", view)?.addEventListener("click", nuevoUsuario);
  $$("[data-admin-toggle]", view).forEach((input) =>
    input.addEventListener("change", () => toggleAdmin(input.getAttribute("data-admin-toggle"), input.checked)));
  $$("[data-user-edit]", view).forEach((b) =>
    b.addEventListener("click", () => { closeAllMenus(); editarUsuario(b.getAttribute("data-user-edit")); }));
  $$("[data-user-password]", view).forEach((b) =>
    b.addEventListener("click", () => { closeAllMenus(); resetearContrasena(b.getAttribute("data-user-password")); }));
  $$("[data-user-delete]", view).forEach((b) =>
    b.addEventListener("click", () => { closeAllMenus(); eliminarUsuario(b.getAttribute("data-user-delete")); }));

  ensureMenuListeners();
}

/* --------------------------------- acciones -------------------------------- */

const buscar = (id) => state.admins.find((x) => String(x.id) === String(id));

// Cada operación relee la lista: el estado local se queda viejo enseguida si
// hay dos admins trabajando a la vez.
async function refrescar() {
  state.admins = await window.catalogDb.getAdminProfiles();
  renderAccess();
}

const opcionesDeRol = ROLES.map((r) => ({ value: r.value, label: `${r.label} — ${r.hint}` }));

function nuevoUsuario() {
  formModal({
    title: "Nuevo usuario",
    intro: "Entra con el correo y la contraseña que le pongas acá. Puede cambiarla después desde su propio menú.",
    confirmLabel: "Crear usuario",
    fields: [
      { key: "email", label: "Correo", type: "email", required: true, placeholder: "nombre@correo.com", autocomplete: "off" },
      { key: "nombre", label: "Nombre", required: true, placeholder: "Cómo se va a ver en el panel" },
      { key: "rol", label: "Rol", type: "select", value: "viewer", options: opcionesDeRol },
      { key: "password", label: "Contraseña temporal", type: "password", required: true,
        help: `Mínimo ${MIN_PASSWORD} caracteres. Pásasela por un medio seguro.`, autocomplete: "new-password" },
    ],
    onSubmit: async ({ email, nombre, rol, password }) => {
      if (password.length < MIN_PASSWORD) throw new Error(`La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`);
      await window.catalogDb.createAdminUser({ email, password, role: rol, displayName: nombre });
    },
  }).then(async (data) => {
    if (!data) return;
    await refrescar();
    toast({ tone: "ok", msg: "Usuario creado", sub: `${data.email} · ${roleLabel(data.rol)}` });
  }).catch((e) => toast({ tone: "err", msg: "No se pudo actualizar la lista", sub: e.message }));
}

function editarUsuario(id) {
  const a = buscar(id);
  if (!a) return;

  formModal({
    title: "Nombre y rol",
    intro: a.email || "",
    confirmLabel: "Guardar",
    fields: [
      { key: "nombre", label: "Nombre", value: a.display_name || "", required: true },
      { key: "rol", label: "Rol", type: "select", value: a.role || "viewer", options: opcionesDeRol },
    ],
    onSubmit: async ({ nombre, rol }) => {
      if (nombre !== (a.display_name || "")) await window.catalogDb.updateAdminProfile(id, { displayName: nombre });
      if (rol !== a.role) await window.catalogDb.updateAdminProfile(id, { role: rol });
    },
  }).then(async (data) => {
    if (!data) return;
    await refrescar();
    toast({ tone: "ok", msg: "Usuario actualizado", sub: `${data.nombre} · ${roleLabel(data.rol)}` });
  }).catch((e) => toast({ tone: "err", msg: "No se pudo actualizar la lista", sub: e.message }));
}

function resetearContrasena(id) {
  const a = buscar(id);
  if (!a) return;

  formModal({
    title: "Resetear contraseña",
    intro: `Le pones una contraseña nueva a ${a.display_name || a.email}. La anterior deja de servir.`,
    confirmLabel: "Cambiar contraseña",
    fields: [
      { key: "password", label: "Contraseña nueva", type: "password", required: true,
        help: `Mínimo ${MIN_PASSWORD} caracteres.`, autocomplete: "new-password" },
      { key: "repetir", label: "Repetir", type: "password", required: true, autocomplete: "new-password" },
    ],
    onSubmit: async ({ password, repetir }) => {
      if (password.length < MIN_PASSWORD) throw new Error(`La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`);
      if (password !== repetir) throw new Error("Las dos contraseñas no coinciden.");
      await window.catalogDb.setAdminUserPassword(id, password);
    },
  }).then((data) => {
    if (data) toast({ tone: "ok", msg: "Contraseña cambiada", sub: a.email || "" });
  });
}

async function eliminarUsuario(id) {
  const a = buscar(id);
  if (!a) return;

  const ok = await confirmModal({
    title: `¿Eliminar a ${a.display_name || a.email}?`,
    body: "Se borra su cuenta por completo y no va a poder volver a entrar. Si solo quieres pausarlo, usa el interruptor de acceso.",
    confirmLabel: "Eliminar",
    danger: true,
  });
  if (!ok) return;

  try {
    await window.catalogDb.deleteAdminUser(id);
    await refrescar();
    toast({ tone: "ok", msg: "Usuario eliminado", sub: a.email || "" });
  } catch (e) {
    toast({ tone: "err", msg: "No se pudo eliminar", sub: e.message });
  }
}

async function toggleAdmin(id, active) {
  try {
    const updated = await window.catalogDb.setAdminProfileActive(id, active);
    const a = buscar(id);
    if (a) Object.assign(a, updated);
    toast({
      tone: "ok",
      msg: active ? "Acceso activado" : "Acceso desactivado",
      sub: updated.display_name || updated.email || "",
    });
  } catch (e) {
    toast({ tone: "err", msg: "No se pudo actualizar", sub: e.message });
    renderAccess();
  }
}
