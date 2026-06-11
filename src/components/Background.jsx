import { useEffect, useRef, useState } from "react";
import backgrounds from "../data/backgrounds.json";

/**
 * Renders the current background and transitions between them.
 * Transitions: "fade" (crossfade), "wipe" (left-to-right reveal), "none".
 */
export function Background({ background }) {
  const [layers, setLayers] = useState([]); // [{ key, url, transition, duration }]
  const keyRef = useRef(0);

  useEffect(() => {
    if (!background) return;
    // Entries are either a plain URL string or { src, filter } so one image
    // can be reused as e.g. a night variant via a CSS filter.
    const def = backgrounds[background.name];
    if (!def) {
      console.warn(`Unknown background: "${background.name}"`);
      return;
    }
    const url = typeof def === "string" ? def : def.src;
    const filter = typeof def === "string" ? null : (def.filter ?? null);
    setLayers((prev) => {
      const last = prev[prev.length - 1];
      if (last?.url === url && last?.filter === filter) return prev;
      return [
        ...prev.slice(-1), // keep only the outgoing layer beneath the new one
        { key: ++keyRef.current, url, filter, transition: background.transition, duration: background.duration },
      ];
    });
  }, [background]);

  // Drop covered layers once the top one has finished transitioning in.
  useEffect(() => {
    if (layers.length < 2) return;
    const top = layers[layers.length - 1];
    const timer = setTimeout(() => setLayers([top]), (top.duration ?? 800) + 50);
    return () => clearTimeout(timer);
  }, [layers]);

  return (
    <div className="vn-background">
      {layers.map((layer, idx) => (
        <div
          key={layer.key}
          className={`vn-bg-layer ${idx > 0 || layers.length === 1 ? `vn-bg-${layer.transition ?? "fade"}` : ""}`}
          style={{
            backgroundImage: `url(${layer.url})`,
            filter: layer.filter ?? undefined,
            animationDuration: `${layer.duration ?? 800}ms`,
          }}
        />
      ))}
    </div>
  );
}
