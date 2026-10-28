// The client's state, shared by every screen: who you are, the room, the
// game as you see it, and G, the slice of it the table modules are given.

import { toast } from "./sheets.js";

export const S = {
  conn: null, joined: false, me: null, leader: false, room: null,
  view: null, moves: [], clock: null, offset: 0, lastTurnMine: false, resultsKey: null,
  drop: null, lobbyForm: null, lobbyFormLeader: null,
};
export const G = {
  get me() { return S.me; }, get view() { return S.view; }, get moves() { return S.moves; }, get room() { return S.room; },
  get myTurn() { return !!S.view && S.view.awaiting.some((a) => a.id === S.me); },
  send(action) { if (!S.conn?.send({ t: "act", action })) toast("Reconnecting… try again in a second.", { bad: true }); },
};
