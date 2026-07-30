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

// Mobile hamburger menu: toggles the collapsible nav panel. The nav is a
// normal flex row on wide viewports (CSS media query) — this only matters
// below the mobile breakpoint.
(() => {
  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("primaryNav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  // Close the menu after navigating (clicking a link) so it doesn't stay
  // open when the next page loads with a fresh, collapsed nav anyway —
  // mainly relevant if the browser restores scroll/DOM state on back-nav.
  nav.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
})();
