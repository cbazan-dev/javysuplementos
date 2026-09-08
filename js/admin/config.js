/* ============================================================================
   Constantes del panel admin. Sin dependencias.
   ============================================================================ */

export const PLACEHOLDER = "img/products/product-placeholder.svg";
export const HOME_MAX = 8;
export const HOME_MIN = 4;
export const STALE_DAYS = 21;

export const GOAL_SUGGESTIONS = [
  "Ganar masa muscular", "Ganar peso", "Rendimiento", "Definición", "Recuperación", "Energía",
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
  { key: "combos", label: "Combos", icon: "package", primary: false,
    subtitle: "Paquetes con precio especial" },
  { key: "access", label: "Accesos", icon: "log-in", primary: false,
    subtitle: "Usuarios del panel y sus permisos" },
  { key: "settings", label: "Ajustes", icon: "settings", primary: false,
    subtitle: "Estado del sistema y configuración" },
];
