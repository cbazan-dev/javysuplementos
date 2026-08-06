# Productos a verificar manualmente

**Generado el 2026-08-04 · 49 de 111 productos**
**Actualizado el 2026-08-05 · quedan 46** — los bloques C y E ya están resueltos.

> **Llenado de contenido (2026-08-05).** Se completaron en Supabase los 5 productos que
> seguían con contenido incompleto o con texto de relleno: BioSport Xtreme Gainer,
> C4 Whey Protein 2.2 lb, Zinc Chelate 50 mg, Lipodrene Fat Burner y Creatina Nutrex.
> Hoy **ningún producto activo** tiene menos de 4 beneficios, menos de 3 líneas de uso,
> ni objetivos vacíos. Esto es independiente de la verificación de marcas de abajo, que
> sigue pendiente.

### Otros arreglos del 2026-08-05

- **BioSport Xtreme Gainer no tenía `category_id`.** Era el único producto activo sin
  asignar, y como la jerarquía de categorías ya está activa, eso lo dejaba fuera de todos
  los filtros por familia — solo aparecía en "Todos". Se movió a **Ganadores de Peso ›
  Mass gainer**, junto a los otros 8 gainers.

### Pendientes sueltos (sin resolver)

- **Precio distinto entre las dos fuentes.** `Nutrex Creatine Monohydrate 60 servidas`
  vale **$12.50** en `js/product-data.js` y **$15.00** en Supabase. Hay que decidir cuál es
  el bueno; conviene revisar si hay más casos así.
- **Categorías en singular.** Dos productos usan `Creatina` en vez de `Creatinas`
  (`Nutrex Creatine Monohydrate 60 servidas` y `Olympus Creatine 100 servidas`). Hoy **no
  rompe nada** porque el filtro se guía por `category_id`, pero conviene unificarlo.

Estos son los productos donde **la marca o el nombre no están claros** en la base de datos.
Sin una identidad correcta no se puede buscar información veraz del producto, y la regla
principal del llenado de catálogo es **no inventar nada**. Por eso quedan fuera del
trabajo automático hasta que se confirmen a mano.

**Cómo usar esta lista:** revisá el envase físico (o la factura del proveedor) y anotá la
marca real en la columna correspondiente. Con eso confirmado, el producto entra al llenado
automático de descripción, beneficios y modo de uso.

---

## A. La marca es un ingrediente, no un fabricante — 18 productos

Estos tienen cargado el nombre del ingrediente en el campo "marca". Es el bloque más
grande y el más difícil: **no hay forma de saber quién los fabrica** sin ver el envase.
Casi todos son de la categoría Salud y Bienestar.

| Producto | "Marca" actual | Presentación | Precio | Marca real (completar) |
|---|---|---|---|---|
| Ashwagandha 90 cápsulas | `Ashwagandha` | 90 cápsulas | $16.50 | |
| Biotin Vitamin B7 120 cápsulas | `Biotin` | 120 cápsulas | $15.00 | |
| Biotin Women 120 cápsulas | `Biotin Women` | 120 cápsulas | $18.00 | |
| Calcium + Vitamin D 240 cápsulas | `Calcium + Vitamin D` | 240 cápsulas | $18.00 | |
| Inositol 500 mg 240 cápsulas | `Inositol` | 240 cápsulas | $20.00 | |
| Magnesium Complex 240 cápsulas | `Magnesium Complex` | 240 cápsulas | $20.00 | |
| Maltodextrin 2 lb | `Maltodextrin` | 2 lb / 60 servidas | $20.00 | |
| Maltodextrin 8 lb | `Maltodextrin` | 8 lb / 242 servidas | $45.00 | |
| NAD+ | `NAD+` | **falta** | $50.00 | |
| Olive Leaf Extract 75 mg 90 cápsulas | `Olive Leaf` | 90 cápsulas | $25.00 | |
| Potassium 99 mg 30 cápsulas | `Potassium` | 30 cápsulas | $9.50 | |
| Potassium 99 mg 240 cápsulas | `Potassium` | 240 cápsulas | $20.00 | |
| R-Alpha Lipoic Acid 120 cápsulas | `R-ALA` | 120 cápsulas | $25.00 | |
| Resveratrol 120 cápsulas | `Resveratrol` | 120 cápsulas | $25.50 | |
| Tongkat Ali Complex 1000 mg 60 cápsulas | `Tongkat Ali` | 60 cápsulas | $15.50 | |
| Vitamin C 500 mg 240 cápsulas | `Vitamin C` | 240 cápsulas | $15.00 | |
| ZMA 180 cápsulas | `ZMA` | 180 cápsulas | $22.50 | |
| Zinc Chelate 50 mg 120 cápsulas | `Zinc Chelate` | 120 cápsulas | $15.00 | |

