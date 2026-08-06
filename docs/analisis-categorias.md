# Análisis de categorías — catálogo público y panel admin

> Diagnóstico del sistema de categorías (familias → subcategorías) con datos reales de Supabase
> al momento del análisis: **111 productos, 13 familias en la tabla (9 reales), 37 subcategorías**.
> Este documento **no aplica cambios**: es el mapa del problema y la propuesta de arreglo por fases.

---

## 1. Cómo funciona hoy

| Capa | Archivo | Qué hace |
|---|---|---|
| Datos | `supabase/schema.sql` + `supabase/migrations/fase3-categorias.sql` | Tabla `categories` autorreferenciada: `parent_id NULL` = **familia**, con padre = **subcategoría**. `products.category_id` apunta a cualquiera de los dos niveles. Se conserva `products.category` (texto) como respaldo. |
| Lectura | `js/db.js:600` `getCategories()` | Solo categorías `is_active`, ordenadas por `sort_order` y nombre. |
| Catálogo | `js/supplements.js:88` `useHierarchy()` | Si hay subcategorías **y** productos con `category_id`, usa el modo jerárquico (familia + tipo); si no, cae al modo plano por texto. |
| UI móvil | `supplements-page.html:104-105` | Carrusel horizontal de chips de familia + segunda fila de chips de tipo. |
| UI desktop | `supplements-page.html:109-115` + `css/pages/supplements.css:538` | Sidebar fijo con la lista de categorías anidada; los chips se ocultan con `display:none !important`. |
| Admin | `js/admin/sections/categories.js` | Crear/renombrar/ocultar/borrar familias, reordenar con flechas, añadir/borrar subcategorías. |
| Asignación | `js/admin/drawers/product-drawer.js:120-121` | Select "Categoría" (obligatorio) → select "Subcategoría" (opcional) en cascada. |

La arquitectura está bien pensada. **El problema no es el código de la jerarquía: son los datos que la llenan y los caminos que llevan a ella.**

---

## 2. Diagnóstico con datos reales

### 2.1 El segundo nivel casi no se usa

**58 de 111 productos (52%) están colgados directamente de la familia**, no de una subcategoría.

| Familia | `sort_order` | Directos en la familia | En subcategorías | Total | Subcats usadas |
|---|---:|---:|---:|---:|---|
| Salud y bienestar | 9 | **22** | 6 | 28 | 5 de 10 |
| Proteínas | 2 | 0 | 27 | 27 | 3 de 6 |
| Creatina | 1 | **9** | 2 | 11 | 2 de 3 |
| Quemadores | 8 | **10** | 0 | 10 | **0 de 4** |
| Pre-entrenos | 4 | **9** | 0 | 9 | **0 de 3** |
| Aminoácidos | 6 | **5** | 4 | 9 | 3 de 5 |
| Ganadores de Peso | 3 | 0 | 8 | 8 | 1 de 2 |
| Energía y rendimiento | 11 | 0 | 4 | 4 | 3 de 3 |
| Potenciadores hormonales | 13 | **3** | 0 | 3 | **0 de 1** |
| *(sin `category_id`)* | — | 2 | — | 2 | — |

Consecuencia directa en el catálogo: el usuario abre **Quemadores** y no ve ningún filtro de segundo nivel
(los 4 tipos dan 0 y `getTypeItems()` los oculta, `js/supplements.js:394`). Abre **Salud y bienestar** —
la familia más grande— y encuentra 5 subcategorías que entre todas cubren 6 de 28 productos.
El nivel de detalle existe en la base pero no llega al cliente.

**20 de 37 subcategorías (54%) están vacías**: Beef, Vegana, Lean gainer, los 3 tipos de Pre-entrenos,
BCAA, BCAA+EAA, los 4 tipos de Quemadores, Minerales, Hepático, Antioxidantes, Inmune, Greens,
Con transportadores y Boosters de testosterona.

### 2.2 Basura en la tabla `categories`

- **Duplicado real**: existen `ISO (aislada)` (`tipo-iso`, 12 productos) y `ISO` (`tipo-iso-mrt88w1c`, 0 productos).
  El segundo se creó a mano desde el panel. `createCategory()` (`js/db.js:643`) siempre añade un sufijo
  `-${Date.now().toString(36)}` al slug, así que **nunca choca y nunca avisa de duplicados**.
