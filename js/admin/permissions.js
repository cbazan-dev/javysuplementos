/* ============================================================================
   Permisos por rol.

   Esto es solo comodidad de la interfaz: sirve para no mostrarle a un Lector
   botones que no va a poder usar. El permiso REAL lo aplica RLS en Supabase
   (is_staff / can_write / can_manage_users). Si alguien esquiva la UI, la base
   de datos lo frena igual.
   ============================================================================ */
import { state } from "./state.js?v=adm-90d40885";

export const ROLES = [
  { value: "admin",  label: "Admin",  hint: "Acceso total, incluida la gestión de usuarios" },
  { value: "editor", label: "Editor", hint: "Gestiona el catálogo; no toca usuarios" },
  { value: "viewer", label: "Lector", hint: "Solo consulta; no puede modificar nada" },
];

export function roleLabel(role) {
  return (ROLES.find((r) => r.value === role) || { label: role || "—" }).label;
}

export function roleHint(role) {
  return (ROLES.find((r) => r.value === role) || { hint: "" }).hint;
}

// Admin o Editor: puede escribir en el catálogo.
export const canWrite = () => state.role === "admin" || state.role === "editor";

// Solo Admin: crea, edita y elimina usuarios del panel.
export const canManageUsers = () => state.role === "admin";
