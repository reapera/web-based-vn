import { useEffect, useRef } from "react";
import characters from "../data/characters.json";
import { playAnimation } from "../engine/animations";

const POSITIONS = {
  left: "12%",
  centerLeft: "32%",
  center: "50%",
  centerRight: "68%",
  right: "88%",
};

/**
 * One character on stage. The outer div handles position (so `move` glides
 * via CSS transition); the inner div is the animation target, keeping
 * preset transforms from fighting the positioning.
 */
export function CharacterSprite({ actor, sprite, bus, onExited }) {
  const animTarget = useRef(null);
  const def = characters[actor];

  // Entrance animation on mount.
  useEffect(() => {
    if (sprite.enterAnim) playAnimation(animTarget.current, sprite.enterAnim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Receive `play` commands from the engine.
  useEffect(() => {
    return bus.subscribe(actor, (anim, params) => playAnimation(animTarget.current, anim, params));
  }, [actor, bus]);

  // Exit: play the leave animation, then tell the engine to unmount us.
  const exiting = sprite.exiting;
  useEffect(() => {
    if (!exiting) return;
    let cancelled = false;
    playAnimation(animTarget.current, exiting).then(() => {
      if (!cancelled) onExited(actor);
    });
    return () => {
      cancelled = true;
    };
  }, [exiting, actor, onExited]);

  if (!def) {
    console.warn(`Unknown character: "${actor}"`);
    return null;
  }
  const src = def.sprites[sprite.emotion] ?? def.sprites.neutral;

  return (
    <div className="vn-sprite" style={{ left: POSITIONS[sprite.pos] ?? POSITIONS.center }}>
      <div ref={animTarget} className="vn-sprite-anim">
        <img src={src} alt={def.name} draggable={false} />
      </div>
    </div>
  );
}
