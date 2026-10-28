// Rules page: tables from the deck data, search, contents, card zoom.

import { CARDS, COLORS, DECK_SIZE } from "../engine/deck.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// ------------------------------------------------------------------ tables
// Built from deck.js so the rules can never disagree with the game.

const count = (pred) => CARDS.filter(pred).reduce((n, c) => n + c.count, 0);
const deck = {
  total: DECK_SIZE,
  money: count((c) => c.type === "money"),
  property: count((c) => c.type === "property"),
  wild: count((c) => c.type === "wild"),
  rent: count((c) => c.type === "rent"),
  action: count((c) => c.type === "action"),
};
for (const el of $$("[data-deck]")) el.textContent = deck[el.dataset.deck];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

$("#money-table tbody").innerHTML = CARDS.filter((c) => c.type === "money")
  .map((c) => `<tr><td class="num">${c.value}M</td><td class="muted">×${c.count}</td></tr>`).join("");

$("#color-table tbody").innerHTML = Object.entries(COLORS).map(([key, col]) => {
  const names = CARDS.filter((c) => c.type === "property" && c.color === key).map((c) => esc(c.name)).join(", ");
  const steps = col.rent.map((r, i) => `<b title="${i + 1} owned">${r}M</b>`).join("");
  return `<tr><td><span class="swatch"><i style="background:${col.hex}"></i>${col.name}</span></td>` +
    `<td class="num">${col.rent.length}</td><td><span class="rent-steps">${steps}</span></td>` +
    `<td class="muted">${names}</td></tr>`;
}).join("");

const actionRows = CARDS.filter((c) => c.type === "action")
  .map((c) => [c.name, c.value, c.count])
  .concat([["Rent (two colors)", 1, count((c) => c.type === "rent" && c.colors.length === 2)],
    ["Rent (wild)", 3, count((c) => c.id === "rent-any")]])
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
$("#action-table tbody").innerHTML = actionRows
  .map(([name, value, n]) => `<tr><td>${esc(name)}</td><td class="num">${value}M</td><td class="muted">×${n}</td></tr>`).join("");

// ------------------------------------------------------------------ contents

const sections = $$(".rsec");
const toc = $(".rtoc__list");
const chips = $(".rchips");
toc.innerHTML = sections.map((s, i) =>
  `<li data-for="${s.id}"><a href="#${s.id}"><span>${String(i + 1).padStart(2, "0")}</span>${s.dataset.title}</a></li>`).join("");
chips.innerHTML = sections.map((s) => `<a href="#${s.id}" data-for="${s.id}">${s.dataset.title}</a>`).join("");

// Highlight the section being read. The last one to cross the upper third
// of the screen wins. The chip row follows along by scrolling itself only:
// scrollIntoView would move every scroller around it too, and on iPhones
// that cancels the page's own glide to a section, dropping you short of it.
const links = (id) => $$(`[data-for="${id}"]`).map((el) => (el.tagName === "LI" ? el.firstElementChild : el));
let current = null;
function setCurrent(id) {
  if (id === current) return;
  if (current) links(current).forEach((a) => a.classList.remove("is-on"));
  current = id;
  if (!id) return;
  links(id).forEach((a) => a.classList.add("is-on"));
  const chip = $(`.rchips [data-for="${id}"]`);
  if (chip && chips.scrollWidth > chips.clientWidth) {
    chips.scrollTo({ left: chip.offsetLeft - (chips.clientWidth - chip.offsetWidth) / 2, behavior: "smooth" });
  }
}
let gliding = 0;   // while jumping to a section, the spy waits until it lands
// Where a section counts as "being read": a third of the way down, but never
// above where a jump lands it (just under the sticky bar). On a phone held
// sideways a third of the screen is higher than that, so a section you just
// jumped to didn't count yet and the highlight slipped back one.
const landing = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
function spy() {
  if (gliding) return;
  const line = Math.max(window.innerHeight * 0.33, landing() + 24);
  let id = null;
  for (const s of sections) {
    if (s.hidden) continue;
    if (s.getBoundingClientRect().top - line <= 0 || !id) id = s.id;
  }
  // At the very bottom the last sections can't reach the line: the last one wins.
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
    id = [...sections].reverse().find((s) => !s.hidden)?.id || id;
  }
  setCurrent(id);
}

