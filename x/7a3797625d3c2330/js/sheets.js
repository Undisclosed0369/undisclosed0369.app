// Sheets (the glass panels that slide up with choices), toasts, and the
// little helpers for building card elements.

export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") {
      // Custom properties (--x) only work through setProperty.
      for (const [p, val] of Object.entries(v)) p.startsWith("--") ? el.style.setProperty(p, val) : (el.style[p] = val);
    }
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}

/** A card face (or back). `id` is the card instance, `defId` what it is. */
export function cardEl(id, defId, extra = {}) {
  const src = defId ? `cards/${defId}.svg` : "cards/back.svg";
  return h("div", { class: "card", "data-card": id || null, ...extra }, h("img", { src, alt: "", draggable: "false" }));
}

// ------------------------------------------------------------------ sheets

const layer = () => document.getElementById("layer");
let current = null;

/**
 * Open a sheet. Only one at a time: opening another replaces it.
 *   key       - reopening the same key while open does nothing
 *   modal     - no closing by tapping outside (the game is waiting on you)
 *   dialog    - a small centered dialog that draws its own content (no head)
 */
export function sheet({ key = null, title, sub, card, body, center = false, modal = false, dialog = false, onClose } = {}) {
  if (current && key && current.key === key) return current;
  closeSheet(true);

  const scrim = h("div", { class: "scrim", onclick: () => { if (!modal) closeSheet(); } });
  const head = h("div", { class: "sheet__head" },
    card || null,
    h("div", {}, h("p", { class: "sheet__title" }, title || ""), sub ? h("p", { class: "sheet__sub" }, sub) : null),
    modal ? null : h("button", { class: "icon-btn icon-btn--small sheet__close", type: "button", "aria-label": "Close", onclick: () => closeSheet() },
      h("span", { html: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>' })));
  const panel = dialog
    ? h("div", { class: "sheet sheet--dialog", role: "alertdialog", "aria-modal": "true" }, body)
    : h("div", { class: "sheet" + (center ? " sheet--center" : ""), role: "dialog", "aria-modal": "true" }, head, body || null);
  layer().append(scrim, panel);

  const api = {
    key, panel, scrim, modal,
    set(newBody) { panel.replaceChildren(head, newBody); },
    close: () => closeSheet(),
    onClose,
  };
  current = api;
  return api;
}

let closedAt = 0;
/** Milliseconds since the last sheet closed (0 while one is open). Keys that
 *  act on the table wait a beat after one, so the Return that pressed "Pay"
 *  can't carry on and do something else too. */
export const sinceSheet = () => (current ? 0 : performance.now() - closedAt);

export function closeSheet(instant = false) {
  if (!current) return;
  const { panel, scrim, onClose } = current;
  current = null;
  closedAt = performance.now();
  if (instant) { panel.remove(); scrim.remove(); }
  else {
    panel.classList.add("is-out");
    scrim.classList.add("is-out");
    setTimeout(() => { panel.remove(); scrim.remove(); }, 260);
  }
  onClose?.();
}

export const openSheetKey = () => current?.key || null;

/** `primary`: what Return presses on a keyboard (marked with a ↩ keycap). */
/** `safe`: the reassuring way out of a confirmation ("Stay"), tinted to pair with a `danger` choice. */
export function option({ icon, swatch, label, small, onClick, danger, quiet, primary, safe }) {
  return h("button", { class: "option" + (danger ? " option--danger" : "") + (quiet ? " option--quiet" : "") + (safe ? " option--safe" : ""), type: "button", onclick: onClick,
    "data-default": primary || null },
    swatch ? h("span", { class: "option__swatch", style: { background: swatch } }) : null,
    icon ? h("span", { class: "option__icon" }, icon) : null,
    h("span", {}, label, small ? h("small", {}, small) : null),
    primary ? keycap() : null);
}

export const keycap = (key = "↩") => h("kbd", { class: "keycap" + (key.length > 1 ? " keycap--word" : ""), "aria-hidden": "true" }, key);

/** Press a button with a visible tap, then click it. */
export function press(el) {
  el.classList.add("is-pressed");
  setTimeout(() => { el.classList.remove("is-pressed"); el.click(); }, 110);
}

// Was focus last moved with Tab (true) or by a click or tap (false)? Browsers'
// own :focus-visible isn't reliable for this once any key has been pressed.
let tabbed = false;
addEventListener("pointerdown", () => { tabbed = false; }, true);
addEventListener("keydown", (e) => { if (e.key === "Tab") tabbed = true; }, true);

// Keyboard: Return does the sheet's main thing, Esc backs out (unless the
// game is waiting on an answer), and Tab presses a sheet's [data-tab] helper
// ("Pick for me") when it has one. Typing in a field is left alone.
addEventListener("keydown", (e) => {
  if (!current || e.defaultPrevented || e.isComposing || e.repeat) return;
  const typing = e.target.closest?.("input, textarea, [contenteditable]");
  if (e.key === "Escape") {
    if (current.modal) return;
    e.preventDefault();
    // A sheet with its own way out ([data-cancel], e.g. "Never mind") presses it, visibly.
    const cancel = current.panel.querySelector("[data-cancel]");
    if (cancel) press(cancel); else closeSheet();
    return;
  }
  if (e.key === "Tab" && !typing && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const helper = current.panel.querySelector("[data-tab]:not(:disabled)");
    if (helper) { e.preventDefault(); tabbed = false; press(helper); }
    return;
  }
  if (e.key !== "Enter" || typing || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
  // A button you tabbed to gets Enter itself. One that only has focus because
  // it was clicked (a card picked in the pay sheet) doesn't: Return still pays.
  const focused = e.target.closest?.("button");
  if (focused && tabbed && current.panel.contains(focused) && !focused.matches("[data-default]")) return;
  const target = current.panel.querySelector("[data-default]:not(:disabled)");
  if (!target) return;
  e.preventDefault();
  press(target);
});

// ------------------------------------------------------------------ toasts

export function toast(text, { actions = [], ms = 3800, bad = false, sticky = false } = {}) {
  const box = document.getElementById("toasts");
  const el = h("div", { class: "toast" + (bad ? " toast--bad" : "") }, h("span", { class: "toast__text" }, text),
    ...actions.map((a) => h("button", { class: "btn " + (a.primary ? "btn--primary" : "btn--quiet"), type: "button",
      onclick: () => { a.onClick?.(); dismiss(); } }, h("span", {}, a.label))));
  const dismiss = () => { el.classList.add("is-out"); setTimeout(() => el.remove(), 300); };
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  if (!sticky) setTimeout(dismiss, ms);
  return dismiss;
}
