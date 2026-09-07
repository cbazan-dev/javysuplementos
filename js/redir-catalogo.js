/* Redirección de /supplements-page.html (la URL vieja del catálogo) a /catalogo/.

   Va en un archivo aparte y no inline porque la CSP del sitio declara
   `script-src 'self'` sin 'unsafe-inline' (ver docs/seguridad-cloudflare.md §1.2):
   un <script> dentro del HTML quedaría bloqueado y la redirección no correría.

   Existe porque el <meta http-equiv="refresh"> del stub PIERDE el query string,
   y los enlaces profundos con filtro (?fam=, ?cat=, ?obj=, ?marca=) están
   repartidos por la home y por los chips de cada página de categoría.

   Esto es la red de seguridad, no el mecanismo principal: el redirect real es un
   301 en Cloudflare (§2.8). Sirve para la ventana entre el deploy y el alta de
   esa regla, y para cualquier visita que llegue al origen sin pasar por el proxy.

   replace() y no href: no deja la URL vieja en el historial, así el botón
   "atrás" del navegador vuelve a la página anterior de verdad y no rebota. */
location.replace("/catalogo/" + location.search + location.hash);
