# Guía de seguridad — Cloudflare + Supabase

Esta guía cubre la **configuración de dashboard** (la hace el dueño) que acompaña a los cambios de
código del Bloque 1. El código (CSP por meta-tag, Turnstile en el login) ya está en el repo; aquí
está lo que va en los paneles de Cloudflare y Supabase.

> **Reemplaza `TUDOMINIO.com`** por el dominio real comprado en Cloudflare en todos los pasos.

---

## 1.1 — Poner Cloudflare delante de GitHub Pages

**Objetivo:** servir el sitio a través de Cloudflare (proxy) sin cambiar el deploy de GitHub Pages.

1. **GitHub → repo → Settings → Pages → Custom domain:** escribir `TUDOMINIO.com` y guardar.
   Esto crea/usa el archivo `CNAME` en la raíz del repo (ya versionado).
2. **Cloudflare → DNS → Records:**
   - Registro `CNAME` para el apex: **Name** `@` → **Target** `carlosbazan28.github.io`,
     **Proxy status = Proxied** (nube naranja). Cloudflare hace CNAME flattening en el apex.
   - (Opcional) `CNAME` `www` → `carlosbazan28.github.io`, también Proxied.
3. **Cloudflare → SSL/TLS → Overview:** modo **Full (strict)**.
4. **Cloudflare → SSL/TLS → Edge Certificates:** activar **Always Use HTTPS** y **Automatic HTTPS
   Rewrites**.
5. En GitHub Pages, marcar **Enforce HTTPS** una vez que el certificado esté emitido.

Verificación: `https://TUDOMINIO.com` carga el sitio; el certificado lo emite Cloudflare.

---

## 1.2 — Cabeceras de seguridad (Cloudflare Response Header Rules)

**Cloudflare → Rules → Transform Rules → Modify Response Header → Create rule.**

Crear **dos** reglas de tipo *Set static* (el orden importa: la de admin/login primero).

### Regla A — Admin/login (estricta, anti-clickjacking total)

- **When incoming requests match:**
  `http.request.uri.path in {"/admin.html" "/login.html"}`
- **Then set response headers:**

| Header | Value |
|---|---|
| `Content-Security-Policy` | (ver bloque "CSP admin/login" abajo) |
| `X-Frame-Options` | `DENY` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |

**CSP admin/login** (una sola línea):

```
default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; script-src 'self' https://cdn.jsdelivr.net https://challenges.cloudflare.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://fodwjfiyfmscklqsqrip.supabase.co; connect-src 'self' https://cdn.jsdelivr.net https://fodwjfiyfmscklqsqrip.supabase.co wss://fodwjfiyfmscklqsqrip.supabase.co https://challenges.cloudflare.com https://cloudflareinsights.com; frame-src https://challenges.cloudflare.com
```

### Regla B — Resto del sitio (páginas públicas)

- **When incoming requests match:**
  `not http.request.uri.path in {"/admin.html" "/login.html"}`
- **Then set response headers:**

