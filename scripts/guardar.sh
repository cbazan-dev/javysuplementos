#!/usr/bin/env bash
# guardar.sh — Guarda tus cambios: commit + push a TU rama de desarrollo.
# Nunca toca 'main' (a producción solo se llega por Pull Request aprobado).
# Uso: bash scripts/guardar.sh "descripción clara del cambio"
set -u

msg="${*:-}"
rama="$(git branch --show-current 2>/dev/null || true)"

if [ -z "$rama" ]; then
  echo "❌ No estás en ninguna rama (HEAD suelto). No puedo guardar."
  exit 1
fi

if [ "$rama" = "main" ]; then
  echo "🚫 Estás en 'main'. A producción solo se llega por Pull Request aprobado."
  echo "   Cambia a tu rama de desarrollo (claude o codex) y vuelve a intentar."
  exit 1
fi

case "$rama" in
  claude|codex) ;;
  *)
    echo "⚠️  Estás en la rama '$rama', que no es una rama de desarrollo conocida (claude/codex)."
    printf "¿Guardar igual en '%s'? [s/N] " "$rama"
    read -r resp
    case "$resp" in
      s|S|si|Si|SI|y|Y) ;;
      *) echo "Cancelado."; exit 1 ;;
    esac
    ;;
esac

if [ -z "$msg" ]; then
  echo "❌ Falta el mensaje de commit."
  echo "   Uso: bash scripts/guardar.sh \"descripción clara del cambio\""
  exit 1
fi

echo "→ Trayendo lo último de origin/$rama…"
if ! git pull --ff-only origin "$rama"; then
  echo "⚠️  La rama remota tiene cambios que no encajan directos (divergencia)."
  echo "   Pídele a Claude/Codex que resuelva antes de guardar. No subí nada."
  exit 1
fi

# Mantiene consistente el token de versión del panel admin (js/admin/** + admin.html).
# Sin esto, la caché puede mezclar módulos viejos y nuevos → panel en negro.
if command -v node >/dev/null 2>&1; then
  if ! node scripts/bump-admin-version.mjs --quiet; then
    echo "❌ No se pudo actualizar el token de versión del panel admin. No guardé nada."
    exit 1
  fi
else
  echo "⚠️  No encontré 'node': no pude verificar el token del panel admin."
  echo "   Si tocaste js/admin/**, corre: node scripts/bump-admin-version.mjs"
fi

# Preparamos todo (modificados, nuevos y borrados) y RECIÉN ahí comprobamos si
# hay algo que commitear. Hacerlo antes con `git diff` dejaba fuera los archivos
# nuevos sin rastrear (git diff no los ve) y creía que "no había cambios".
git add -A
if git diff --cached --quiet; then
  echo "ℹ️  No hay cambios para guardar. Nada que commitear."
  exit 0
fi

git commit -m "$msg"

echo "→ Subiendo a origin/$rama…"
git push origin "$rama"
echo "✅ Listo: guardado y subido a '$rama'."
