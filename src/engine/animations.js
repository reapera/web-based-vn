import presets from "../data/animations.json";

// Replaces "{var}" placeholders in keyframe values with params, falling back
// to the preset's declared defaults. "-{x}px" with x=10 becomes "-10px".
function resolveKeyframes(keyframes, vars, params) {
  return keyframes.map((frame) => {
    const out = {};
    for (const [prop, value] of Object.entries(frame)) {
      out[prop] =
        typeof value === "string"
          ? value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? vars[name] ?? 0)
          : value;
    }
    return out;
  });
}

/**
 * Play a named animation preset on a DOM element.
 * Any preset var (e.g. intensity, distance) plus duration/easing/iterations
 * can be overridden via params, so one preset serves many script moments.
 * Returns a promise that resolves when the animation finishes.
 */
export function playAnimation(el, name, params = {}) {
  const preset = presets[name];
  if (!preset || !el) {
    if (!preset) console.warn(`Unknown animation preset: "${name}"`);
    return Promise.resolve();
  }
  const keyframes = resolveKeyframes(preset.keyframes, preset.vars ?? {}, params);
  const options = { ...preset.options };
  if (params.duration != null) options.duration = params.duration;
  if (params.easing != null) options.easing = params.easing;
  if (params.iterations != null) options.iterations = params.iterations;

  const animation = el.animate(keyframes, options);
  return animation.finished.catch(() => {}); // cancelled animations are fine
}

export const animationNames = Object.keys(presets);

/**
 * Tiny pub/sub bus the engine uses to ask sprite components to animate.
 * Sprites subscribe with their actor id; handlers return the playAnimation
 * promise so the engine can optionally wait for completion.
 */
export function createAnimationBus() {
  const handlers = new Map();
  return {
    subscribe(actor, handler) {
      handlers.set(actor, handler);
      return () => handlers.delete(actor);
    },
    play(actor, anim, params) {
      const handler = handlers.get(actor);
      return handler ? handler(anim, params) : Promise.resolve();
    },
  };
}
