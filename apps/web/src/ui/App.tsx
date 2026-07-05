import { useEffect } from "react";
import { useGame } from "../store";
import { unlockAudio } from "../sound";
import { Home } from "./Home";
import { Table } from "./Table";
import { Toast } from "./Toast";

export function App() {
  const screen = useGame((s) => s.screen);

  // Auto-rejoin the last table after a tab close/refresh (identity persists, so
  // the server restores your seat). Falls back to /t/CODE deep-link pre-fill.
  useEffect(() => {
    const savedRoom = localStorage.getItem("poker.room");
    const savedName = localStorage.getItem("poker.name");
    const wasSpectating = localStorage.getItem("poker.spectate") === "1";
    if (savedRoom && wasSpectating) {
      useGame.getState().spectate(savedRoom, savedName ?? undefined);
      return;
    }
    if (savedRoom && savedName) {
      useGame.getState().join(savedRoom, savedName);
      return;
    }
    const m = window.location.pathname.match(/^\/t\/([A-Za-z0-9]+)/);
    if (m) useGame.setState({ code: m[1]!.toUpperCase() });
  }, []);

  // Unlock Web Audio on user gestures (browser autoplay policy; iOS is strict,
  // so we retry on several gesture types rather than once).
  useEffect(() => {
    const onGesture = () => unlockAudio();
    const events = ["pointerdown", "touchend", "click"] as const;
    events.forEach((e) => window.addEventListener(e, onGesture, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, onGesture));
  }, []);

  return (
    <div className="relative h-full w-full">
      {screen === "home" ? <Home /> : <Table />}
      <Toast />
    </div>
  );
}