- **4 categorías planas heredadas** siguen en la tabla (`quemadores`, `vitaminas`, `accesorios`, `otros`),
  desactivadas por la migración fase 3. El público no las ve, pero el admin sí: `families()`
  (`js/admin/state.js`) lee de `getAllCategories()`, que incluye inactivas. En la sección Categorías
  aparecen **13 tarjetas**, y **"Quemadores" figura dos veces** (la familia real y la plana muerta).
- **Orden con huecos**: las familias tienen `sort_order` 1, 2, 3, 4, 6, 8, 9, 11, 13 porque comparten
  la secuencia con las planas. Además el orden no refleja el inventario: **Creatina (11 productos) va
  primera y Proteínas (27) segunda**.

### 2.3 El texto `category` se desincronizó

30 valores de texto distintos para 37 subcategorías, con casos como **"Salud y Bienestar" (13 productos)
y "Salud y bienestar" (9)** conviviendo apuntando a la misma categoría. Dos productos quedaron con
`category_id` nulo y texto `"Proteinas"` y `"Producto"`.

Esto importa porque ese texto se usa en cuatro lugares: la búsqueda del catálogo
(`js/supplements.js:180`), la tabla del admin (`js/admin/sections/products.js:59`), la ficha de producto
(`js/product-page.js:129`) y el fallback plano cuando Supabase no responde.

### 2.4 La búsqueda no conoce la familia — el fallo más caro

`getSearchText()` (`js/supplements.js:180`) indexa `product.category`, que guarda **la hoja**
(`"Whey"`, `"ISO (aislada)"`), nunca la familia.

> De los **27 productos de la familia Proteínas, solo 14 aparecen al buscar "proteína"**.
> Los otros 13 son invisibles para el término más buscado del rubro.

Lo mismo pasa con "aminoácidos" (los EAA/Glutamina no lo contienen), "vitaminas" o "quemador".

### 2.5 Los objetivos están fragmentados

El filtro **Objetivo** es el eje que más le importa al cliente ("quiero bajar grasa", "quiero subir de peso"),
y hoy tiene **34 valores distintos con sinónimos** repartidos:

- `Masa muscular` (15) · `Ganar masa muscular` (10) · `Volumen` (2) · `Ganar peso` (3) · `Subir calorías` (9)
- `Recuperación` (35) · `Recuperación nocturna` (2)
- `Bienestar general` (4) · `Salud general` (3) · `Vitalidad` (3)
- `Sueño` (6) · `Relajación` (3) · `Estrés` (1) · `Bienestar mental` (1)
- `Piel` (4) · `Cabello` (2) · `Uñas` (2)

Con `FACET_COLLAPSE = 6` (`js/supplements.js:474`), el usuario ve 6 opciones y un "Ver más 28".
El filtro más útil es el más difícil de usar.

---

## 3. Problemas de navegación en la página pública

| # | Problema | Evidencia |
|---|---|---|
| P1 | **La home no tiene ninguna entrada por categoría.** Hero → destacados → reels → footer. Tampoco el nav: solo "SUPLEMENTOS". El único acceso a las 9 familias es entrar al catálogo y descubrir el carrusel. | `index.html`, `Editables/nav.html` |
| P2 | **URLs con UUID**: `?fam=3f8a-...&tipo=9c1b-...`. No se pueden compartir con sentido, no sirven como landing, y se rompen si la categoría se recrea. Las categorías **ya tienen `slug`** (`fam-proteinas`) sin usar en el frontend. | `js/supplements.js:1193` |
| P3 | **En móvil el bottom-sheet de filtros no incluye categorías** (`includeCategory: false`). Quien toca "Filtros" buscando la categoría no la encuentra: tiene que cerrar el sheet y volver al carrusel. | `js/supplements.js:1135` |
| P4 | El carrusel horizontal de 10 chips deja las últimas familias fuera de pantalla; al elegir una aparece una **segunda fila** de tipos que empuja el grid hacia abajo. Descubrimiento dependiente de scroll lateral. | `supplements-page.html:104-105` |
| P5 | **La ficha de producto no enlaza a su categoría.** El breadcrumb "Catálogo / Whey" es texto plano, y no muestra la familia. Desde un producto no hay camino a "ver todas las proteínas", ni bloque de relacionados. | `product-page.html:69-73`, `js/product-page.js:166` |
| P6 | **Cero SEO por categoría**: no existe ninguna URL indexable de "proteínas en Panamá". Todo el tráfico orgánico depende de la `supplements-page.html` genérica. | `sitemap.xml` |
| P7 | Las categorías son **solo texto**, sin icono ni imagen. En móvil una cuadrícula con icono es mucho más escaneable que una fila de píldoras. | `js/supplements.js:361` |
| P8 | "Destacados" (4 productos) compite visualmente con las familias reales dentro de la misma fila de chips. | `js/supplements.js:385` |

