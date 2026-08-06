/* ============================================================================
   Sección Accesos: administradores con acceso al panel (activar/desactivar).
   ============================================================================ */
import { state } from "../state.js?v=adm-b0d853ee";
import { $, $$, esc } from "../helpers.js?v=adm-b0d853ee";
import { setView } from "../view.js?v=adm-b0d853ee";
import { switchMarkup, toast } from "../ui.js?v=adm-b0d853ee";

export function renderAccess() {
  const initials = (s) => (s || "?").split(/[@.\s]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
  const rows = state.admins.map((a) => {
    const isSelf = a.user_id === state.userId;
    const label = a.email || "(sin email)";
    return `
    <div class="ad-row" style="${a.is_active ? "" : "opacity:.6"}">
      <span class="ad-row__avatar">${esc(initials(a.email))}</span>
      <div class="ad-row__main">
        <strong>${esc(label)}${isSelf ? ` <span class="ad-pill ad-pill--home" style="margin-left:6px">Tú</span>` : ""}</strong>
        <small>${esc(a.role || "admin")} · ${a.is_active ? "activo" : "inactivo"}</small>
      </div>
      <div class="ad-row__actions">
        ${isSelf ? `<span class="ad-pill ad-pill--ok">Acceso total</span>` : switchMarkup(a.is_active, "data-admin-toggle='" + esc(a.id) + "'")}
      </div>
    </div>`;
  }).join("");

  setView(`
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Equipo</p><p>Administradores con acceso al panel. Desactivá un acceso sin borrarlo. Crear un admin nuevo se hace en Supabase (Auth + admin_profiles).</p></div>
    </div>
    <div class="ad-panel">${rows || `<p class="ad-ops__empty">No hay administradores registrados.</p>`}</div>`);

  $$("[data-admin-toggle]", $("#adminView")).forEach((input) => input.addEventListener("change", () => toggleAdmin(input.getAttribute("data-admin-toggle"), input.checked)));
}

async function toggleAdmin(id, active) {
  try {
    const updated = await window.catalogDb.setAdminProfileActive(id, active);
    const a = state.admins.find((x) => String(x.id) === String(id));
    if (a) Object.assign(a, updated);
    toast({ tone: "ok", msg: active ? "Acceso activado" : "Acceso desactivado", sub: updated.email || "" });
  } catch (e) { toast({ tone: "err", msg: "No se pudo actualizar", sub: e.message }); renderAccess(); }
}
