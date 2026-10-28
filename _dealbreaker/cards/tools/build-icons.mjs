// Builds the Home Screen app icons from the real cards: a Deal Breaker card
// fanned over the card back, on the site's dark, glowing background.
// Run: node tools/build-icons.mjs (from the cards folder).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, "..", "..", "..", "x", "7a3797625d3c2330");
const OUT = path.join(GAME, "icons");

// A card file as a nested <svg>, so it can be placed and rotated. Each card
// gets its own id prefix so their gradients and clips never collide.
function card(id, prefix, x, y, w, rotate) {
  let s = fs.readFileSync(path.join(GAME, "cards", `${id}.svg`), "utf8");
  s = s.replace(/id="([^"]+)"/g, `id="${prefix}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`);
  const inner = s.slice(s.indexOf(">") + 1, s.lastIndexOf("</svg>"));
  const h = w / 0.64;
  return `<g transform="rotate(${rotate} ${x + w / 2} ${y + h})"><svg x="${x}" y="${y}" width="${w}" height="${h}" viewBox="0 0 640 1000">${inner}</svg></g>`;
}

function icon(size, { padded = false } = {}) {
  const s = 1024;
  // Maskable icons get cropped to a circle on Android, so they sit smaller.
  const w = padded ? 270 : 340;
  const y = (s - w / 0.64) / 2 - 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0" stop-color="#5a2ea8"/><stop offset=".55" stop-color="#24133f"/><stop offset="1" stop-color="#0b0b0e"/>
    </radialGradient>
    <radialGradient id="pink" cx="78%" cy="85%" r="45%"><stop offset="0" stop-color="#e042f5" stop-opacity=".45"/><stop offset="1" stop-color="#e042f5" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#glow)"/>
  <rect width="${s}" height="${s}" fill="url(#pink)"/>
  ${card("back", "b-", s / 2 - w / 2 - w * 0.2, y, w, -13)}
  ${card("action-deal-breaker", "d-", s / 2 - w / 2 + w * 0.2, y - 8, w, 11)}
</svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, opts] of [["icon-180", 180], ["icon-192", 192], ["icon-512", 512], ["icon-maskable-512", 512, { padded: true }]]) {
  const png = new Resvg(icon(size, opts), { fitTo: { mode: "width", value: size } }).render().asPng();
  fs.writeFileSync(path.join(OUT, `${name}.png`), png);
  console.log(name, png.length, "bytes");
}
