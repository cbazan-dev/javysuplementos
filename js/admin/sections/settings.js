/* ============================================================================
   Sección Ajustes con pestañas: Estado del sistema · Historial · Informes.
   La pestaña activa vive en state.settingsTab; cambiarla re-renderiza la sección.
   ============================================================================ */
import { state, families } from "../state.js?v=adm-90d40885";
import { esc, ico } from "../helpers.js?v=adm-90d40885";
import { setView, paint } from "../view.js?v=adm-90d40885";
import { renderHistoryTab } from "./history.js?v=adm-90d40885";
import { renderReportsTab } from "./reports.js?v=adm-90d40885";

const TABS = [
  { key: "estado", label: "Estado", icon: "settings" },
  { key: "historial", label: "Historial", icon: "clock" },
  { key: "informes", label: "Informes", icon: "file-text" },
];

export function renderSettings() {
  const active = TABS.some((t) => t.key === state.settingsTab) ? state.settingsTab : "estado";

  const tabs = TABS.map((t) => `
    <button class="ad-subtab${t.key === active ? " is-active" : ""}" type="button" data-settab="${t.key}">
      ${ico(t.icon)}<span>${esc(t.label)}</span>
    </button>`).join("");

  const view = setView(`
    <div class="ad-subtabs" role="tablist">${tabs}</div>
    <div id="adSettingsBody"></div>
  `);

  view.querySelectorAll("[data-settab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-settab");
      if (key === state.settingsTab) return;
      state.settingsTab = key;
      renderSettings();
    });
  });

  const body = view.querySelector("#adSettingsBody");
  if (active === "historial") renderHistoryTab(body);
  else if (active === "informes") renderReportsTab(body);
  else renderStatusTab(body);
}

/* ----------------------------- Estado del sistema ----------------------------- */
function renderStatusTab(body) {
  // JAVY_WHATSAPP_NUMBER es un global lexical de js/whatsapp-config.js (script clásico).
  const wa = (typeof JAVY_WHATSAPP_NUMBER !== "undefined" && JAVY_WHATSAPP_NUMBER) || "—";
  const cards = [
    { label: "Base de datos", value: "Operativa", tone: "ok", hint: "Productos y categorías en Supabase" },
    { label: "WhatsApp cotizaciones", value: wa !== "—" ? "Conectado" : "Sin configurar", tone: wa !== "—" ? "ok" : "warn", hint: `Número: +${esc(wa)}` },
    { label: "Almacenamiento de imágenes", value: "Activo", tone: "ok", hint: "Bucket product-images" },
    { label: "Catálogo", value: `${state.products.length} productos`, tone: "ok", hint: `${families().length} familias` },
  ];
  paint(body, `
    <div class="ad-section-intro">
      <div><p class="ad-kicker">Sistema</p><p>Estado de los servicios que mantienen la tienda en línea. Solo informativo.</p></div>
    </div>
    <div class="ad-status-grid">
      ${cards.map((s) => `
        <div class="ad-status">
          <div class="ad-status__top"><span class="ad-status__dot ad-status__dot--${s.tone}"></span><span class="ad-status__label">${esc(s.label)}</span></div>
          <span class="ad-status__value">${s.value}</span>
          <span class="ad-status__hint">${s.hint}</span>
        </div>`).join("")}
    </div>`);
}