Lo que **sí está bien resuelto** y conviene conservar: contadores reactivos por faceta, chips de filtros
activos removibles, estado vacío con "ver resultados en todo el catálogo", persistencia en URL,
`pushState` solo en cambios de categoría, y el sidebar sticky en desktop.

---

## 4. Problemas en el panel admin

| # | Problema | Evidencia |
|---|---|---|
| A1 | **No se pueden reasignar productos en masa.** Mover los 22 productos de "Salud y bienestar" a sus subcategorías exige abrir 22 drawers. Es el bloqueante real del punto 2.1. | `js/admin/sections/products.js` |
| A2 | **Las subcategorías no muestran conteo.** Los chips solo llevan el nombre, así que no se ve que "Termogénico" tiene 0 y que la familia acumula 10 sueltos. La tarjeta solo suma el total de la familia. | `js/admin/sections/categories.js:26,43` |
| A3 | **Las subcategorías no se pueden renombrar, reordenar ni mover de familia**: el chip solo trae botón de borrar. `renameCategory()` existe pero solo está cableado en la familia. | `js/admin/sections/categories.js:43,61` |
| A4 | **No hay validación de duplicados** al crear: el slug lleva sufijo de timestamp, así que "ISO" y "ISO (aislada)" conviven sin aviso. | `js/db.js:649` |
| A5 | **Las 4 categorías planas muertas ensucian la sección** y participan del reordenamiento: mover una familia real renumera también las inactivas. | `js/admin/state.js`, `js/admin/sections/categories.js:144` |
| A6 | **No hay ningún filtro de revisión por categoría.** Los filtros existentes cubren imagen, sabores, precio y destacados; faltan "sin subcategoría" y "sin categoría". | `README.md` §Panel administrativo |
| A7 | **Nada empuja a elegir subcategoría** en el drawer: el campo es opcional y sin pista. De ahí el 52% colgado de la familia. Tampoco se puede crear una subcategoría desde el drawer. | `js/admin/drawers/product-drawer.js:120-121` |
| A8 | El drawer **escribe `category` con el nombre de la hoja**, lo que alimenta la desincronización del texto (2.3). | `js/admin/drawers/product-drawer.js:585` |
| A9 | Dos fuentes de verdad para el mismo conteo: la tarjeta cuenta sobre `state.products` (memoria) y el borrado consulta `getCategoryProductCount()` (BD). Pueden discrepar. | `js/admin/sections/categories.js:18,177` |

---

## 5. Propuesta

### 5.1 Taxonomía objetivo

**Reordenar las familias por inventario** (lo que el cliente busca primero va primero):

```
1. Proteínas (27)            5. Pre-entrenos (9)
2. Salud y bienestar (28)    6. Aminoácidos (9)
3. Creatina (11)             7. Ganadores de peso (8)
4. Quemadores (10)           8. Potenciadores hormonales (3)
```

**Fusionar "Energía y rendimiento" (4 productos)** dentro de Pre-entrenos como subcategorías
(Bebidas, Cafeína, Carbohidratos) → 8 familias limpias en vez de 9 con dos casi vacías.

**Borrar las 20 subcategorías vacías** y las 4 planas heredadas, y unificar el duplicado `ISO`.
Regla a futuro: una subcategoría nace cuando hay **3+ productos** que la justifiquen.

**Repartir los 58 productos sueltos** en subcategorías reales. Los casos concretos:
Salud y bienestar (22) es el más urgente; Quemadores (10) y Pre-entrenos (9) necesitan que alguien
decida termogénico/stim-free y con/sin estimulante producto por producto.

**Normalizar los 34 objetivos a 8 canónicos:**

| Objetivo canónico | Absorbe |
|---|---|
| Ganar masa | Masa muscular, Ganar masa muscular, Volumen, Ganar peso, Subir calorías |
| Definición | Definición, Metabolismo |
| Fuerza y rendimiento | Fuerza, Rendimiento, Resistencia |
| Energía y enfoque | Energía, Enfoque, Pump |
| Recuperación | Recuperación, Recuperación nocturna |
| Descanso y estrés | Sueño, Relajación, Estrés, Bienestar mental |
| Salud general | Bienestar general, Salud general, Vitalidad, Antioxidante, Sistema inmune, Digestión, Salud hepática, Salud cardiovascular, Huesos, Minerales, Salud celular, Circulación |
| Belleza | Piel, Cabello, Uñas |

