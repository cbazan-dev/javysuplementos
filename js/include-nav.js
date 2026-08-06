/* Submenú de categorías bajo "SUPLEMENTOS": dropdown en escritorio, acordeón
   dentro del menú hamburguesa en móvil. Antes el nav no ofrecía ninguna vía a
   las familias — había que entrar al catálogo y descubrir el carrusel. */
async function initCategoriesSubmenu(host) {
  const item = host.querySelector("[data-nav-categories]");
  const list = item?.querySelector(".nav__sub");
  const toggle = item?.querySelector(".nav__sub-toggle");
  if (!item || !list || !toggle || !window.catalogDb?.getCategories) return;

  let categories = [];
  try {
    categories = await window.catalogDb.getCategories();
  } catch (error) {
    console.warn("No se pudieron cargar las categorías del nav:", error.message);
  }

  const families = categories.filter((c) => !c.parent_id);
  if (!families.length) {
    // Sin datos no se ofrece un menú vacío: el enlace directo al catálogo basta.
    toggle.remove();
    return;
  }

  const escapeAttr = (value = "") =>
    String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const slugOf = (c) => String(c.slug || "").replace(/^(fam|tipo)-/, "");

  // Con Supabase caído, getCategories() devuelve la lista plana de respaldo,
  // cuyos slugs ("creatinas", "vitaminas", "accesorios") no tienen página
  // generada: enlazar ahí daría 404. En ese caso se manda al catálogo
  // filtrado, que sí resuelve por texto.
  const hasRealCategories = families.every((f) => f.id);
  const hrefFor = (f) => (hasRealCategories
    ? `/categoria/${encodeURIComponent(slugOf(f))}/`
    : `/supplements-page.html?cat=${encodeURIComponent(slugOf(f))}`);

  list.innerHTML = families
    .map((f) => `<li><a href="${hrefFor(f)}">${escapeAttr(f.name)}</a></li>`)
    .join("")
    + `<li><a class="nav__sub-all" href="/supplements-page.html">Ver todo el catálogo</a></li>`;

  const setOpen = (open) => {
    item.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    list.hidden = !open;
  };

  toggle.addEventListener("click", (event) => {
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
    toggle.focus();
  });
  // Al salir con Tab del último enlace, el menú deja de tener sentido abierto.
  item.addEventListener("focusout", (event) => {
    if (!item.contains(event.relatedTarget)) setOpen(false);
  });
}

(async function () {
  const host = document.getElementById("site-header");
  if (!host) return;

  document.body.classList.add("page-transition");
  const html = await fetch("/Editables/nav.html", { cache: "no-store" }).then((response) => response.text());
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

  const navToggle = document.getElementById("navToggle");
  const navMenu = document.getElementById("navMenu");
  const siteHeader = host.querySelector(".site-header");
  const navToggleIcon = navToggle?.querySelector("[data-javy-icon]");

  const updateHeaderState = () => {
    siteHeader?.classList.toggle("is-scrolled", window.scrollY > 10);
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