| Header | Value |
|---|---|
| `Content-Security-Policy` | (ver bloque "CSP público" abajo) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` |

**CSP público** (una sola línea — incluye Meta Pixel y analítica):

```
default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests; script-src 'self' https://cdn.jsdelivr.net https://connect.facebook.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://fodwjfiyfmscklqsqrip.supabase.co https://*.fbcdn.net https://www.facebook.com; media-src 'self' https://fodwjfiyfmscklqsqrip.supabase.co; connect-src 'self' https://cdn.jsdelivr.net https://fodwjfiyfmscklqsqrip.supabase.co wss://fodwjfiyfmscklqsqrip.supabase.co https://cloudflareinsights.com https://www.facebook.com; frame-src 'none'
```

> `media-src` se agregó para permitir los videos de producto autoalojados en Supabase Storage
> (bucket `product-videos`, sección "Aprende sobre tus suplementos" de la home). Sin esto el
> navegador cae a `default-src 'self'` y bloquea la carga de los `<video>`.

### Desplegar la CSP con red de seguridad (Report-Only primero)

1. Antes de enforzar, crea las reglas usando el header **`Content-Security-Policy-Report-Only`**
   en vez de `Content-Security-Policy` (mismo valor).
2. Navega todo el sitio (home con reels, Sobre nosotros, login, panel) y revisa la consola del
   navegador: no debe haber `Refused to load ...`.
3. Cuando esté limpio, renombra el header a `Content-Security-Policy` (enforce).

> Nota: el repo ya trae una CSP **baseline por `<meta>`** en cada HTML. La de Cloudflare la
> refuerza y añade lo que el meta-tag no puede (`frame-ancestors`, HSTS). Si ajustas una, ajusta
> la otra para que no se contradigan.

---

## 1.4 — Rate limiting del login (anti fuerza bruta)

**Cloudflare → Security → WAF → Rate limiting rules → Create rule.**

- **Nombre:** `login-rate-limit`
- **When:** `http.request.uri.path eq "/login.html"`
  (si tu plan lo permite, añade también el path del endpoint de auth de Supabase)
- **Rate:** `10` requests per `1 minute` por `IP`
- **Then:** Block, por `10 minutes`.

Esto frena ataques de fuerza bruta a nivel de red, antes de llegar a Supabase.

---

## 1.4b — Formulario de contacto retirado

`contacto.html` ahora es la página **Sobre nosotros** y no inserta registros en `leads`. La tabla,
sus políticas RLS y la sección Mensajes del panel ya se eliminaron. Si hay una regla de rate
limiting o Managed Challenge exclusiva para los envíos del antiguo formulario, puede retirarse
manualmente de Cloudflare.

---

## 1.5 — Captcha Turnstile en el login

El código ya está listo (`login.html` tiene el widget y el script; `js/login.js` envía el token a
Supabase). Falta crear las llaves y activar el captcha en Supabase.

1. **Cloudflare → Turnstile → Add widget:**
   - **Domain:** `TUDOMINIO.com` (y `localhost` para probar en local).
   - **Widget mode:** Managed.
   - Copia el **Site Key** (público) y el **Secret Key** (privado).
2. **En el repo — `login.html`:** reemplaza el `data-sitekey` de prueba
   (`1x00000000000000000000AA`) por tu **Site Key** real. Bump del `?v=` de `login.js` si tocas algo.
3. **Supabase → Authentication → Settings → Bot and Abuse Protection (Captcha):**
   - Enable Captcha protection = ON.
   - Provider = **Turnstile by Cloudflare**.
   - Pega el **Secret Key**. Guardar.

> Mientras el captcha esté **desactivado** en Supabase, el login funciona igual (el token se
> ignora). Al activarlo, el token pasa a ser obligatorio y el código ya lo envía. El site key de
> prueba del repo "siempre pasa": **debe** reemplazarse por el real antes de depender del captcha.

---

## 2.5 — Analítica (Cloudflare Web Analytics)

Al estar el sitio proxied por Cloudflare, no hace falta pegar ningún script: Cloudflare puede
**inyectar el beacon automáticamente**.

1. **Cloudflare → Analytics & Logs → Web Analytics → Add a site / Enable.**
2. Elige el sitio `javysuplementos.com` y activa **Automatic Setup** (inyección automática).
3. La CSP ya permite `static.cloudflareinsights.com` (script) y `cloudflareinsights.com` (beacon),
   así que no se rompe nada.

Es gratis, sin cookies y no requiere banner de consentimiento.

---

## 2.6 — Redirecciones SEO de categorías retiradas

GitHub Pages no permite respuestas 301 configurables. Crear estas reglas en
**Cloudflare → Rules → Redirect Rules → Create rule**, con estado **301 - Permanent Redirect**
y preservando los parámetros de consulta:

| Path de origen | Destino |
| --- | --- |
| `/categoria/whey/` | `/categoria/proteinas/` |
| `/categoria/iso-aislada/` | `/categoria/proteinas/` |
| `/categoria/mass-gainer/` | `/categoria/proteinas/` |
| `/categoria/ganadores-de-peso/` | `/categoria/proteinas/` |
| `/categoria/energia-y-rendimiento/` | `/categoria/pre-entrenos/` |
| `/categoria/pre-entrenos-y-energia/` | `/categoria/pre-entrenos/` |

> **Cambio del 2026-09-06 — hay que EDITAR reglas ya existentes, no solo agregar.**
> La familia volvió a llamarse **Pre-entrenos**, así que los dos sentidos se invirtieron:
>
> - **BORRAR** la regla `/categoria/pre-entrenos/` → `/categoria/pre-entrenos-y-energia/`.
>   `/categoria/pre-entrenos/` es hoy una página **real y viva**; esa regla la secuestra, y
>   encima apunta a una URL que ya no existe (doble falla: 301 a un 404).
> - **CAMBIAR** el destino de `/categoria/energia-y-rendimiento/` a `/categoria/pre-entrenos/`.
> - **AGREGAR** `/categoria/pre-entrenos-y-energia/` → `/categoria/pre-entrenos/`.

Las páginas HTML de respaldo mantienen `canonical` y `noindex, follow` por compatibilidad,
pero la respuesta 301 debe ser la señal principal. Verificar cada regla con una solicitud HEAD
después de publicarla.

---

## 2.7 — Redirecciones SEO de productos dados de baja

Mismo problema que la 2.6, pero para fichas de producto — y con una diferencia importante:
las categorías retiradas **sí** tienen respaldo en el repo (`LEGACY_CATEGORY_REDIRECTS` en
`scripts/generate-pages.mjs` les deja una página con `canonical` + `noindex, follow`), mientras que
un producto dado de baja **no deja nada**: `generate-pages.mjs` borra `producto/` entero en cada
corrida y lo regenera desde Supabase, así que su URL pasa directo a 404.

Las de abajo son las fichas dadas de baja que siguen sin página. Todas estuvieron publicadas en
`sitemap.xml`, o sea que Google las tiene indexadas. El destino de cada una es la categoría que
la propia ficha declaraba en su breadcrumb.

> **Una regla de esta tabla se BORRA cuando el producto vuelve.** Un producto reactivado en el
> panel recupera su página `/producto/<slug>/` en la siguiente regeneración, pero si la regla 301
> sigue viva en Cloudflare **secuestra esa URL** y la página nueva nunca se puede visitar. Pasó de
> verdad: en la regeneración del 2026-09-06 volvieron **39** de las fichas que estaban en esta
> tabla, y hubo que quitarlas. Antes de tocar Cloudflare, correr siempre:
>
> ```bash
> grep -oE '/producto/[a-z0-9-]+/' docs/seguridad-cloudflare.md | sed 's#/producto/##; s#/##' \
>   | sort -u | while read s; do [ -d "producto/$s" ] && echo "BORRAR REGLA: /producto/$s/"; done
> ```

Crear las reglas en **Cloudflare → Rules → Redirect Rules → Create rule** con estado
**301 - Permanent Redirect**, preservando los parámetros de consulta. Si son demasiadas para el
plan contratado (Redirect Rules tiene cupo bajo), usar **Bulk Redirects**, que acepta la lista
completa de una vez.

> **Nota:** los `redirects` de `vercel.json` **no sirven para esto**. Solo corren en los previews
> de Vercel; producción es GitHub Pages tras Cloudflare.

| Path de origen (404 hoy) | Destino |
| --- | --- |
| `/producto/nutrex-glutamine-300-g-60-servidas/` | `/categoria/aminoacidos/` |
| `/producto/nutrex-creatina-para-mujer-327-g/` | `/categoria/creatina/` |
| `/producto/olympus-creatina-para-mujer-30-servidas/` | `/categoria/creatina/` |
| `/producto/nutrex-t-up-max-60-capsulas/` | `/categoria/potenciadores-hormonales/` |
| `/producto/nutrex-tribulus-90-capsulas/` | `/categoria/potenciadores-hormonales/` |
| `/producto/nutricost-l-arginine-citruline-120-tabletas/` | `/categoria/pre-entrenos-y-energia/` |
| `/producto/raw-nutrition-cbum-essential-30-servidas/` | `/categoria/pre-entrenos-y-energia/` |
| `/producto/skull-pre-workout-xtreme/` | `/categoria/pre-entrenos-y-energia/` |
| `/producto/mutant-hardcore-whey/` | `/categoria/proteinas/` |
| `/producto/mutant-mass-5-lb/` | `/categoria/proteinas/` |
| `/producto/mutant-whey-10-lb/` | `/categoria/proteinas/` |
| `/producto/mutant-whey-cookies-cream-flavor-5-lb/` | `/categoria/proteinas/` |
| `/producto/mutant-whey-triple-chocolate-flavor-5-lb/` | `/categoria/proteinas/` |
| `/producto/mutant-whey-vanilla-ice-cream-flavor-5-lb/` | `/categoria/proteinas/` |
| `/producto/prosupps-whey-protein-2-lb/` | `/categoria/proteinas/` |
| `/producto/nutrex-cla-1000-180-capsulas/` | `/categoria/quemadores/` |
| `/producto/mutant-big-greens-246-g/` | `/categoria/salud-y-bienestar/` |
| `/producto/potassium-99-mg-240-capsulas/` | `/categoria/salud-y-bienestar/` |
| `/producto/primaforce-tudca-500-mg-30-capsulas/` | `/categoria/salud-y-bienestar/` |
| `/producto/aps-nutrition-mesomorph-pre-workout/` | `/categoria/pre-entrenos/` |
| `/producto/bsn-syntha-6-4-lb/` | `/categoria/proteinas/` |
| `/producto/isopure-protein-powder-42-servidas/` | `/categoria/proteinas/` |
| `/producto/mutant-mass-extreme-2500-12-lb/` | `/categoria/proteinas/` |
| `/producto/mutant-whey-protein-5-lb/` | `/categoria/proteinas/` |
| `/producto/nutrex-carniburn-31-servidas/` | `/categoria/quemadores/` |
| `/producto/nutrex-lipo-6-black-60-capsulas/` | `/categoria/quemadores/` |
| `/producto/nutricost-casein-5-lb/` | `/categoria/proteinas/` |
| `/producto/nutricost-performance-creatina-monohidratada-44-servidas/` | `/categoria/creatina/` |
| `/producto/olympus-creatine-60-servidas/` | `/categoria/creatina/` |
| `/producto/optimum-nutrition-whey-gourmet-series-24-servidas/` | `/categoria/proteinas/` |
| `/producto/ronnie-coleman-creatina-adventure-60-servidas/` | `/categoria/creatina/` |

Verificar cada regla con una solicitud HEAD después de publicarla:

```bash
curl -sI https://javysuplementos.com/producto/nutrex-glutamine-300-g-60-servidas/ | head -1
# esperado: HTTP/2 301
curl -sI https://javysuplementos.com/producto/nutrex-glutamine-300-g-60-servidas/ | grep -i location
# esperado: location: /categoria/aminoacidos/
```

**Cada vez que se den de baja más productos hay que ampliar esta tabla.** El paso está
documentado en el `README.md`, en la sección de `generate-pages.mjs`.

---

## 2.8 — Redirección del catálogo a /catalogo/

El catálogo dejó de ser `supplements-page.html` en la raíz y pasó a la carpeta física
`catalogo/index.html`, servida en `/catalogo/`. Era la URL con más peso SEO del sitio
(prioridad 0.9 en el sitemap), así que el 301 no es opcional.

**Dar de alta esta regla SOLO después de confirmar que `/catalogo/` responde 200 en producción.**

**Cloudflare → Rules → Redirect Rules → Create rule**

| Campo | Valor |
| --- | --- |
| Nombre | `Catálogo: /supplements-page.html → /catalogo/` |
| Expresión | `http.request.uri.path eq "/supplements-page.html"` |
| Tipo | Static |
| URL destino | `https://javysuplementos.com/catalogo/` |
| Código | **301 – Permanent Redirect** |
| Preserve query string | **ON** |

