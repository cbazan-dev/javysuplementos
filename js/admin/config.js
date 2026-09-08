/* ============================================================================
   Constantes del panel admin. Sin dependencias.
   ============================================================================ */

export const PLACEHOLDER = "img/products/product-placeholder.svg";
export const HOME_MAX = 8;
export const HOME_MIN = 4;
export const STALE_DAYS = 21;

/* Los 8 objetivos del catálogo. NO es una lista de sugerencias sueltas: es el
   vocabulario cerrado que fijó supabase/migrations/fase8-taxonomia.sql, que
   colapsó 34 variantes a estos 8 porque el filtro Objetivo del catálogo se
   había vuelto inusable.

   Esta lista tiene que coincidir palabra por palabra con esa migración. Antes
   ofrecía "Ganar masa muscular", "Ganar peso", "Rendimiento" y "Energía", que
   son justamente sinónimos que la migración había eliminado: bastaba editar un
   producto en el panel para reintroducirlos, y así volvió a aparecer un
   "Ganar masa muscular" suelto conviviendo con "Ganar masa" (ver
   docs/rollback-objetivos-2026-08-29.sql). Agregar un objetivo nuevo acá
   implica agregarlo también al catálogo y a los atajos de la home
   (HOME_GOALS en js/script.js). */
export const GOAL_SUGGESTIONS = [
  "Ganar masa", "Definición", "Fuerza y rendimiento", "Energía y enfoque",
  "Recuperación", "Descanso y estrés", "Salud general", "Belleza",
];

export const NAV = [
  { key: "dashboard", label: "Dashboard", icon: "layout-dashboard", primary: true,
    subtitle: "Resumen de la tienda y acciones pendientes" },
  { key: "products", label: "Productos", icon: "package", primary: true,
    subtitle: "Gestiona el catálogo, precios y disponibilidad" },
  { key: "pricing", label: "Precios", icon: "grid", primary: true,
    subtitle: "Precio de venta, revendedor y Javy de todo el catálogo" },
  { key: "home", label: "Inicio", icon: "home", primary: true,
    subtitle: "Productos destacados en el inicio" },
  { key: "categories", label: "Categorías", icon: "tags", primary: false,
    subtitle: "Categorías y subcategorías del catálogo" },
  { key: "access", label: "Accesos", icon: "log-in", primary: false,
    subtitle: "Usuarios del panel y sus permisos" },
  { key: "settings", label: "Ajustes", icon: "settings", primary: false,
    subtitle: "Estado del sistema y configuración" },
];
