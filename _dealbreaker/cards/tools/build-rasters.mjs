// Pre-renders every card as a picture, so phones never have to draw the
// vector art themselves. The cards are detailed vector drawings (some over a
// hundred curves), and a browser redraws one from scratch at every new size:
// when a seat grows on its turn, every card on it is redrawn on every frame.
// A picture is decoded once and then only scaled, which costs next to nothing.
//
// Two widths, both lossless (the exact pixels the renderer drew):
//   cards/240/<card>.webp  phones, where a card in your hand is at most ~230 px
//   cards/384/<card>.webp  tablets and computers (hand cards up to ~320 px)
// The .svg files stay as they are: they're the source, and the big views
// (the spotlight, a card opened full size) still draw them sharp at any size.
//
// Run: node tools/build-rasters.mjs (from the cards folder). Needs cwebp
// (brew install webp).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CARDS = path.join(HERE, "..", "..", "..", "x", "7a3797625d3c2330", "cards");
const WIDTHS = [240, 384];

const svgs = fs.readdirSync(CARDS).filter((f) => f.endsWith(".svg")).sort();
for (const w of WIDTHS) {
  const dir = path.join(CARDS, String(w));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of svgs) {
    const png = new Resvg(fs.readFileSync(path.join(CARDS, f), "utf8"), { fitTo: { mode: "width", value: w } }).render().asPng();
    const tmp = path.join(dir, f.replace(".svg", ".png"));
    fs.writeFileSync(tmp, png);
    execFileSync("cwebp", ["-quiet", "-lossless", "-z", "9", "-exact", tmp, "-o", tmp.replace(".png", ".webp")]);
    fs.rmSync(tmp);
  }
  const bytes = fs.readdirSync(dir).reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
  console.log(`${w} px: ${svgs.length} cards, ${(bytes / 1024).toFixed(0)} KB`);
}
