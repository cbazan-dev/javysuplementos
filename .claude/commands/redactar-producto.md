---
description: Investiga un producto en fuentes oficiales y redacta descripción corta/larga, beneficios y modo de uso listos para pegar en el panel
argument-hint: [nombre, marca, presentación y cualquier dato/etiqueta del producto]
---

Vas a redactar los textos de catálogo de este producto: $ARGUMENTS

Objetivo: entregarme **textos verídicos y de alta calidad**, en el formato exacto que pide
el formulario de producto del panel admin (`js/admin/drawers/product-drawer.js`), para que
yo los pegue tal cual. **No tocas Supabase ni ningún archivo del repo**: la salida va en el chat.

## 0. Entrada

- Si falta el **nombre** o la **marca**, pregúntame antes de buscar nada.
- Si adjunto foto de la etiqueta, texto de la etiqueta o un link del fabricante, ese es el
  dato primario: léelo completo antes de buscar.
- **Los textos son del producto, no de un sabor.** La foto que adjunto suele ser la imagen de
  la card (un sabor cualquiera); ignora ese sabor al redactar y no lo menciones en los textos.
  Los sabores van aparte, como variantes: en "Sugerencias de clasificación" lista los sabores
  oficiales del fabricante para que yo elija cuáles cargar.
- Si paso varios productos, procesa uno por uno con el mismo formato, separados por `---`,
  sin mezclar fuentes ni datos entre ellos.

## 1. Investigación

Usa `WebSearch` y `WebFetch`. Prioridad de fuentes, de mayor a menor:

1. **Sitio oficial del fabricante**: ficha del producto, tabla nutricional / Supplement Facts,
   sección "Suggested use" o "Directions", advertencias.
2. **Etiqueta que yo te pasé** (foto o texto).
3. Retailers grandes que reproducen la etiqueta (Amazon, iHerb, Bodybuilding.com, A1 Supplements)
   — solo para **confirmar**; nunca como única fuente de una cifra.

Busca concretamente: ingredientes clave y cantidad por porción, tamaño de porción, porciones
por envase, sabores oficiales, instrucciones de uso del fabricante, advertencias (estimulantes,
alérgenos, embarazo, menores de 18).

**Regla dura:** ninguna cifra (g de proteína, mg de cafeína, dosis, porciones) entra al texto si
no la viste en una fuente. Si no la encuentras, redacta sin la cifra y dilo en "Fuentes y notas".

**Si lo que yo te pasé contradice la fuente oficial**, usa la oficial y marca la diferencia en
"Fuentes y notas" para que yo decida.

## 2. Redacción

Formato y límites (son las recomendaciones del propio formulario):

| Bloque | Formato | Contenido |
|---|---|---|
| Descripción corta | 1 oración, **80–140 caracteres** | Qué es + para qué / para quién. No repitas la marca (ya sale arriba en la ficha). |
| Descripción larga | **2–4 párrafos, 80–180 palabras**, párrafos separados por una línea en blanco | P1: qué es y de qué marca. P2: composición clave con cifras verificadas. P3: para quién y cuándo conviene. P4 (opcional): presentación. Sin nombrar sabores concretos. |
| Beneficios | **3–6 líneas**, una por beneficio, **sin** viñetas, guiones ni numeración | Cada línea empieza con verbo o dato concreto: "Aporta 25 g de proteína por porción". |
| Modo de uso | **2–6 líneas**, una por paso, **sin** viñetas ni numeración | Basado en el "Suggested use" oficial. Si tiene estimulantes o contraindicaciones, la última línea es la advertencia. |

Tono y estilo:

- Español neutro, cercano, de **tú** ("Te ayuda a…", "Tómalo…", "Mézclalo…").
- Sin superlativos vacíos ("el mejor", "increíble", "revolucionario").
- Sin promesas médicas ni absolutas ("cura", "elimina la grasa", "garantiza"). Usa "apoya",
  "favorece", "contribuye", "está pensado para".
- Sin emojis y **sin markdown dentro de los textos** (el panel guarda texto plano).
- Unidades con espacio y en minúscula: `25 g`, `200 mg`, `5 lb`, `30 porciones`.

## 3. Clasificación sugerida

- **Objetivos:** 1–3, **solo** de la lista fija de `js/admin/config.js` (`GOAL_SUGGESTIONS`):
  Ganar masa · Definición · Fuerza y rendimiento · Energía y enfoque · Recuperación ·
  Descanso y estrés · Salud general · Belleza.
- **Tags:** 2–5 palabras clave de búsqueda (ingrediente principal, "sin azúcar", "vegano",
  "sin estimulantes"…). Afectan búsqueda y filtros, no la card.
- **Categoría › Subcategoría:** lee las vigentes con
  `grep -o 'categoria: "[^"]*"' js/product-data.js | sort -u` (o la tabla `categories` en
  Supabase: familia = `parent_id` nulo, tipo = hijo). Propón la que encaje. **Nunca inventes una
  nueva**; si ninguna encaja, dilo.

## 4. Salida

Entrega cada campo en su propio bloque de código para que lo copie de una vez, en este orden:

````
### Descripción corta
```
<texto>
```

### Descripción larga
```
<párrafo 1>

<párrafo 2>
```

### Beneficios
```
<beneficio 1>
<beneficio 2>
<beneficio 3>
```

### Modo de uso
```
<paso 1>
<paso 2>
```

### Sugerencias de clasificación
Objetivos: …  |  Tags: …  |  Categoría › Subcategoría: …
Sabores oficiales: … (lista del fabricante, para elegir cuáles cargar como variantes)

### Fuentes y notas
- URLs consultadas (la oficial primero)
- Discrepancias entre lo que pasé y la fuente oficial → se usó la oficial
- Datos que NO se encontraron y por eso no aparecen en el texto
````

Antes de entregar, haz un **autochequeo** y anótalo en una línea al final: caracteres de la
corta, palabras y párrafos de la larga, cantidad de beneficios y de pasos. Si algo se sale del
rango, corrígelo antes de mostrarlo.

## 5. Cierre

Recuérdame: pegar en el panel → Guardar (queda en Supabase). Si quiero el fallback local al día,
`node scripts/export-product-data.mjs` y revisar el `git diff` de `js/product-data.js`.
