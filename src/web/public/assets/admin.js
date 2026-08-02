// Visual-only feedback for long-running admin actions (e.g. "Check now").
// The form still does a normal POST + redirect — this just disables the
// button and swaps its label immediately so a click doesn't look ignored
// while the request is in flight.
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const loadingText = form.dataset.loadingText;
  if (!loadingText) return;

  const button = form.querySelector('button[type="submit"]');
  if (!(button instanceof HTMLButtonElement)) return;

  button.disabled = true;
  button.textContent = loadingText;
});

// Highlights the sidebar link for the current page. Done client-side so
// every admin route's render call doesn't need to thread the current path
// through to renderAdminPage() — the nav markup is identical everywhere.
(() => {
  const links = document.querySelectorAll("#primaryNav .nav-link");
  const path = location.pathname;
  let best = null;

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("/")) continue; // skip the external Health link
    const matches = href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/");
    if (matches && (!best || href.length > best.getAttribute("href").length)) {
      best = link;
    }
  }

  if (best) best.classList.add("active");
})();

// Mobile sidebar drawer: toggles open/closed via the hamburger button, a
// click on the backdrop, the Escape key, or navigating (clicking a link) —
// the sidebar is a fixed off-canvas panel only below the mobile breakpoint
// (CSS media query); on wide viewports it's always visible and this is inert.
(() => {
  const toggle = document.getElementById("navToggle");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (!toggle || !sidebar || !backdrop) return;

  function setOpen(open) {
    sidebar.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }

  toggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("open")));
  backdrop.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
  sidebar.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) setOpen(false);
  });
})();
