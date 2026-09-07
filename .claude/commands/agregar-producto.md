---
description: Agregar un producto nuevo manteniendo Supabase y product-data.js sincronizados
argument-hint: [nombre y datos del producto]
---

Vas a ayudarme a agregar un producto nuevo: $ARGUMENTS

Contexto importante: **Supabase es la fuente de verdad** (tablas `products` y
`product_flavors`). El archivo **js/product-data.js** es un fallback local que se
**regenera desde Supabase** con `node scripts/export-product-data.mjs` (ya no se
edita a mano).

Pasos:
1. Pídeme los datos que falten: nombre, marca, categoría, precio, presentación,
   imagen, sabores (con disponibilidad de cada uno), beneficios[], descripcion[],
   uso[]. **No inventes datos**: si falta algo, pregúntame.
2. Dame el `INSERT` de SQL para Supabase según `supabase/schema.sql`
   (producto + sus sabores).
3. Si hay imagen nueva, recuérdame guardarla en `img/products/` en **WebP**.
4. Tras insertar en Supabase, regenera el fallback con
   `node scripts/export-product-data.mjs` y **revisa el `git diff`** de
   `js/product-data.js` antes de commitear.
5. La página `/producto/<slug>/` la crea `scripts/generate-pages.mjs`, que corre
   solo cada noche (`.github/workflows/regenerar-catalogo.yml`) y abre un PR. O
   sea que el producto **ya se ve** en el catálogo y en su página de categoría
   (se hidratan desde Supabase en el navegador), pero su ficha propia y su
   entrada en el sitemap aparecen recién al mergear ese PR. Si hace falta antes
   —por ejemplo para compartir el link por WhatsApp, que necesita el HTML—
   correr `node scripts/generate-pages.mjs` a mano.

   > Si el producto ya había existido y se dio de baja, revisa que **no** le
   > quede una regla 301 viva en Cloudflare (`docs/seguridad-cloudflare.md` §2.7):
   > secuestraría la URL y la ficha nueva no se podría abrir.
6. Al terminar, resúmeme qué cambió y recuérdame correr `/ver-sitio` para verlo.