// A chip or contents link: highlight it at once, then glide there. The spy
// sits out the glide (so the highlight doesn't flick through every section
// on the way) and takes over once the page has stopped.
function jump(id) {
  const target = document.getElementById(id);
  if (!target) return;
  setCurrent(id);
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - landing());
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  clearTimeout(gliding);
  let last = -1, still = 0;
  const settle = () => {
    // Done once the page has stopped moving for a moment (or after 2.5 s).
    if (Math.abs(window.scrollY - last) < 1) still++; else still = 0;
    last = window.scrollY;
    // Landed: the section you asked for stays highlighted, even near the end
    // of the page where it can't scroll all the way up to the bar.
    if (still >= 3 || Date.now() - began > 2500) { gliding = 0; setCurrent(id); return; }
    gliding = setTimeout(settle, 80);
  };
  const began = Date.now();
  gliding = setTimeout(settle, 120);
  window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  history.replaceState(null, "", "#" + id);
}
for (const list of [toc, chips]) {
  list.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-for], li[data-for] a");
    if (!a) return;
    e.preventDefault();
    jump(a.closest("[data-for]").dataset.for);
  });
}
addEventListener("scroll", () => requestAnimationFrame(spy), { passive: true });
addEventListener("resize", spy);
spy();

// ------------------------------------------------------------------ search

const input = $("#q");
const box = $(".rsearch");
const empty = $("#empty");
const counter = $("#count");
const rules = $$(".rule");
const original = new Map(rules.map((r) => [r, r.innerHTML]));
// Search the words in each section's heading too, so "rent" finds every
// rule filed under Rent even if the rule never says the word.
const haystack = new Map(rules.map((r) => [r, (r.closest(".rsec").dataset.title + " " + r.textContent).toLowerCase()]));

function highlight(rule, words) {
  const walker = document.createTreeWalker(rule, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest("table, .rcard") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  // The whole phrase first, then single words — and words only where a word
  // starts, so "no" lights up "No" but not the middle of "nothing".
  const quote = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = words.length > 1 ? [words.map(quote).join("\\s+")] : [];
  parts.push(...words.map((w) => "\\b" + quote(w)));
  const pattern = new RegExp("(" + parts.join("|") + ")", "gi");
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!pattern.test(node.nodeValue)) continue;
    pattern.lastIndex = 0;
    const span = document.createElement("span");
    span.innerHTML = esc(node.nodeValue).replace(pattern, "<mark>$1</mark>");
    node.replaceWith(...span.childNodes);
  }
}

function search() {
  const q = input.value.trim().toLowerCase();
  box.classList.toggle("has-text", !!q);
  const words = q.split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const r of rules) {
    r.innerHTML = original.get(r);
    const hit = words.every((w) => haystack.get(r).includes(w));
    r.hidden = !hit;
    if (hit) { shown++; if (words.length) highlight(r, words); }
  }
  for (const s of sections) {
    s.hidden = !$$(".rule", s).some((r) => !r.hidden);
    for (const el of $$(`[data-for="${s.id}"]`)) el.classList.toggle("is-hidden", s.hidden);
  }
  empty.hidden = shown > 0;
  counter.textContent = words.length ? (shown ? `${shown} rule${shown === 1 ? "" : "s"} match “${input.value.trim()}”` : "") : "";
  spy();
}

let timer = 0;
input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(search, 80); });
$(".rsearch__clear").addEventListener("click", () => { input.value = ""; search(); input.focus(); });

// Opened inside the game (rules/?embed, in a full-screen layer): "← Table"
// and Esc close the layer instead of leaving the page, so the game (and its
// music) carries on underneath.
const embedded = new URLSearchParams(location.search).has("embed") && window.parent !== window;
const closeEmbed = () => window.parent.postMessage({ t: "closeRules" }, location.origin);
if (embedded) {
  document.documentElement.classList.add("is-embedded");
  $(".rbar__back")?.addEventListener("click", (e) => { e.preventDefault(); closeEmbed(); });
}

addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if ((e.key === "/" && !typing) || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
    e.preventDefault();
    input.focus();
    input.select();
  } else if (e.key === "Escape") {
    if (!zoom.hidden) return closeZoom();
    if (document.activeElement === input && input.value) { input.value = ""; search(); }
    else if (embedded && document.activeElement !== input) closeEmbed();
    else input.blur();
  }
});

// A search in the address bar (#q=birthday) opens with it filled in, so the
// game can link straight to the rule that matters.
const fromHash = decodeURIComponent((location.hash.match(/q=([^&]+)/) || [])[1] || "");
if (fromHash) { input.value = fromHash; search(); }

// ------------------------------------------------------------------ card zoom

const zoom = $("#zoom");
function closeZoom() {
  zoom.classList.remove("is-open");
  setTimeout(() => { zoom.hidden = true; }, 300);
}
document.addEventListener("click", (e) => {
  const card = e.target.closest(".rcard");
  if (card) {
    const img = card.querySelector("img");
    zoom.firstElementChild.src = img.src;
    zoom.firstElementChild.alt = img.alt;
    zoom.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => zoom.classList.add("is-open")));
  } else if (e.target.closest(".rzoom")) {
    closeZoom();
  }
});