### 5.2 Página pública

1. **Slugs en la URL** (`?fam=proteinas&tipo=whey`) leyendo el `slug` que ya existe, con
   retrocompatibilidad para los UUID actuales. Desbloquea todo lo demás: enlaces desde la home,
   desde el nav, desde la ficha y desde WhatsApp.
2. **Sección "Compra por categoría" en la home**: cuadrícula 2×4 en móvil con icono, nombre y conteo,
   enlazando a `supplements-page.html?fam=<slug>`. Es el arreglo de mayor impacto de todo el documento.
3. **Fila "¿Cuál es tu objetivo?"** con los 8 objetivos canónicos → `?obj=<slug>`. Habla el idioma del
   cliente, no el del catálogo.
4. **Submenú de categorías en el nav** (dropdown en desktop, acordeón en el menú móvil).
5. **Categoría dentro del bottom-sheet móvil** (`includeCategory: true`), como acordeón arriba del resto.
6. **Breadcrumb enlazado** en la ficha: `Catálogo / Proteínas / Whey`, más un bloque
   "Más de Proteínas" con 4 productos de la misma familia.
7. **Búsqueda que conozca la familia**: indexar familia + subcategoría + sinónimos por familia
   (`proteina`, `whey`, `iso`, `suero`…). Los 27 productos de Proteínas deben salir al buscar "proteína".
8. **Iconos por familia** reutilizando `js/icons.js`.

### 5.3 Panel admin

1. **Selección múltiple + "Mover a categoría"** en la sección Productos. Sin esto, limpiar los 58
   productos sueltos no es viable.
2. **Conteo en cada chip de subcategoría**, con los vacíos en gris, y un aviso en la familia:
   *"22 productos sin subcategoría"* con enlace al listado filtrado.
3. **Renombrar / reordenar / mover de familia** las subcategorías.
4. **Validar duplicados** por nombre dentro del mismo padre en `createCategory()`, sugiriendo la existente.
5. **Ocultar las categorías inactivas heredadas** del listado (o borrarlas en la migración de limpieza) y
   normalizar `sort_order` solo entre familias activas.
6. **Filtros de revisión nuevos**: "sin subcategoría" y "sin categoría", junto a los de imagen y sabores.
7. **Tarjeta de salud de la taxonomía en el Dashboard**: productos sin categoría, sin subcategoría,
   subcategorías vacías y duplicados detectados.
8. **Subcategoría requerida** en el drawer cuando la familia tiene tipos activos, con opción explícita
   "Sin subcategoría" y botón para crear una al vuelo.
9. **Derivar siempre `products.category`** de `category_id` al guardar, para que el texto deje de driftear.

---

## 6. Plan por fases

> **Corrección al plan original.** La primera versión de este documento proponía borrar las
> subcategorías vacías en la fase de limpieza de datos. Es un error de orden: las vacías de
> Quemadores (4), Pre-entrenos (3), Aminoácidos (2) y Salud y bienestar (5) están vacías
> *precisamente porque* sus productos cuelgan de la familia — y son el **destino** al que hay que
> moverlos. Borrarlas antes del reparto dejaría el reparto sin destino. Solo se borran de entrada
> las que no tienen destino pendiente (`Beef`, `Vegana`, `Lean gainer`, cuyas familias no tienen
> productos sueltos) y el duplicado `ISO`. El resto se limpia **después** del reparto, con el bloque
> opcional al pie de `supabase/migrations/fase8-taxonomia.sql`.

| Fase | Qué | Dónde | Impacto | Riesgo |
|---|---|---|---|---|
| **0 — Limpieza de datos** | Borrar duplicado ISO, subcategorías vacías y planas heredadas; reordenar familias; resincronizar el texto `category`; normalizar objetivos | Migración SQL en Supabase + `export-product-data.mjs` | Alto | Bajo (nada de esto tiene productos asignados salvo los objetivos) |
| **1 — Navegación pública** | Slugs en URL, categoría en el sheet móvil, breadcrumb enlazado, búsqueda con familia y sinónimos | `js/supplements.js`, `js/product-page.js` | Alto | Bajo |
| **2 — Puertas de entrada** | Grid de categorías y objetivos en la home, submenú en el nav, iconos | `index.html`, `js/script.js`, `Editables/nav.html` | Alto | Medio (toca la home) |
| **3 — Admin** | Reasignación masiva, conteos por subcategoría, validación de duplicados, filtros de revisión | `js/admin/sections/*`, `js/db.js` | Alto para el dueño | Medio |
| **4 — Reparto de los 58 sueltos** | Trabajo de contenido usando las herramientas de la fase 3 | Panel | Alto | Ninguno |
| **5 — SEO** | Landings estáticas por familia generadas por script + sitemap | `scripts/`, `sitemap.xml` | Medio, a plazo | Medio |

