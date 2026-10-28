// Chat text: Discord-style markdown and emoji.
//
//   **bold**  *italic*  _italic_  __underline__  ~~strike~~  `code`
//   ||spoiler|| (tap to reveal)  links  \* to type a literal star
//   :cat: → 🐱   :thumbsup::skin-tone-3: → 👍🏽
//
// Emoji are always drawn the Apple way: Apple devices use their own emoji
// font; everything else gets Apple's emoji artwork as small images.
// Built with DOM nodes only, never innerHTML, so a message can't inject markup.

import { NAMES, APPLE, SKINS } from "./emoji-data.js";

const APPLE_DEVICE = /Mac|iPhone|iPad|iPod/.test(navigator.platform) || /iPhone|iPad|Macintosh/.test(navigator.userAgent);
const CDN = "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/";
export const TONES = ["\u{1F3FB}", "\u{1F3FC}", "\u{1F3FD}", "\u{1F3FE}", "\u{1F3FF}"];

// ------------------------------------------------------------------ :shortcodes:

/** Swap every complete :name: (and :skin-tone-N: after one) for its emoji. */
export function expandShortcodes(text) {
  return text.replace(/:([a-z0-9_+-]{1,40}):(?::skin-tone-([1-5]):)?/gi, (all, name, tone) => {
    const e = NAMES[name.toLowerCase()];
    if (!e) return all;
    if (!tone) return e;
    return SKINS.has(e) ? addTone(e, TONES[tone - 1]) : e;
  });
}

export function addTone(emoji, tone) {
  // The tone goes right after the first character (dropping a variation selector).
  const [first, ...rest] = [...emoji];
  return first + tone + rest.join("").replace(/^️/, "");
}

/** Names starting with (then containing) what's been typed, most common first. */
export function suggest(partial, max = 6) {
  const q = partial.toLowerCase();
  if (q.length < 2) return [];
  const starts = [], has = [];
  for (const [name, emoji] of Object.entries(NAMES)) {
    if (name.startsWith(q)) starts.push([name, emoji]);
    else if (has.length < max && name.includes(q)) has.push([name, emoji]);
    if (starts.length >= max) break;
  }
  // One entry per emoji: ":joy:" and ":face_with_tears_of_joy:" are the same face.
  const seen = new Set();
  return [...starts, ...has].filter(([, e]) => !seen.has(e) && seen.add(e)).slice(0, max);
}

// ------------------------------------------------------------------ emoji

const EMOJI = /(?:\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/gu;

const hex = (s) => [...s].map((c) => c.codePointAt(0).toString(16).padStart(4, "0")).join("-");

/** The Apple image for an emoji, if there is one. */
export function appleImage(emoji) {
  const full = hex(emoji);
  if (APPLE.has(full)) return CDN + full + ".png";
  const bare = hex(emoji.replace(/️/g, ""));
  if (APPLE.has(bare)) return CDN + bare + ".png";
  const withVs = hex([...emoji][0]) + "-fe0f";
  if ([...emoji].length === 1 && APPLE.has(withVs)) return CDN + withVs + ".png";
  return null;
}

/** Plain text → text and emoji nodes. */
export function emojiNodes(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI)) {
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
    const src = APPLE_DEVICE ? null : appleImage(m[0]);
    if (src) {
      const img = document.createElement("img");
      img.className = "emoji";
      img.src = src;
      img.alt = m[0];
      img.draggable = false;
      img.loading = "lazy";
      // If the image can't load, fall back to the device's own emoji.
      img.onerror = () => img.replaceWith(document.createTextNode(m[0]));
      out.push(img);
    } else {
      const span = document.createElement("span");
      span.className = "emoji-text";
      span.textContent = m[0];
      out.push(span);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)));
  return out;
}

/** Emoji in any element's text get the Apple treatment (used for the reaction buttons). */
export function appleEmoji(el) {
  const text = el.textContent;
  el.replaceChildren(...emojiNodes(text));
}

// ------------------------------------------------------------------ markdown

// Each rule: where it starts, what it becomes. Earliest match wins; on a tie,
// the first rule listed.
const RULES = [
  { re: /\\([\\*_~`|])/y, make: (m) => [document.createTextNode(m[1])] },
  { re: /`([^`\n]+)`/y, tag: "code", raw: true },
  { re: /\|\|(.+?)\|\|/y, tag: "spoiler" },
  { re: /\*\*(.+?)\*\*/y, tag: "strong" },
  { re: /__(.+?)__/y, tag: "u" },
  { re: /~~(.+?)~~/y, tag: "s" },
  { re: /\*(?!\s)(.+?)(?<!\s)\*/y, tag: "em" },
  { re: /(?<![\p{L}\p{N}])_(?!\s)(.+?)(?<!\s)_(?![\p{L}\p{N}])/uy, tag: "em" },
  { re: /https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]/y, link: true },
];
const STARTS = /[\\`|*_~h]/g;

function inline(text) {
  const out = [];
  let plain = "";
  const flush = () => { if (plain) out.push(...emojiNodes(plain)); plain = ""; };
  let i = 0;
  while (i < text.length) {
    STARTS.lastIndex = i;
    const next = STARTS.exec(text);
    if (!next) break;
    plain += text.slice(i, next.index);
    i = next.index;
    let hit = null;
    for (const r of RULES) {
      r.re.lastIndex = i;
      const m = r.re.exec(text);
      if (m) { hit = [r, m]; break; }
    }
    if (!hit) { plain += text[i]; i++; continue; }
    const [r, m] = hit;
    flush();
    if (r.make) out.push(...r.make(m));
    else if (r.link) {
      const a = document.createElement("a");
      a.href = m[0];
      a.textContent = m[0].replace(/^https?:\/\//, "");
      a.target = "_blank";
      a.rel = "noopener noreferrer nofollow";
      out.push(a);
    } else {
      const el = document.createElement(r.tag === "spoiler" ? "span" : r.tag);
      if (r.tag === "spoiler") {
        el.className = "spoiler";
        el.tabIndex = 0;
        el.setAttribute("role", "button");
        el.setAttribute("aria-label", "Spoiler. Tap to reveal.");
        const reveal = () => el.classList.add("is-shown");
        el.addEventListener("click", reveal);
        el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") reveal(); });
      }
      if (r.raw) el.textContent = m[1];
      else el.append(...inline(m[1]));
      out.push(el);
    }
    i += m[0].length;
  }
  plain += text.slice(i);
  flush();
  return out;
}

/** A chat message as nodes: markdown, links and Apple-style emoji. */
export function richText(text) {
  const frag = document.createDocumentFragment();
  frag.append(...inline(text));
  return frag;
}
