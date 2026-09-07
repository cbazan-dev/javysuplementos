/* Submenú de categorías bajo "SUPLEMENTOS": dropdown en escritorio, acordeón
   dentro del menú hamburguesa en móvil. Antes el nav no ofrecía ninguna vía a
   las familias — había que entrar al catálogo y descubrir el carrusel. */
async function initCategoriesSubmenu(host) {
  const item = host.querySelector("[data-nav-categories]");
  const trigger = item?.querySelector(".nav__has-sub-trigger");
  const list = item?.querySelector(".nav__sub");
  // Sin catalogDb (p. ej. una página que no cargó js/db.js) el trigger se
  // queda como el <a> normal que ya es en el HTML: navega al catálogo en
  // vez de quedar como un control muerto.
  if (!item || !trigger || !list || !window.catalogDb?.getCategories) return;

  let categories = [];
  try {
    categories = await window.catalogDb.getCategories();
  } catch (error) {
    console.warn("No se pudieron cargar las categorías del nav:", error.message);
  }

  const families = categories.filter((c) => !c.parent_id);
  if (!families.length) {
    // Sin datos no se ofrece un menú vacío: el enlace directo al catálogo basta.
    return;
  }

  const escapeAttr = (value = "") =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  // Las páginas /categoria/<slug>/ se generan a partir del NOMBRE (ver
  // scripts/generate-pages.mjs), no de la columna `slug` de Supabase
  // (fam-/tipo-): usar esa columna manda a URLs que no existen (404).
  const slugOf = (c) =>
    String(c.name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  // Con Supabase caído, getCategories() devuelve la lista plana de respaldo,
  // cuyos slugs ("creatinas", "vitaminas", "accesorios") no tienen página
  // generada: enlazar ahí daría 404. En ese caso se manda al catálogo
  // filtrado, que sí resuelve por texto.
  const hasRealCategories = families.every((f) => f.id);
  const hrefFor = (f) => (hasRealCategories
    ? `/categoria/${encodeURIComponent(slugOf(f))}/`
    : `/catalogo/?cat=${encodeURIComponent(slugOf(f))}`);

  const catalogIcon = window.javyIcons?.get?.("grid", "btn-icon nav__sub-all-icon") || "";
  const chevronIcon = window.javyIcons?.get?.("chevron-right", "btn-icon nav__sub-all-chevron") || "";
  list.innerHTML = `<li><a class="nav__sub-all" href="/catalogo/">${catalogIcon}<span class="nav__sub-all-label">Ver catálogo completo</span>${chevronIcon}</a></li>`
    + families
      .map((f) => `<li><a href="${hrefFor(f)}">${escapeAttr(f.name)}</a></li>`)
      .join("");

  const setOpen = (open) => {
    item.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      list.hidden = false;
      // Doble rAF: si la clase se agrega en el mismo tick que se quita
      // [hidden], el navegador puede colapsar el estado inicial (opacity:0
      // en css/components/nav.css) y la transición no se ve -arranca ya en
      // opacity:1-. Mismo patrón que el badge de visitas del hero.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => list.classList.add("nav__sub--in"));
      });
    } else {
      list.classList.remove("nav__sub--in");
      list.hidden = true;
    }
  };

  // Con categorías disponibles, "SUPLEMENTOS" abre el submenú en vez de
  // navegar directo; "Ver todo el catálogo" (dentro del submenú) sigue
  // siendo la vía para ir al listado completo.
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    setOpen(list.hidden);
  });

  // Cierra al hacer clic fuera y con Escape (mismo patrón que el menú del panel).
  document.addEventListener("click", (event) => {
    if (!item.contains(event.target)) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || list.hidden) return;
    setOpen(false);
    trigger.focus();
  });
  // Al salir con Tab del último enlace, el menú deja de tener sentido abierto.
  item.addEventListener("focusout", (event) => {
    if (!item.contains(event.relatedTarget)) setOpen(false);
  });
}

