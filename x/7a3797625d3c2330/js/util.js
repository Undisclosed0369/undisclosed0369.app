// Small helpers every screen uses, in one place.

/** An element by its id. */
export const $ = (id) => document.getElementById(id);

/** The device asks for less motion (checked live, as `.matches`). */
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

/** localStorage as JSON, quietly doing nothing where it isn't allowed (private mode). */
export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

/** A name as the server compares it: trimmed, single spaces, lower case. */
export const nameKey = (name) => String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
