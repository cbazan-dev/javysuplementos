# CLAUDE.md

Contexto para **Claude Code**. Lee esto antes de trabajar.

## Tu rama

- Trabaja siempre en la rama **`claude`**.
- Guarda tus cambios con **`/guardar`** (hace commit + push a `claude`; nunca toca `main`).
- Revisa el estado de las ramas con **`/estado-ramas`**.
- **Nunca** hagas push directo a `main`. A producción se llega por Pull Request `claude → main`
  aprobado por el dueño.

## Contexto del proyecto

La fuente de verdad del proyecto (stack, estructura, módulos, flujo de datos, esquema de BD,
convenciones, comandos y deuda técnica) está en **[`README.md`](README.md)**. Léelo antes de
hacer cambios.

Atajos rápidos:
- Ver el sitio en vivo: **`/ver-sitio`**
- Agregar un producto (sincroniza Supabase + `product-data.js`): **`/agregar-producto`**
- Redactar los textos de un producto con datos verificados: **`/redactar-producto`**
- Aligerar imágenes (PNG → WebP): **`/aligerar-imagenes`**
- Revisar diseño + lógica de tus cambios: **`/revisar-cambios`**

## Recordatorios clave (detalle en `README.md`)

- Sanitiza con `escapeHTML()` todo texto de usuario/BD antes de insertarlo en el DOM.
- El número de WhatsApp vive solo en `js/whatsapp-config.js`.
- Imágenes nuevas en WebP cuando se pueda.
- Mobile primero.
