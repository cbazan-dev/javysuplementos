/* ============================================================================
   JAVY / P-BOOM ADMIN — entry point (ES module).
   Valida sesión de admin, carga el catálogo y monta el shell.
   El controlador está dividido en módulos bajo js/admin/:
   config · state · helpers · ui · view · data · shell · sections/* · drawers/*
   ============================================================================ */
import { state } from "./state.js?v=adm-b0d853ee";
import { $, withTimeout } from "./helpers.js?v=adm-b0d853ee";
import { setGate, setGateError } from "./ui.js?v=adm-b0d853ee";
import { showViewError } from "./view.js?v=adm-b0d853ee";
import { loadAll } from "./data.js?v=adm-b0d853ee";
import { buildChrome, go } from "./shell.js?v=adm-b0d853ee";
import { startIdleGuard } from "./session.js?v=adm-b0d853ee";

// Le avisa al watchdog de boot-guard.js que el grafo de módulos evaluó bien;
// de acá en más los errores los muestra boot() en el gate.
window.__adminBooted = true;

async function boot() {
  if (!window.javyAuth || !window.javyAuth.hasSupabase()) {
    setGate("Supabase no está disponible. Revisa la conexión y recarga.");
    return;
  }
  try {
    const { session, profile } = await withTimeout(
      window.javyAuth.requireAdminSession(), 15000, "La validación de sesión"
    );
    if (!session || !profile) {
      window.location.href = "login.html";
      return;
    }
    state.userId = session.user.id;
    state.userEmail = session.user.email || null;
    setGate("Cargando catálogo…");
    // loadAll casi nunca rechaza (cada fuente trae su .catch), pero sí puede
    // colgarse si un fetch queda pendiente; el timeout es la única defensa.
    await withTimeout(loadAll(), 20000, "La carga del catálogo");
    buildChrome();
    $("#adminGate").hidden = true;
    $("#adminShell").hidden = false;
    go("dashboard");

    // Guardias de sesión: redirige si la sesión muere (logout en otra pestaña,
    // token revocado) y cierra por inactividad con aviso de cuenta regresiva.
    window.javyAuth.watchSession(() => { window.location.href = "login.html"; });
    startIdleGuard({ onLogout: async () => {
      try { await window.supabaseClient.auth.signOut(); } catch (_) {}
      window.location.href = "login.html?expired=idle";
    } });
  } catch (error) {
    console.error(error);
    // El gate puede estar oculto si ya mostramos el shell; mostrar el error
    // donde se vea (la vista) además del gate.
    setGateError("No se pudo validar el acceso.", error.message || String(error));
    if (!$("#adminShell").hidden) showViewError(error, "el panel");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
