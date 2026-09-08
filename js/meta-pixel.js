/* Meta Pixel se carga desde un archivo local para cumplir la CSP sin permitir
   scripts inline. No contiene datos de clientes ni identificadores privados. */
(() => {
  if (window.fbq) return;

  const fbq = function metaPixelQueue() {
    if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
    else fbq.queue.push(arguments);
  };
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  fbq("init", "3272013799852736");
  fbq("track", "PageView");
})();
