// "Sound & music": every audio choice in one sheet, remembered per device.
// Sound effects on or off, Bella's voice on or off, music on or off, its
// volume, and which track.

import { h, sheet } from "./sheets.js";
import { slider, toggle } from "./controls.js";
import { voice, isMuted, setMuted, getVoice, setVoice } from "./fx.js";
import { TRACKS, getMusic, onMusic, setMusicOn, setVolume, setTrack } from "./music.js";

const row = (label, small, control) => h("div", { class: "audio__row" },
  h("span", { class: "audio__label" }, label, small ? h("small", {}, small) : null), control);

export function openAudio() {
  const m = getMusic();

  const sfx = toggle({ on: !isMuted(), label: "Sound effects", onChange: (on) => { setMuted(!on); bella.update(getVoice() === "on", !on); } });
  const bella = toggle({ on: getVoice() === "on", label: "Bella's voice", locked: isMuted(), onChange: (on) => { setVoice(on ? "on" : "off"); if (on) voice("start"); } });

  const musicSwitch = toggle({ on: m.on, label: "Music", onChange: (on) => setMusicOn(on) });
  const vol = slider({ min: 0, max: 100, step: 5, value: Math.round(m.volume * 100), unit: "%", onChange: (v) => setVolume(v / 100) });
  // Live while dragging, not only on letting go.
  vol.querySelector("input").addEventListener("input", (e) => setVolume(Number(e.target.value) / 100));

  const tracks = h("div", { class: "audio__tracks" }, ...TRACKS.map((t) =>
    h("button", { class: "audio__track", type: "button", "data-track": t.id, onclick: () => { setTrack(t.id); } },
      h("span", { class: "audio__eq", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h("span", {}, t.name, h("small", {}, t.note)))));

  const paint = (s) => {
    musicSwitch.update(s.on);
    vol.classList.toggle("is-off", !s.on);
    for (const b of tracks.children) {
      const here = b.dataset.track === s.track;
      b.classList.toggle("is-on", here);
      b.classList.toggle("is-playing", here && s.on && s.playing);
      b.setAttribute("aria-pressed", here);
    }
  };
  paint(m);
  const off = onMusic((s) => { if (tracks.isConnected) paint(s); else off(); });

  sheet({ key: "audio", title: "Sound & music", sub: "Just for you, on this device.",
    body: h("div", { class: "audio" },
      row("Sound effects", "Cards, chips, cheers", sfx),
      row("Bella", "The all-seeing croupier. She calls it as she sees it.", bella),
      row("Music", "Off stops it completely", musicSwitch),
      h("div", { class: "audio__block" }, h("span", { class: "audio__label" }, "Music volume"), vol),
      h("div", { class: "audio__block" }, h("span", { class: "audio__label" }, "Track"), tracks)) });
}