`Preserve query string` en ON es imprescindible: los enlaces profundos con filtro
(`?fam=`, `?cat=`, `?obj=`, `?marca=`) están repartidos por la home y por los chips de
cada página de categoría. Sin eso, todos caen al catálogo sin filtrar.

No hace falta regla para `/catalogo` sin barra final: GitHub Pages ya emite ese 301.

Mientras la regla no exista, `supplements-page.html` queda como página puente con
`noindex, follow`, `canonical` a `/catalogo/` y `/js/redir-catalogo.js` (externo, porque la
CSP no permite scripts inline) que redirige conservando el query string. Es red de
seguridad, no reemplazo del 301.

Verificación:

```bash
curl -sI https://javysuplementos.com/catalogo/ | head -1
curl -sI https://javysuplementos.com/supplements-page.html | grep -iE "^HTTP|location"
curl -sI "https://javysuplementos.com/supplements-page.html?fam=proteinas" | grep -i location
```

---

## 3.1 — Caché de assets (evitar el "panel en negro" tras un deploy)

**Síntoma:** tras desplegar, el panel admin se queda en negro en el navegador normal pero
funciona en incógnito.

**Causa:** el sitio se sirve por **GitHub Pages detrás de Cloudflare** (el `vercel.json` del repo
**no se usa** en producción — GitHub Pages no lo lee; quedó como referencia, no como config real).
Cloudflare cachea los `.js`/`.css` con `Cache-Control: max-age=14400` (**4 horas**) y **sin
`must-revalidate`**. Cuando despliegas, el navegador baja el `main.js` nuevo (su URL cambia con el
`?v=`), pero los `import "./..."` internos sin versión se sirven de esa caché de 4 h → versión
vieja. `main.js` nuevo + módulos viejos = el grafo no monta = pantalla negra. En incógnito no hay
caché → todo fresco → funciona.