> 💡 Varios de estos podrían ser **Nutricost** (ya vendés 8 productos de esa marca y su
> línea de cápsulas coincide con estas presentaciones), pero **hay que confirmarlo con el
> envase** — no se puede asumir.

---

## B. La marca es el nombre del producto — 11 productos

Acá el campo "marca" tiene el nombre comercial del producto. En varios casos el
fabricante es deducible, pero **conviene confirmarlo** antes de escribir contenido.

| Producto | "Marca" actual | Presentación | Precio | Fabricante probable (confirmar) |
|---|---|---|---|---|
| Xtend BCAA 30 servidas | `Xtend` | **falta** | $25.00 | Nutrabolt / Scivation |
| CBUM Energy Drink 355 ml | `CBUM` | 355 ml | $2.50 | RAW Nutrition |
| Zero Carb Protein | `Isopure` | 4.5 lb | $40.00 | Nature's Best (Isopure es su línea) |
| Xpel Diurético | `Xpel` | **falta** | $18.00 | MHP |
| Liv52 Protector Hepático | `Liv52` | **falta** | $15.00 | Himalaya |
| Adiplex | `Adiplex` | **falta** | $13.50 | ❓ sin pista |
| Maniac Extreme Pre-Workout | `Maniac` | **falta** | $25.00 | ❓ sin pista |
| Carniburn Fuego | `Carniburn` | **falta** | $35.00 | ❓ sin pista |
| H2O Diurético | `H2O` | **falta** | $18.00 | ❓ sin pista |
| Skull BCAA + EAA | `Skull` | **falta** | $20.00 | ❓ sin pista |
| Skull Pre-Workout Xtreme | `Skull` | **falta** | $20.00 | ❓ sin pista |

---

## C. ⚠️ La marca es un SABOR — 2 productos

Este es el error más serio: en la tienda estos productos aparecen bajo una marca que no
existe como fabricante de suplementos.

| Producto | "Marca" anterior | Marca corregida | Presentación | Precio |
|---|---|---|---|---|
| C4 Whey Protein | ~~`Hershey´s`~~ | **Cellucor** ✅ | 2.2 lb - 28 servidas | $38.00 |
| C4 Whey Protein | ~~`Reese's`~~ | **Cellucor** ✅ | 5.8 lb - 66 servidas | $71.00 |

✅ **Resuelto.** Los sabores ya estaban bien cargados en la tabla `product_flavors`
("Hershey's" y "Reese's Chocolate Peanut Butter"), así que solo hubo que corregir la marca.
De paso se normalizó el apóstrofo tipográfico de `Hershey´s` → `Hershey's`.

---

## D. Errores de escritura y marcas duplicadas — 10 productos

Estos son los más fáciles: la marca es correcta pero está mal escrita, lo que hace que en
los filtros de la tienda **el mismo fabricante aparezca varias veces**.

| Producto | Marca actual | Debería ser | Nota |
|---|---|---|---|
| Mass Extreme 2500 (6 lb) | `Muntant` | **Mutant** | Error de tipeo. Ya existe el mismo producto con marca correcta en 15 lb |
| Serious Mass (6 lb) | `Optimun Nutrition` | **Optimum Nutrition** | Falta la "m" |
| Gold Standard 100% Whey Protein (1.85 lb) | `Optimun  Nutrition` | **Optimum Nutrition** | Falta la "m" **y** tiene doble espacio |
| Nitro Tech Whey Gold Gourtmet | `Muscletech` | **MuscleTech** | Mayúscula. Además el nombre dice "Gourtmet" → debería ser **Gourmet** |
| NAC 1000 mg 120 cápsulas | `nutricost` | **Nutricost** | Minúscula |
| ZMA 90 cápsulas | `nutricost` | **Nutricost** | Minúscula |
| Vitamin E | `nutricost` | **Nutricost** | Minúscula |
| ZMA  180 cápsulas | `primaforce` | **Primaforce** | Minúscula. El nombre tiene doble espacio |
| BioSport Xtreme Gainer | `BioSport USA` | **Biosport** (?) | Hay otros 4 productos como `Biosport`. Confirmar si es la misma empresa |
| Precision Protein | `HTP` | ❓ | ¿Es Hi-Tech Pharmaceuticals? No es un producto conocido de esa marca. **Verificar** |

