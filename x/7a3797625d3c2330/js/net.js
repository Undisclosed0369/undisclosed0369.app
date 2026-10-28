// Talking to the game server: one WebSocket that quietly comes back.
//
// iPhones drop sockets whenever the app goes to the background. The server
// gives 15 seconds before an AI takes the seat, so on every return to the
// page we reconnect straight away and say hello with our seat token.

const local = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/.test(location.hostname);
export const SERVER = local
  ? `${location.protocol}//${location.hostname}:8787`
  : "https://dealbreaker.undisclosed0369.app";

export async function api(path, body) {
  const res = await fetch(SERVER + path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {});
  const data = await res.json().catch(() => ({ error: "The server mumbled something unintelligible." }));
  return { ok: res.ok, status: res.status, ...data };
}

export class Connection {
  constructor(room, hello, onMessage, onStatus) {
    this.room = room;
    this.hello = hello;          // function returning the hello message
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.tries = 0;
    this.closedByUs = false;
    this.open();
    this.onVisible = () => {
      if (document.visibilityState === "visible" && !this.isOpen()) this.open();
    };
    document.addEventListener("visibilitychange", this.onVisible);
    addEventListener("online", this.onVisible);
    this.pinger = setInterval(() => this.send({ t: "ping" }), 25000);
  }

  isOpen() { return this.ws && this.ws.readyState === WebSocket.OPEN; }

  open() {
    clearTimeout(this.retry);
    if (this.ws && this.ws.readyState <= 1) return;
    const url = SERVER.replace(/^http/, "ws") + `/api/rooms/${this.room}/ws`;
    const ws = (this.ws = new WebSocket(url));
    this.onStatus("connecting");
    ws.onopen = () => {
      this.tries = 0;
      this.onStatus("open");
      ws.send(JSON.stringify(this.hello()));
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.onStatus("closed");
      if (this.closedByUs) return;
      // Back off gently: 0.3 s, 0.6 s, 1.2 s … up to 8 s.
      const wait = Math.min(8000, 300 * 2 ** this.tries++);
      this.retry = setTimeout(() => this.open(), wait);
    };
    ws.onerror = () => {};
  }

  send(msg) {
    if (this.isOpen()) { this.ws.send(JSON.stringify(msg)); return true; }
    return false;
  }

  close() {
    this.closedByUs = true;
    clearTimeout(this.retry);
    clearInterval(this.pinger);
    document.removeEventListener("visibilitychange", this.onVisible);
    removeEventListener("online", this.onVisible);
    try { this.ws.close(); } catch { /* already */ }
  }
}
