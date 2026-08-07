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

// Searchable, categorized dropdown for <select data-channel-picker> —
// built from the select's own <option>/<optgroup> markup so the server
// only ever renders one plain <select>, no separate data format to keep in
// sync. The select stays in the DOM (hidden, tabindex -1) as the real form
// field and as the fallback if this script fails to load.
const VOICE_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
const CHEVRON_SVG =
  '<svg class="channel-picker-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
const SEARCH_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

document.querySelectorAll("select[data-channel-picker]").forEach(buildChannelPicker);

function buildChannelPicker(select) {
  select.style.display = "none";
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const wrapper = document.createElement("div");
  wrapper.className = "channel-picker";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "channel-picker-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.innerHTML = `${VOICE_ICON_SVG}<span class="channel-picker-value"></span>${CHEVRON_SVG}`;
  const valueEl = trigger.querySelector(".channel-picker-value");

  // Re-point the field's own <label for> at the trigger button so clicking
  // the label still focuses the (now visible) control.
  if (select.id) {
    const fieldLabel = document.querySelector(`label[for="${select.id}"]`);
    if (fieldLabel) {
      trigger.id = `${select.id}-trigger`;
      fieldLabel.setAttribute("for", trigger.id);
    }
  }

  const menu = document.createElement("div");
  menu.className = "channel-picker-menu";
  menu.hidden = true;

  const searchWrap = document.createElement("div");
  searchWrap.className = "channel-picker-search-wrap";
  const search = document.createElement("input");
  search.type = "search";
  search.className = "channel-picker-search";
  search.placeholder = "Search channels…";
  searchWrap.innerHTML = SEARCH_ICON_SVG;
  searchWrap.appendChild(search);

  const list = document.createElement("div");
  list.className = "channel-picker-list";
  list.setAttribute("role", "listbox");

  const entries = []; // { button, value, label, groupLabelEl }

  function addOption(optionEl, groupLabelEl) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "channel-picker-option";
    button.setAttribute("role", "option");
    button.innerHTML = `${VOICE_ICON_SVG}<span></span>`;
    button.querySelector("span").textContent = optionEl.textContent;
    button.addEventListener("click", () => choose(optionEl.value, optionEl.textContent, button));
    list.appendChild(button);
    entries.push({ button, value: optionEl.value, label: optionEl.textContent.toLowerCase(), groupLabelEl });
  }

  for (const node of Array.from(select.children)) {
    if (node.tagName === "OPTGROUP") {
      const groupLabelEl = document.createElement("div");
      groupLabelEl.className = "channel-picker-group-label";
      groupLabelEl.textContent = node.label;
      list.appendChild(groupLabelEl);
      for (const opt of Array.from(node.children)) addOption(opt, groupLabelEl);
    } else if (node.tagName === "OPTION") {
      addOption(node, null);
    }
  }

  const emptyState = document.createElement("div");
  emptyState.className = "channel-picker-empty";
  emptyState.textContent = "No channels match your search.";
  emptyState.hidden = true;
  list.appendChild(emptyState);

  function choose(value, label, buttonEl) {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    valueEl.textContent = label;
    valueEl.classList.remove("placeholder");
    for (const entry of entries) entry.button.classList.toggle("active", entry.button === buttonEl);
    closeMenu();
    trigger.focus();
  }

  function visibleEntries() {
    return entries.filter((entry) => !entry.button.hidden);
  }

  function setHighlighted(button) {
    for (const entry of entries) entry.button.classList.remove("highlighted");
    if (button) {
      button.classList.add("highlighted");
      button.scrollIntoView({ block: "nearest" });
    }
  }

  function filter(query) {
    const q = query.trim().toLowerCase();
    const groupHasMatch = new Map();
    for (const entry of entries) {
      const visible = !q || entry.label.includes(q);
      entry.button.hidden = !visible;
      if (entry.groupLabelEl) groupHasMatch.set(entry.groupLabelEl, (groupHasMatch.get(entry.groupLabelEl) || false) || visible);
    }
    for (const [groupLabelEl, hasMatch] of groupHasMatch) groupLabelEl.hidden = !hasMatch;
    const visible = visibleEntries();
    emptyState.hidden = visible.length > 0;
    setHighlighted(visible[0]?.button ?? null);
  }

  function openMenu() {
    menu.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    filter("");
    search.focus();
    document.addEventListener("click", onDocClick, true);
  }

  function closeMenu() {
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocClick, true);
  }

  function onDocClick(event) {
    if (!wrapper.contains(event.target)) closeMenu();
  }

  trigger.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));

  search.addEventListener("input", () => filter(search.value));

  wrapper.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      trigger.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
    event.preventDefault();
    const visible = visibleEntries();
    if (visible.length === 0) return;
    const currentIndex = visible.findIndex((entry) => entry.button.classList.contains("highlighted"));

    if (event.key === "Enter") {
      const target = visible[currentIndex]?.button ?? visible[0].button;
      target.click();
      return;
    }

    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = (currentIndex + delta + visible.length) % visible.length;
    setHighlighted(visible[nextIndex].button);
  });

  // Initialize the trigger label/active state from whatever the select
  // already has selected (its first option, absent an explicit default).
  const selected = select.options[select.selectedIndex];
  if (selected) {
    valueEl.textContent = selected.textContent;
    const match = entries.find((entry) => entry.value === selected.value);
    if (match) match.button.classList.add("active");
  } else {
    valueEl.textContent = "Select a channel";
    valueEl.classList.add("placeholder");
  }

  menu.append(searchWrap, list);
  wrapper.append(trigger, menu);
  select.insertAdjacentElement("afterend", wrapper);
}