**Orden recomendado: 0 → 1 → 3 → 4 → 2 → 5.** La fase 3 antes que la 2 porque no tiene sentido
publicar puertas de entrada por categoría mientras la mitad del catálogo no está bien categorizado.

---

## 7. Interacción con las páginas estáticas de categoría (`scripts/generate-pages.mjs`)

> Añadido después del commit `5d31b77 seo: Fase 2 - páginas estáticas por producto y categoría`,
> que adelanta parte de la fase 5 de este plan. **Hereda el problema de la sección 2.1 y conviene
> revisarlo antes de mergear a producción.**

El generador agrupa los productos por **`category_id` exacto**, sin acumular las subcategorías en su
familia (`scripts/generate-pages.mjs:566-572`), y descarta las categorías con menos de 3 productos
directos (`MIN_PRODUCTS_PER_CATEGORY`, línea 44). Con los datos actuales eso produce **9 páginas**:

| Página generada | Nivel | Productos en la página | Total real de la rama |
|---|---|---:|---:|
| `/categoria/whey` | subcategoría | 13 | 13 |
| `/categoria/iso-aislada` | subcategoría | 12 | 12 |
| `/categoria/mass-gainer` | subcategoría | 8 | 8 |
| `/categoria/salud-y-bienestar` | familia | 21 | 28 |
| `/categoria/quemadores` | familia | 10 | 10 |
| `/categoria/creatina` | familia | 9 | 11 |
| `/categoria/pre-entrenos` | familia | 8 | 9 |
| `/categoria/aminoacidos` | familia | 5 | 9 |
| `/categoria/potenciadores-hormonales` | familia | 3 | 3 |

*(La diferencia entre ambas columnas son los productos que cuelgan de subcategorías —el generador no
los sube a la familia— más los 2 productos no disponibles que el script filtra.)*

Tres consecuencias:

1. **Proteínas no tiene página.** La familia más grande del catálogo (27 productos) tiene 0 productos
   asignados directamente, así que no supera el umbral y queda fuera. Lo mismo pasa con
   **Ganadores de Peso** (8) y **Energía y rendimiento** (4). Es decir: las tres familias mejor
   categorizadas son justamente las que se quedaron sin landing.
2. **Las páginas de familia que sí existen, existen por el defecto de datos.** Salud y bienestar,
   Quemadores, Pre-entrenos, Creatina, Aminoácidos y Potenciadores obtuvieron página únicamente
   porque sus productos están mal colgados de la familia. Además quedan incompletas: la de Salud y
   bienestar lista 21 de 28, la de Aminoácidos 5 de 9.
3. **Al arreglar los datos, estas URLs desaparecen.** Cuando se repartan los 58 productos sueltos
   (fase 4), esas 6 familias se quedarán con 0 productos directos y el generador dejará de emitir sus
   páginas — después de que Google las haya indexado. Es una trampa de 404s a futuro.

**Arreglo propuesto**: que el conteo y el listado de cada familia incluyan sus subcategorías
(`category_id` propio **o** `parent_id` = la familia). Con eso Proteínas, Ganadores y Energía pasan a
tener página, las de familia quedan completas, y ninguna depende ya de la mala asignación: sobreviven
intactas al reparto de la fase 4. Queda por decidir si familia y subcategoría deben convivir en el
mismo nivel de URL (`/categoria/whey` junto a `/categoria/proteinas`) o anidarse
(`/categoria/proteinas/whey`).

---

## 8. Decisiones que necesitan al dueño

1. ¿Se fusiona "Energía y rendimiento" dentro de Pre-entrenos, o se mantiene como familia propia?
2. ¿"Potenciadores hormonales" (3 productos) se mantiene visible o se esconde hasta tener más inventario?
3. Los 22 productos de "Salud y bienestar" y los 10 de "Quemadores": ¿los reparte el dueño producto por
   producto, o se define una regla automática por marca/nombre y luego se revisa?
4. ¿Se conserva `products.category` (texto) como respaldo, o se elimina la columna y se depende solo de
   `category_id`? (Ya figura en la deuda técnica del `README`.)
