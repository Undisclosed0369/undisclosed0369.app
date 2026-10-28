// Premium form controls: segmented tabs with a sliding thumb, a slider with
// a live value, and an iOS-style switch. Each renders into a container and
// can be updated in place without losing the user's grip (a slider being
// dragged isn't yanked back by a server update).

import { h } from "./sheets.js";
import { sound } from "./fx.js";

/** options: [{ value, label }] */
export function segmented({ options, value, onChange, locked = false }) {
  const el = h("div", { class: "seg" + (locked ? " is-locked" : ""), role: "tablist" });
  el.append(h("span", { class: "seg__thumb", "aria-hidden": "true" }));
  for (const o of options) {
    el.append(h("button", { type: "button", role: "tab", "data-value": String(o.value),
      onclick: () => { if (String(o.value) !== el.dataset.value) { set(o.value); onChange?.(o.value); } } }, o.label));
  }
  el.style.setProperty("--n", options.length);
  const set = (v) => {
    el.dataset.value = String(v);
    const i = Math.max(0, options.findIndex((o) => String(o.value) === String(v)));
    el.style.setProperty("--i", i);
    for (const b of el.querySelectorAll("button")) {
      const on = b.dataset.value === String(v);
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", on);
    }
  };
  set(value);
  el.update = (v, isLocked = locked) => { set(v); el.classList.toggle("is-locked", isLocked); };
  return el;
}

export function slider({ min, max, step, value, unit = "", format, onChange, locked = false }) {
  const show = format || ((v) => v);
  const out = h("span", { class: "slider__value" });
  const input = h("input", { type: "range", min, max, step, value, "aria-label": "Value", disabled: locked || null });
  const el = h("div", { class: "slider" },
    h("div", { class: "slider__top" }, h("span"), out),
    input,
    h("div", { class: "slider__ends" }, h("span", {}, show(min) + unit), h("span", {}, show(max) + unit)));
  let last = Number(value);
  const paint = (v) => {
    el.style.setProperty("--p", (v - min) / (max - min));
    out.innerHTML = `${show(v)}<small>${unit}</small>`;
  };
  input.addEventListener("input", () => {
    const v = Number(input.value);
    paint(v);
    if (v !== last) { sound("notch"); last = v; }
  });
  const commit = () => { el.classList.remove("is-active"); onChange?.(Number(input.value)); };
  input.addEventListener("pointerdown", () => el.classList.add("is-active"));
  input.addEventListener("change", commit);
  paint(Number(value));
  el.update = (v, isLocked = locked) => {
    input.disabled = isLocked;
    if (el.classList.contains("is-active") || document.activeElement === input && input.matches(":active")) return;
    input.value = v;
    last = Number(v);
    paint(Number(v));
  };
  return el;
}

export function toggle({ on, onChange, label, locked = false }) {
  const el = h("button", { class: "switch" + (on ? " is-on" : ""), type: "button", role: "switch", "aria-checked": on, "aria-label": label, disabled: locked || null });
  const set = (v) => { el.classList.toggle("is-on", v); el.setAttribute("aria-checked", v); };
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const next = !el.classList.contains("is-on");
    set(next);
    onChange?.(next);
  });
  el.update = (v, isLocked = locked) => { set(!!v); el.disabled = isLocked; };
  return el;
}

/** The table rules form: used in the lobby and, for the leader, mid-game. */
export function rulesForm({ settings, editable, playing, send }) {
  const lockedSeats = !editable || playing;
  const row = (label, control, note) => h("div", { class: "setting" }, h("span", { class: "setting__label" }, label, note ? h("em", {}, note) : null), control);
  const mode = segmented({ value: settings.mode, locked: lockedSeats,
    options: [{ value: "players", label: "Players only" }, { value: "mixed", label: "Players + AI" }, { value: "ai", label: "AI only" }],
    onChange: (v) => send({ mode: v }) });
  const seats = segmented({ value: settings.aiSeats, locked: lockedSeats,
    options: [1, 2, 3, 4].map((n) => ({ value: n, label: String(n) })), onChange: (v) => send({ aiSeats: v }) });
  const level = segmented({ value: settings.aiLevel, locked: !editable,
    options: [{ value: "easy", label: "Easy" }, { value: "normal", label: "Normal" }], onChange: (v) => send({ aiLevel: v }) });
  const sets = segmented({ value: settings.winSets, locked: !editable,
    options: [3, 4, 5, 6].map((n) => ({ value: n, label: `${n} sets` })), onChange: (v) => send({ winSets: v }) });
  const timer = slider({ min: 60, max: 300, step: 15, value: settings.turnSeconds, unit: "s", locked: !editable,
    onChange: (v) => send({ turnSeconds: v }) });
  const drawFirst = toggle({ on: settings.drawFirst !== false, label: "Draw first", locked: !editable,
    onChange: (v) => send({ drawFirst: v }) });

  const aiRows = [row("AI players", seats), row("AI skill", level, "Easy plays loose · Normal plays to win")];
  const el = h("div", { class: "rules-form" },
    row("Who's playing", mode, playing ? "set when the cards were dealt" : null),
    ...aiRows,
    row("Sets to win", sets),
    row("Turn timer", timer, "per turn, and per answer"),
    h("div", { class: "setting setting--inline" },
      h("span", { class: "setting__label" }, "Draw first", h("em", {}, "play before drawing and those cards are gone")),
      drawFirst));
  const apply = (s, ed = editable) => {
    mode.update(s.mode, !ed || playing);
    seats.update(s.aiSeats, !ed || playing);
    level.update(s.aiLevel, !ed);
    sets.update(s.winSets, !ed);
    timer.update(s.turnSeconds, !ed);
    drawFirst.update(s.drawFirst !== false, !ed);
    for (const r of aiRows) r.classList.toggle("is-hidden", s.mode === "players");
  };
  apply(settings);
  el.update = apply;
  return el;
}
