// Rows wider than the screen (your sets, the chat reactions): drag them
// sideways with a mouse, pen or finger, flick for a little momentum, or use
// the mouse wheel. The edges fade where there's more to see.
//
//   dragScroll(el, { canStart(event) -> bool, pointerTypes: ["mouse"] })

import { reduceMotion } from "./util.js";

const START = 6; // px before a press becomes a scroll

export function dragScroll(el, { canStart = () => true, pointerTypes = null } = {}) {
  let st = null;
  let glide = 0;
  const overflows = () => el.scrollWidth > el.clientWidth + 1;

  const fade = () => {
    const max = el.scrollWidth - el.clientWidth;
    el.style.setProperty("--fade-l", el.scrollLeft > 2 ? "28px" : "0px");
    el.style.setProperty("--fade-r", el.scrollLeft < max - 2 ? "28px" : "0px");
    el.classList.toggle("can-scroll", overflows());
  };

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (pointerTypes && !pointerTypes.includes(e.pointerType)) return;
    if (!overflows() || !canStart(e)) return;
    cancelAnimationFrame(glide);
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, left: el.scrollLeft, moved: false, v: 0, lx: e.clientX, lt: performance.now() };
  });

  addEventListener("pointermove", (e) => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x;
    if (!st.moved) {
      if (Math.abs(dx) < START || Math.abs(dx) < Math.abs(e.clientY - st.y)) return;
      st.moved = true;
      el.classList.add("is-scrolling");
    }
    e.preventDefault();
    el.scrollLeft = st.left - dx;
    const now = performance.now();
    st.v = st.v * 0.6 + ((e.clientX - st.lx) / Math.max(1, now - st.lt)) * 0.4;
    st.lx = e.clientX;
    st.lt = now;
  }, { passive: false });

  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const { moved, v } = st;
    st = null;
    el.classList.remove("is-scrolling");
    if (!moved) return;
    // A drag isn't a tap: swallow the click it would otherwise make.
    const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
    el.addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 50);
    if (reduceMotion.matches) return;
    let speed = -v * 16;
    const step = () => {
      if (Math.abs(speed) < 0.4) return;
      el.scrollLeft += speed;
      speed *= 0.93;
      glide = requestAnimationFrame(step);
    };
    glide = requestAnimationFrame(step);
  };
  addEventListener("pointerup", end);
  addEventListener("pointercancel", end);

  // A plain mouse wheel scrolls the row sideways.
  el.addEventListener("wheel", (e) => {
    if (!overflows() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });

  el.addEventListener("scroll", fade, { passive: true });
  new ResizeObserver(fade).observe(el);
  new MutationObserver(() => requestAnimationFrame(fade)).observe(el, { childList: true, subtree: true });
  fade();
}
