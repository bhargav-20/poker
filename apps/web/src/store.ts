import { create } from "zustand";
import { PartySocket } from "partysocket";
import { playSound, soundForEvent } from "./sound";
import type {
  ActionType,
  Card,
  GameConfigMsg,
  GameEvent,
  LegalActions,
  PublicTableState,
  ServerMessage,
} from "@poker/shared";

const PARTY_HOST = import.meta.env.VITE_PARTYKIT_HOST ?? "127.0.0.1:1999";

// Stable per-browser identity so reconnects map back to the same seat.
function clientId(): string {
  const k = "poker.pid";
  let id = localStorage.getItem(k);
  if (!id) {
    id = "u_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(k, id);
  }
  return id;
}

// ── Game-event bus (drives PixiJS animations, kept out of React state) ────────
type EventCb = (e: GameEvent) => void;
const eventSubs = new Set<EventCb>();
export function onGameEvent(cb: EventCb): () => void {
  eventSubs.add(cb);
  return () => eventSubs.delete(cb);
}

export type Screen = "home" | "table";

interface GameStore {
  screen: Screen;
  socket: PartySocket | null;
  connected: boolean;
  playerId: string;
  code: string | null;
  name: string;
  state: PublicTableState | null;
  hole: [Card, Card] | null;
  legal: LegalActions | null;
  error: string | null;
  spectating: boolean;

  join(code: string, name: string, config?: GameConfigMsg): void;
  spectate(code: string, name?: string): void;
  sitDown(name: string): void;
  leave(): void;
  start(): void;
  nextHand(): void;
  endGame(): void;
  act(action: ActionType, amount?: number): void;
  requestRebuy(amount: number): void;
  rebuyDecision(playerId: string, approve: boolean): void;
  sitOut(): void;
  sitIn(): void;
  clearError(): void;
}

type SetFn = (partial: Partial<GameStore>) => void;
type GetFn = () => GameStore;

/** Open a socket to a table and wire the shared message handlers. */
function connect(set: SetFn, get: GetFn, room: string, onOpen: (s: PartySocket) => void): PartySocket {
  const socket = new PartySocket({
    host: PARTY_HOST,
    party: "poker-room", // matches the "PokerRoom" Durable Object binding
    room,
    id: get().playerId,
  });
  socket.addEventListener("open", () => {
    set({ connected: true });
    onOpen(socket);
  });
  socket.addEventListener("close", () => set({ connected: false }));
  socket.addEventListener("message", (ev) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(ev.data as string) as ServerMessage;
    } catch {
      return;
    }
    switch (msg.t) {
      case "welcome":
        set({ playerId: msg.playerId, state: msg.state });
        break;
      case "state":
        if (msg.state.phase === "ended") localStorage.removeItem("poker.room");
        set({ state: msg.state });
        break;
      case "hole":
        set({ hole: msg.cards });
        break;
      case "legal":
        if (msg.actions && !get().legal) playSound("turn"); // your turn
        set({ legal: msg.actions });
        break;
      case "event": {
        for (const cb of eventSubs) cb(msg.event);
        const s = soundForEvent(msg.event);
        if (s) playSound(s);
        break;
      }
      case "error":
        set({ error: msg.message });
        break;
    }
  });
  return socket;
}

export const useGame = create<GameStore>((set, get) => ({
  screen: "home",
  socket: null,
  connected: false,
  playerId: clientId(),
  code: null,
  name: "",
  state: null,
  hole: null,
  legal: null,
  error: null,
  spectating: false,

  join(code, name, config) {
    get().socket?.close();
    const room = code.toUpperCase();
    const socket = connect(set, get, room, (s) => {
      s.send(JSON.stringify({ t: "join", name }));
      // Host declares config right after joining (server ignores it from
      // non-hosts and once the game has started).
      if (config) s.send(JSON.stringify({ t: "config", ...config }));
    });
    localStorage.setItem("poker.room", room);
    localStorage.setItem("poker.name", name);
    localStorage.removeItem("poker.spectate");
    set({ socket, code: room, name, spectating: false, screen: "table", hole: null, legal: null });
  },

  spectate(code, name) {
    get().socket?.close();
    const room = code.toUpperCase();
    const socket = connect(set, get, room, () => {}); // watch only — never sends "join"
    localStorage.setItem("poker.room", room);
    localStorage.setItem("poker.spectate", "1");
    if (name) localStorage.setItem("poker.name", name);
    set({
      socket,
      code: room,
      name: name ?? get().name,
      spectating: true,
      screen: "table",
      hole: null,
      legal: null,
    });
  },

  sitDown(name) {
    const s = get().socket;
    if (!s) return;
    localStorage.setItem("poker.name", name);
    localStorage.removeItem("poker.spectate");
    s.send(JSON.stringify({ t: "join", name }));
    set({ spectating: false, name });
  },

  leave() {
    get().socket?.close();
    localStorage.removeItem("poker.room");
    localStorage.removeItem("poker.spectate");
    set({
      socket: null,
      connected: false,
      code: null,
      state: null,
      hole: null,
      legal: null,
      spectating: false,
      screen: "home",
    });
  },

  start() {
    get().socket?.send(JSON.stringify({ t: "start" }));
  },
  nextHand() {
    get().socket?.send(JSON.stringify({ t: "nextHand" }));
  },
  endGame() {
    get().socket?.send(JSON.stringify({ t: "endGame" }));
  },
  act(action, amount) {
    get().socket?.send(JSON.stringify({ t: "action", action, amount }));
    set({ legal: null }); // optimistic: hide controls until server responds
  },
  requestRebuy(amount) {
    get().socket?.send(JSON.stringify({ t: "requestRebuy", amount }));
  },
  rebuyDecision(playerId, approve) {
    get().socket?.send(JSON.stringify({ t: "rebuyDecision", playerId, approve }));
  },
  sitOut() {
    get().socket?.send(JSON.stringify({ t: "sitOut" }));
  },
  sitIn() {
    get().socket?.send(JSON.stringify({ t: "sitIn" }));
  },
  clearError() {
    set({ error: null });
  },
}));

if (import.meta.env.DEV) {
  (globalThis as unknown as { __game: typeof useGame }).__game = useGame;
}

/** Generate a short, human-friendly table code. */
export function makeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
