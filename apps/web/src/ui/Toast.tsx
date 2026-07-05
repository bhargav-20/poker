import { useEffect } from "react";
import { useGame } from "../store";

export function Toast() {
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(clearError, 3000);
    return () => clearTimeout(t);
  }, [error, clearError]);

  if (!error) return null;
  return (
    <div className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2">
      <div className="rounded-lg border border-red-500/40 bg-red-950/90 px-4 py-2 text-sm font-medium text-red-100 shadow-lg backdrop-blur">
        {error}
      </div>
    </div>
  );
}