// Cuenta 1 visita por navegador por día, no por carga de página: un refresh
// no debe inflar el número. El dedupe real vive en Supabase
// (unique(visitor_id, day) + on conflict do nothing en record_visit()); acá
// solo se genera/persiste el visitor_id y se dispara el RPC, sin bloquear
// nada visual — si falla (offline, RPC caída) se reintenta en la próxima carga.
function recordVisit() {
  if (!window.supabaseClient) return;
  const KEY = "javy_visitor_id";
  let visitorId = localStorage.getItem(KEY);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(KEY, visitorId);
  }
  window.supabaseClient.rpc("record_visit", { p_visitor_id: visitorId }).then(({ error }) => {
    if (error) console.warn("No se pudo registrar la visita:", error.message);
  });
}
recordVisit();

(async function () {
  const host = document.getElementById("site-header");
  if (!host) return;

  document.body.classList.add("page-transition"); // opacity: 0

  // El fetch DEBE ir protegido: el body ya está en opacity 0 y la clase que lo
  // vuelve visible (page-transition-in) se añade al final de esta IIFE. Si el
  // fetch rechaza (offline, 404, despliegue parcial, CSP) la función aborta y
  // la página entera queda invisible, sin nav y sin cotización.
  let html = "";
  try {
    const response = await fetch("/Editables/nav.html?v=sin-testimonios-1");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch (error) {
    console.warn("No se pudo cargar el nav:", error.message);
    document.body.classList.add("page-transition-in"); // la página sigue usable sin nav
    return;
  }

  host.innerHTML = html;
  window.javyIcons?.enhance?.(host);
  document.dispatchEvent(new CustomEvent("javy:nav-ready"));

  const adminLinks = host.querySelectorAll(".admin-nav-btn[href]");

  const setAdminLinks = (text, href) => {
    adminLinks.forEach((link) => {
      const iconName = href.includes("admin") ? "layout-dashboard" : "log-in";
      const icon = window.javyIcons?.get?.(iconName, "btn-icon admin-nav-btn__icon") || "";
      link.href = href;
      link.innerHTML = `
        ${icon}
        <span>${text}</span>
      `;
      link.classList.remove("is-auth-checking");
      link.removeAttribute("aria-busy");
    });
  };

  const setAdminLinksChecking = () => {
    adminLinks.forEach((link) => {
      link.classList.add("is-auth-checking");
      link.setAttribute("aria-busy", "true");
    });
  };

  const updateAdminEntryState = async () => {
    if (!adminLinks.length || !window.javyAuth?.hasSupabase?.()) return;

    try {
      setAdminLinksChecking();
      const { session, profile } = await window.javyAuth.getCurrentAdminSession();
      if (session && profile) {
        setAdminLinks("Panel administrativo", "admin.html");
        return;
      }

      setAdminLinks("Iniciar sesión", "login.html");
    } catch (error) {
      console.warn("No se pudo verificar la sesion administrativa:", error.message);
      setAdminLinks("Iniciar sesión", "login.html");
    }
  };

  updateAdminEntryState();
  initCategoriesSubmenu(host);

  if (window.supabaseClient?.auth?.onAuthStateChange) {
    window.supabaseClient.auth.onAuthStateChange(() => {
      updateAdminEntryState();
    });
  }

  // Actualiza el contador apenas cargue el nav compartido.
  window.consultation?.updateBadge?.();

  const consultationBtn = document.getElementById("consultationBtn") || document.getElementById("cartBtn");
  consultationBtn?.addEventListener("click", () => {
    window.consultation?.openPanel?.();
  });

  const themeToggle = document.getElementById("themeToggle");
  const themeToggleIcon = themeToggle?.querySelector("[data-javy-icon]");

  const syncThemeToggle = () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    themeToggle?.setAttribute("aria-pressed", String(isLight));
    themeToggle?.setAttribute("aria-label", isLight ? "Cambiar a modo oscuro" : "Cambiar a modo claro");
    themeToggleIcon?.setAttribute("data-javy-icon", isLight ? "sun" : "moon");
    window.javyIcons?.enhance?.(themeToggle || document);
  };

  syncThemeToggle();

  themeToggle?.addEventListener("click", () => {
    const isLight = document.documentElement.getAttribute("data-theme") === "light";
    if (isLight) {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", "light");
    }
    try {
      localStorage.setItem("javy-theme", isLight ? "dark" : "light");
    } catch (error) {
      // Sin localStorage: el tema cambia igual, solo que no se recuerda para la próxima visita.
    }
    syncThemeToggle();
  });

  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");
  const siteHeader = host.querySelector(".site-header");
  const navToggleIcon = navToggle?.querySelector("[data-javy-icon]");

  const updateHeaderState = () => {
    if (!siteHeader) return;
    // Histéresis para evitar parpadeo cuando el scroll queda justo en el umbral
    // (achicar el header sticky reacomoda el contenido y hace oscilar scrollY).
    const isScrolled = siteHeader.classList.contains("is-scrolled");
    if (!isScrolled && window.scrollY > 24) {
      siteHeader.classList.add("is-scrolled");
    } else if (isScrolled && window.scrollY < 8) {
      siteHeader.classList.remove("is-scrolled");
    }
  };

  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  navMenu?.querySelectorAll("a[href]").forEach((link) => {
    const href = link.getAttribute("href") || "";
    const linkPage = href.split("#")[0] || "index.html";
    const linkHash = href.includes("#") ? `#${href.split("#")[1]}` : "";
    const isSamePage = linkPage === currentPage || (currentPage === "" && linkPage === "index.html");
    const isActiveHash = linkHash && window.location.hash === linkHash;
    const isActivePage = isSamePage && !linkHash;

    if (isActiveHash || isActivePage) {
      link.classList.add("is-active");
    }
  });

  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });

  const setNavToggleState = (isOpen) => {
    navToggle?.setAttribute("aria-expanded", String(isOpen));
    navToggle?.classList.toggle("is-open", isOpen);
    navMenu?.classList.toggle("is-open", isOpen);
    navToggleIcon?.setAttribute("data-javy-icon", isOpen ? "x" : "menu");
    window.javyIcons?.enhance?.(navToggle || document);
  };

  navToggle?.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    setNavToggleState(!isOpen);
  });

  navMenu?.addEventListener("click", (event) => {
    if (!(event.target instanceof HTMLAnchorElement)) return;
    // El trigger de "SUPLEMENTOS" es un <a>, pero cuando abre el submenú
    // (en vez de navegar) no debe cerrar el menú hamburguesa completo.
    if (event.target.closest(".nav__has-sub-trigger") && event.defaultPrevented) return;

    setNavToggleState(false);
  });

  window.navigateWithTransition = (url) => {
    document.body.classList.add("page-transition-out");
    window.setTimeout(() => {
      window.location.href = url;
    }, 170);
  };

  // Al restaurar desde el bfcache (gesto de "atrás"), el body conserva
  // page-transition-out (opacity 0) y el script no se re-ejecuta -> pantalla negra.
  // Reponemos la visibilidad cuando la página viene del cache.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      document.body.classList.remove("page-transition-out");
      document.body.classList.add("page-transition-in");
    }
  });

  document.addEventListener("click", (event) => {
    // Otros handlers (p. ej. el toggle del submenú de "SUPLEMENTOS") pueden
    // haber cancelado el click a propósito para no navegar; respetarlo.
    if (event.defaultPrevented) return;

    const link = event.target.closest?.("a[href]");
    if (!link) return;

    const href = link.getAttribute("href");
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("http") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      link.target === "_blank"
    ) {
      return;
    }

    const targetUrl = new URL(href, window.location.href);
    if (targetUrl.pathname === window.location.pathname && targetUrl.hash) return;

    event.preventDefault();
    window.navigateWithTransition(targetUrl.href);
  });

  requestAnimationFrame(() => {
    document.body.classList.add("page-transition-in");
  });
})();
