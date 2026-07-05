import { useSyncExternalStore } from "react";

export type Orientation = "portrait" | "landscape";

function subscribe(cb: () => void): () => void {
  window.addEventListener("resize", cb);
  window.addEventListener("orientationchange", cb);
  return () => {
    window.removeEventListener("resize", cb);
    window.removeEventListener("orientationchange", cb);
  };
}

function getSnapshot(): Orientation {
  return window.innerWidth > window.innerHeight * 1.15 ? "landscape" : "portrait";
}

/** Reactive viewport orientation (landscape when clearly wider than tall). */
export function useOrientation(): Orientation {
  return useSyncExternalStore(subscribe, getSnapshot, () => "portrait");
}