---

## E. Registro incompleto — ✅ resuelto (era 1 producto)

La imagen cargada (`creatine-nutrex-60srv.png`) identificó el registro: es la **creatina
Nutrex de 60 servidas**. Se le completaron marca, presentación, objetivos, beneficios y
modo de uso.

| Producto | Marca | Presentación | Precio | Estado |
|---|---|---|---|---|
| Creatina Nutrex - 60 Servidas | Nutrex ✅ | 60 servidas ✅ | $15.99 | Contenido completo |

> ✅ **Duplicado confirmado y desactivado.** Comparando las dos fotos se ve el mismo bote:
> Nutrex Creatine Monohydrate, 60 SRV, 300 g, *Unflavored*. Ya existía como
> `Nutrex Creatine Monohydrate 60 servidas` ($15.00, en la home). El registro de $15.99
> quedó con `is_active = false` y `show_on_home = false` — **no se borró**, así que se puede
> revertir en cualquier momento si resulta ser una compra distinta.
>
> Ojo que hay **tres** creatinas Nutrex de 60 servidas en la base, y las otras dos son
> productos legítimamente distintos: la sin sabor ($15.00) y la saborizada ($18.00, con
> Fresa Sandía / Fruit Punch / Mango).

---

## F. Nombre demasiado genérico o posible duplicado — 7 productos

Acá la marca está bien, pero el nombre no alcanza para saber **cuál versión exacta** del
producto es. Muchas marcas tienen varias líneas con nombres parecidos.

| Producto | Marca | Presentación | Precio | Qué verificar |
|---|---|---|---|---|
| Amino Energy | Optimum Nutrition | **falta** | $25.00 | Ya existe otro "Amino Energy" de la misma marca a $34 con 270 gr. ¿Es duplicado o distinta presentación? |
| Whey Protein | Mutant | 5 lb - 61 servidas | $50.00 | ¿Es "Mutant Whey"? Nombre incompleto |
| Whey Protein | Nutrex | 5 lb - 67 servidas | $55.00 | Existe también "100% Whey Protein" de Nutrex en 2 lb. Confirmar si es la misma línea |
| ProSupps Hyde Nightmare | ProSupps | **falta** | $27.50 | Posible duplicado del de abajo — mismo precio |
| ProSupps Hyde Nightmare Intense Energy | ProSupps | **falta** | $27.50 | Posible duplicado del de arriba — mismo precio |
| Mesomorph Pre-Workout | APS Nutrition | **falta** | $10.00 | Precio muy por debajo del resto de pre-entrenos. Verificar producto y precio |
| Revive Vitamin C 200 cápsulas | `Revive` | 200 cápsulas | $13.50 | ¿Es **Revive MD**? Confirmar el nombre completo de la marca |

---

## Resumen

| Bloque | Productos | Dificultad |
|---|---|---|
| A · Marca es un ingrediente | 18 | 🔴 Alta — hace falta ver el envase |
| B · Marca es el nombre del producto | 11 | 🟡 Media — 5 son deducibles |
| C · Marca es un sabor | ~~2~~ → 0 | ✅ Resuelto — marca `Cellucor` aplicada |
| D · Typos y duplicados | 10 | 🟢 Baja — corrección directa |
| E · Registro incompleto | ~~1~~ → 0 | ✅ Resuelto — falta decidir el duplicado |
| F · Nombre genérico o duplicado | 7 | 🟡 Media — comparar con el envase |
| **Total a revisar** | **46** | |
| **Listos para llenado automático** | **62** | |

### Dato aparte: 22 productos sin presentación

La presentación (tamaño / cantidad de servidas) ayuda a identificar el producto exacto y a
escribir un modo de uso correcto. Hay 22 con este campo vacío, y **15 de ellos ya están en
alguno de los bloques de arriba**. Los 7 restantes tienen marca y nombre claros, así que
entran igual al llenado automático — solo que con menos detalle en el modo de uso:

Nutrex BCAA · Nutrex EAA · Nutrex Vitadapt · Nutrex Outrage ·
RAW Nutrition CBUM Essential 30 servidas · Lipodrene Fat Burner · Mutant Big Greens 30 servidas
