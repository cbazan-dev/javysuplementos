/* ============================================================================
   MODO DEL SITIO — interruptor global del sitio público.

   Dos modos:

     "abierto"   El sitio funciona normal.
     "cerrado"   Toda página pública redirige a /construccion.html antes de
                 pintar nada. Nadie ve el catálogo.

   ▸ Para cambiar de modo: la constante MODO, acá abajo. Es la única línea.

   IMPORTANTE — el modo SOLO aplica en producción (javysuplementos.com).
   En los previews de Vercel (ramas de desarrollo) y en localhost el sitio
   está siempre abierto, así se puede trabajar sin que estorbe. Por eso no
   hace falta que la rama de desarrollo y main tengan valores distintos.

   ▸ Para probar un modo donde sea (incluido producción), agrega a la URL:
       ?modo=cerrado   ?modo=abierto
     Queda guardado mientras dure la pestaña. `?ver=javy` sigue funcionando
     como atajo de "abierto".

   Este archivo se carga SIN defer y lo más arriba posible del <head> para que
   el bloqueo ocurra antes de que se pinte la página.
   ============================================================================ */
(function () {
  "use strict";

  /* ↓↓↓ EL INTERRUPTOR ↓↓↓ */
  var MODO = "abierto";
  /* ↑↑↑ "abierto" | "cerrado" ↑↑↑ */

  var PRODUCCION = ["javysuplementos.com", "www.javysuplementos.com"];
  var PAGINA_CERRADO = "/construccion.html";
  var CLAVE = "javy-modo";

  // Páginas que nunca se bloquean (la propia página de aviso y el panel admin).
  var LIBRES = ["/construccion.html", "/login.html", "/admin.html", "/404.html"];

  function overrideDeLaUrl() {
    try {
      var m = /[?&]modo=([a-z-]+)/.exec(window.location.search);
      if (m) {
        window.sessionStorage.setItem(CLAVE, m[1]);
        return m[1];
      }
      if (window.location.search.indexOf("ver=javy") !== -1) {
        window.sessionStorage.setItem(CLAVE, "abierto");
        return "abierto";
      }
      return window.sessionStorage.getItem(CLAVE);
    } catch (e) {
      return null; // sessionStorage bloqueado: se usa el modo configurado.
    }
  }

  var enProduccion = PRODUCCION.indexOf(window.location.hostname) !== -1;
  var modo = overrideDeLaUrl() || (enProduccion ? MODO : "abierto");

  // Cualquier valor que no sea "cerrado" (incluido "solo-lectura", que ya no
  // existe pero puede seguir guardado en sessionStorage de una pestaña vieja)
  // deja el sitio abierto.
  if (modo !== "cerrado") return;

  var ruta = window.location.pathname;
  for (var i = 0; i < LIBRES.length; i++) {
    if (ruta === LIBRES[i]) return;
  }

  window.location.replace(PAGINA_CERRADO);
})();
