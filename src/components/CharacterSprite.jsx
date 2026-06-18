import { useEffect, useRef } from "react";
import { characters } from "../data/registry";
import metrics from "../data/sprite-metrics.json";
import { playAnimation } from "../engine/animations";

const POSITIONS = {
  left: "12%",
  centerLeft: "32%",
  center: "50%",
  centerRight: "68%",
  right: "88%",
};

// Sprite size normalization: the source art is framed inconsistently
// (full body, knee-up, varying padding), so we scale each image so the
// character's head is HEAD_PCT of the stage height with its top at
// HEAD_TOP_PCT. Bodies that extend past the stage bottom are clipped —
// the dialogue box covers that zone, so it reads as a natural medium shot.
const HEAD_PCT = 16.5;
const HEAD_TOP_PCT = 15;

function spriteLayout(def, src) {
  if (def.fixedHeight) {
    // Non-humanoids (cat, worm): head heuristics don't apply; use an
    // explicit height, anchored to the stage floor.
    return { wrapper: { height: `${def.fixedHeight}%`, bottom: 0 }, imgShift: 0 };
  }
  const m = metrics[src];
  if (!m) return { wrapper: { height: "78%", bottom: 0 }, imgShift: 0 }; // unmeasured art
  const heightPct = (m.imgH / m.headWidth) * HEAD_PCT;
  const topPct = HEAD_TOP_PCT - (m.top / m.imgH) * heightPct;
  // Content can sit off-center in the canvas; nudge the image so the
  // character (not the canvas) is centered on the position slot.
  const imgShift = (0.5 - (m.left + m.right) / 2 / m.imgW) * 100;
  return { wrapper: { height: `${heightPct}%`, top: `${topPct}%` }, imgShift };
}

/**
 * One character on stage. The outer div handles position (so `move` glides
 * via CSS transition); the inner div is the animation target, keeping
 * preset transforms from fighting the positioning.
 */
export function CharacterSprite({ actor, sprite, bus, onExited }) {
  const animTarget = useRef(null);
  const lastAnim = useRef(null);
  const def = characters[actor];

  // Entrance animation on mount.
  useEffect(() => {
    if (sprite.enterAnim) playAnimation(animTarget.current, sprite.enterAnim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Receive `play` commands from the engine. Starting a new animation cancels
  // the previous one so looping presets (breathe, constantShake) can be
  // replaced instead of fighting the newcomer over the transform.
  useEffect(() => {
    return bus.subscribe(actor, (anim, params) => {
      lastAnim.current?.animation?.cancel();
      const done = playAnimation(animTarget.current, anim, params);
      lastAnim.current = done;
      return done;
    });
  }, [actor, bus]);

  // Exit: play the leave animation, then tell the engine to unmount us.
  // If a re-enter aborts the exit (exiting → null), cancel the animation
  // too — otherwise its fill:both end state (opacity 0) sticks forever.
  const exiting = sprite.exiting;
  useEffect(() => {
    if (!exiting) return;
    let cancelled = false;
    const done = playAnimation(animTarget.current, exiting);
    done.then(() => {
      if (!cancelled) onExited(actor);
    });
    return () => {
      cancelled = true;
      done.animation?.cancel();
    };
  }, [exiting, actor, onExited]);

  if (!def || !def.sprites) {
    if (!def) console.warn(`Unknown character: "${actor}"`);
    return null;
  }
  const src = def.sprites[sprite.emotion] ?? def.sprites.neutral ?? Object.values(def.sprites)[0];
  if (!src) return null;
  const layout = spriteLayout(def, src);

  return (
    <div className="vn-sprite" style={{ left: POSITIONS[sprite.pos] ?? POSITIONS.center, ...layout.wrapper }}>
      <div
        ref={animTarget}
        className="vn-sprite-anim"
        style={def.origin ? { transformOrigin: def.origin } : undefined}
      >
        <img
          src={src}
          alt={def.name}
          draggable={false}
          style={layout.imgShift ? { transform: `translateX(${layout.imgShift}%)` } : undefined}
        />
      </div>
    </div>
  );
}
