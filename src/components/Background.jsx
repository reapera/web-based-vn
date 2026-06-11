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
    const url = backgrounds[background.name];
    if (!url) {
      console.warn(`Unknown background: "${background.name}"`);
      return;
    }
    setLayers((prev) => {
      const last = prev[prev.length - 1];
      if (last?.url === url) return prev;
      return [
        ...prev.slice(-1), // keep only the outgoing layer beneath the new one
        { key: ++keyRef.current, url, transition: background.transition, duration: background.duration },
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
            animationDuration: `${layer.duration ?? 800}ms`,
          }}
        />
      ))}
    </div>
  );
}
