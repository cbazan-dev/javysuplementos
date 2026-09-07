---
name: "source-command-ver-sitio"
description: "Levanta el sitio en un servidor local para ver los cambios en vivo"
---

# source-command-ver-sitio

Use this skill when the user asks to run the migrated source command `ver-sitio`.

## Command Template

Levanta un servidor estático local para previsualizar el sitio.

1. Inicia el servidor en segundo plano: `python3 -m http.server 8080`
2. Dame la URL lista para abrir: http://localhost:8080
3. Si el puerto 8080 está ocupado, usa 8081, 8082, etc.
4. Recuérdame los enlaces útiles:
   - Inicio: http://localhost:8080/index.html
   - Catálogo: http://localhost:8080/catalogo/
   - Detalle: http://localhost:8080/product-page.html?id=<id-de-un-producto>
5. Deja el servidor corriendo (no lo cierres) hasta que te lo pida.
