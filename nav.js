(function () {
  "use strict";

  const header = document.querySelector("header");
  if (!header) return;

  const main = document.querySelector("main");
  if (main && !main.id) main.id = "main-content";

  if (main && !document.querySelector(".skip-link")) {
    const skipLink = document.createElement("a");
    skipLink.className = "skip-link";
    skipLink.href = "#main-content";
    skipLink.textContent = "Skip to main content";
    document.body.prepend(skipLink);
  }

  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const pages = [
    { href: "index.html", label: "Home" },
    { href: "play.html", label: "Play" },
    { href: "arena.html", label: "Arena" },
    { href: "puzzles.html", label: "Puzzles" },
    { href: "watch.html", label: "Watch" },
    { href: "theory.html", label: "Theory" },
    { href: "profile.html", label: "Profile" },
  ];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function iconButton(id, label, icon) {
    const button = element("button", "cog-btn");
    button.type = "button";
    button.id = id;
    button.setAttribute("aria-label", label);
    button.setAttribute("aria-expanded", "false");
    button.textContent = icon;
    return button;
  }

  function makeDropdown(id, label) {
    const dropdown = element("div", "cog-dropdown hidden");
    dropdown.id = id;
    dropdown.hidden = true;
    dropdown.setAttribute("role", "menu");
    dropdown.setAttribute("aria-label", label);
    return dropdown;
  }

  header.className = "site-header";
  header.replaceChildren();

  const logo = element("a", "logo", "FaithChess");
  logo.href = "index.html";
  logo.setAttribute("aria-label", "FaithChess home");
  const logoMark = element("span", "logo-mark", "♞");
  logoMark.setAttribute("aria-hidden", "true");
  logo.prepend(logoMark);

  const navToggle = element("button", "nav-toggle", "Menu");
  navToggle.type = "button";
  navToggle.id = "navToggle";
  navToggle.setAttribute("aria-controls", "primaryNav");
  navToggle.setAttribute("aria-expanded", "false");

  const nav = element("nav", "nav");
  nav.id = "primaryNav";
  nav.setAttribute("aria-label", "Primary navigation");
  for (const page of pages) {
    const link = element("a", "nav-item", page.label);
    link.href = page.href;
    if (currentPage === page.href) {
      link.classList.add("active");
      link.setAttribute("aria-current", "page");
    }
    nav.appendChild(link);
  }

  const actions = element("div", "nav-actions");
  const navUser = element("span", "nav-username hidden");
  navUser.id = "navUsername";
  actions.appendChild(navUser);

  const inboxWrap = element("div", "settings-wrap");
  const inboxBtn = iconButton("inboxBtn", "Challenges", "✉");
  inboxBtn.setAttribute("aria-controls", "inboxDropdown");
  const inboxBadge = element("span", "inbox-badge hidden", "0");
  inboxBadge.id = "inboxBadge";
  inboxBadge.setAttribute("aria-hidden", "true");
  inboxBtn.appendChild(inboxBadge);
  const inboxDropdown = makeDropdown("inboxDropdown", "Challenges");
  const inboxHeading = element("div", "cog-heading", "Challenges");
  const inboxList = element("div", "inbox-list");
  inboxList.id = "inboxList";
  inboxList.appendChild(element("div", "cog-item cog-note", "No pending challenges"));
  inboxDropdown.append(inboxHeading, inboxList);
  inboxWrap.append(inboxBtn, inboxDropdown);

  const accountWrap = element("div", "settings-wrap");
  const cogBtn = iconButton("cogBtn", "Account and settings", "⚙");
  cogBtn.setAttribute("aria-controls", "cogDropdown");
  const cogDropdown = makeDropdown("cogDropdown", "Account and settings");
  const loginLink = element("a", "cog-item", "Log in");
  loginLink.href = "login.html";
  loginLink.setAttribute("role", "menuitem");
  const signupLink = element("a", "cog-item", "Create account");
  signupLink.href = "signup.html";
  signupLink.setAttribute("role", "menuitem");
  cogDropdown.append(loginLink, signupLink);
  accountWrap.append(cogBtn, cogDropdown);

  actions.append(inboxWrap, accountWrap);
  header.append(logo, navToggle, nav, actions);

  const menus = [
    { button: inboxBtn, dropdown: inboxDropdown },
    { button: cogBtn, dropdown: cogDropdown },
  ];

  function closeMenu(entry, restoreFocus = false) {
    entry.dropdown.hidden = true;
    entry.dropdown.classList.add("hidden");
    entry.button.classList.remove("active");
    entry.button.setAttribute("aria-expanded", "false");
    if (restoreFocus) entry.button.focus();
  }

  function openMenu(entry) {
    for (const other of menus) {
      if (other !== entry) closeMenu(other);
    }
    entry.dropdown.hidden = false;
    entry.dropdown.classList.remove("hidden");
    entry.button.classList.add("active");
    entry.button.setAttribute("aria-expanded", "true");
  }

  for (const entry of menus) {
    entry.button.addEventListener("click", event => {
      event.stopPropagation();
      const wasOpen = entry.button.getAttribute("aria-expanded") === "true";
      if (wasOpen) closeMenu(entry);
      else openMenu(entry);
    });
    entry.dropdown.addEventListener("click", event => event.stopPropagation());
  }

  function closeNavigation() {
    nav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }

  navToggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", event => {
    for (const entry of menus) {
      if (!entry.dropdown.contains(event.target) && event.target !== entry.button) closeMenu(entry);
    }
    if (!nav.contains(event.target) && event.target !== navToggle) closeNavigation();
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    const openMenuEntry = menus.find(entry => entry.button.getAttribute("aria-expanded") === "true");
    if (openMenuEntry) closeMenu(openMenuEntry, true);
    if (nav.classList.contains("open")) {
      closeNavigation();
      navToggle.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) closeNavigation();
  }, { passive: true });
})();
