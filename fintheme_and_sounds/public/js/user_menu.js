/**
 * Shared entry point for this app's Desk menu items (Frappe v16).
 *
 * v15 rendered a Bootstrap navbar, so the theme switcher and Sound Studio
 * injected DOM into `.navbar .navbar-nav.ms-auto` and
 * `.dropdown-navbar-user .dropdown-menu`. v16 replaced the navbar with a
 * left sidebar (frappe/public/js/frappe/ui/sidebar/sidebar.html) and builds
 * the user menu in JS via `frappe.ui.create_menu({menu_items: [...]})` —
 * there is no `.dropdown-menu` element to append to any more.
 *
 * In v16 that menu is assembled by frappe.ui.SidebarHeader (see
 * ui/sidebar/sidebar_header.js) and handed to create_menu from
 * setup_app_switcher(). `frappe.ui.create_menu` is also used for unrelated
 * menus (breadcrumbs, workspace, sidebar items), and the parent element
 * differs between them, so we do NOT match on a selector. We wrap
 * create_menu and identify the user menu structurally: it is the only one
 * carrying an item named "logout". Our items are spliced in just above the
 * divider that precedes it, so Logout stays last.
 */
(function () {
  "use strict";

  const registry = [];
  let wrapped = false;

  function buildItems() {
    // Re-read on every open so labels follow a language change.
    return registry.map((entry) => ({
      name: entry.name,
      label: typeof entry.label === "function" ? entry.label() : entry.label,
      icon: entry.icon,
      onClick: entry.onClick,
    }));
  }

  function isUserMenu(items) {
    return (
      Array.isArray(items) && items.some((item) => item && item.name === "logout")
    );
  }

  function withOurItems(items) {
    // Guard against double-injection if create_menu is wrapped more than once
    // or the same opts object is reused across re-renders.
    const names = new Set(registry.map((entry) => entry.name));
    const next = items.filter((item) => !(item && names.has(item.name)));

    const logoutIndex = next.findIndex((item) => item && item.name === "logout");
    if (logoutIndex === -1) return next;

    // Frappe puts a divider immediately before Logout; insert above it so our
    // items group with Settings/Reload rather than with Logout.
    const prev = next[logoutIndex - 1];
    const insertAt = prev && prev.is_divider ? logoutIndex - 1 : logoutIndex;

    return [
      ...next.slice(0, insertAt),
      ...buildItems(),
      ...next.slice(insertAt),
    ];
  }

  function installHook() {
    if (wrapped) return true;
    if (!window.frappe || !frappe.ui || typeof frappe.ui.create_menu !== "function") {
      return false;
    }

    const original = frappe.ui.create_menu;
    frappe.ui.create_menu = function (opts) {
      try {
        if (opts && isUserMenu(opts.menu_items) && registry.length) {
          opts = Object.assign({}, opts, {
            menu_items: withOurItems(opts.menu_items),
          });
        }
      } catch (err) {
        // A failure here must never stop the Desk from rendering its own menu.
        console.error("Fintheme: failed to extend the user menu", err);
      }
      return original.apply(this, [opts].concat([].slice.call(arguments, 1)));
    };
    frappe.ui.create_menu.__fintheme_wrapped = true;

    wrapped = true;
    return true;
  }

  /**
   * Register an item for the Desk user menu.
   * @param {{name: string, label: string|function, icon: string, onClick: function}} item
   *        `icon` is a lucide icon name (frappe/public/icons/lucide/icons.svg).
   */
  function addUserMenuItem(item) {
    if (!item || !item.name) return;
    const existing = registry.findIndex((entry) => entry.name === item.name);
    if (existing !== -1) {
      registry[existing] = item;
    } else {
      registry.push(item);
    }
    installHook();
  }

  window.fintheme = window.fintheme || {};
  window.fintheme.addUserMenuItem = addUserMenuItem;

  // Install at parse time, NOT on frappe.ready. app_include_js is emitted near
  // the end of desk.html (v16.32 line 65) and runs while the document is still
  // parsing, whereas the Desk constructs the sidebar -- and with it the user
  // menu -- on DOM ready (frappe/public/js/frappe/desk.js:90). Wrapping now
  // guarantees we are in place before that first create_menu call; deferring to
  // frappe.ready would race it and the items would silently never appear.
  // The registering bundles likewise call addUserMenuItem at parse time.
  if (!installHook()) {
    // The desk bundle should already have defined frappe.ui.create_menu by the
    // time we parse. If it somehow has not, fall back to polling.
    let attempts = 0;
    const retry = () => {
      if (installHook()) return;
      if (attempts++ < 40) setTimeout(retry, 250);
    };
    retry();
  }
})();