**Mitigación en código (ya aplicada y automatizada):** todos los `import` de `js/admin/*` llevan
un token de versión compartido (`?v=adm-<hash>`), igual que el script de entrada en `admin.html`.
El token **ya no se edita a mano**: `scripts/bump-admin-version.mjs` lo recalcula como hash del
contenido de los módulos, y `scripts/guardar.sh` (el comando `/guardar`) lo corre en cada guardado.
Además, `js/admin/boot-guard.js` carga el panel con `import()` dinámico: si aun así el grafo no
carga (caché vieja, 404), el gate muestra un error con botón **Reintentar** en vez de quedar en
negro.

**Después del primer deploy de este cambio:** hacer **una vez** *Caching → Purge Everything* en
Cloudflare, para limpiar los `?v=adm1` viejos y el `admin.html` cacheado.

**Arreglo de raíz en Cloudflare (recomendado, una sola vez):** que Cloudflare deje de cachear los
assets 4 h sin revalidar.

**Cloudflare → Caching → Cache Rules → Create rule:**

- **Nombre:** `assets-revalidate`
- **When incoming requests match:**
  `http.request.uri.path.extension in {"js" "mjs" "css" "html"}`
- **Then:**

| Ajuste | Valor |
|---|---|
| Cache eligibility | Eligible for cache |
| Edge TTL | Respect origin TTL |
| **Browser Cache TTL** | **Respect origin TTL** (o `No cache` si quieres ser estricto) |

Con esto Cloudflare respeta el `max-age=600` (10 min) de GitHub Pages en vez de forzar 4 h, y el
navegador revalida pronto. Combinado con el token de versión del código, el panel ya no se queda
en negro tras un deploy.

Verificación:
`curl -sI https://javysuplementos.com/js/admin/main.js | grep -i cache-control`
→ ya **no** debe mostrar `max-age=14400`.

---

## Verificación final

- `https://securityheaders.com/?q=https://TUDOMINIO.com` → calificación A o superior.
- `curl -sI https://TUDOMINIO.com/admin.html | grep -i -E "x-frame|content-security|strict-transport"`
  muestra `X-Frame-Options: DENY` y la CSP estricta.
- Login: el widget de Turnstile aparece; un login válido entra; tras un fallo el widget se reinicia.
- Consola del navegador sin violaciones de CSP en home (reels), contacto (mapa), login y panel.
