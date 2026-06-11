import { useCallback, useMemo, useRef, useState } from "react";
import script from "../data/script.json";
import { createAnimationBus } from "./animations";
import { audio } from "./audio";
import { loadFromSlot, saveToSlot } from "./saves";

const initialState = {
  status: "title", // "title" | "playing" | "ended"
  sceneId: null,
  stepIndex: 0,
  background: null, // { name, transition, duration }
  music: null,
  sprites: {}, // actor -> { emotion, pos, enterAnim, exiting }
  dialogue: null, // { actor, text }
  choice: null, // { prompt, options }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function useVNEngine() {
  const [state, setState] = useState(initialState);
  const stateRef = useRef(state);
  // Each new playthrough/load bumps the token so an in-flight run loop
  // from the previous timeline stops touching state.
  const runToken = useRef(0);
  const bus = useMemo(() => createAnimationBus(), []);

  const commit = useCallback((mutate) => {
    const next = structuredClone(stateRef.current);
    mutate(next);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  // Process steps from (sceneId, stepIndex) until a blocking step (say,
  // choice) hands control back to the player, or the scene jumps/ends.
  async function run(sceneId, stepIndex) {
    const token = ++runToken.current;
    const alive = () => runToken.current === token;
    const scene = script.scenes[sceneId];
    if (!scene) {
      console.error(`Unknown scene: "${sceneId}"`);
      return;
    }

    // Scene-level shorthands apply when entering a scene from the top.
    if (stepIndex === 0) {
      commit((s) => {
        s.sceneId = sceneId;
        s.stepIndex = 0;
        if (scene.background) s.background = { name: scene.background, transition: "fade", duration: 800 };
      });
      if (scene.music) {
        audio.playMusic(scene.music);
        commit((s) => void (s.music = scene.music));
      }
    }

    let i = stepIndex;
    while (alive()) {
      const step = scene.steps[i];
      if (!step) return; // scene ran out without jump/end; stop quietly

      switch (step.type) {
        case "bg":
          commit((s) => {
            s.background = { name: step.name, transition: step.transition ?? "fade", duration: step.duration ?? 800 };
          });
          break;

        case "music":
          audio.playMusic(step.name, { fade: step.fade ?? 800 });
          commit((s) => void (s.music = step.name ?? null));
          break;

        case "sfx":
          audio.playSfx(step.name);
          break;

        case "enter":
          commit((s) => {
            s.sprites[step.actor] = {
              emotion: step.emotion ?? "neutral",
              pos: step.pos ?? "center",
              enterAnim: step.anim ?? "fadeIn",
              exiting: null,
            };
          });
          break;

        case "exit":
          commit((s) => {
            if (s.sprites[step.actor]) s.sprites[step.actor].exiting = step.anim ?? "fadeOut";
          });
          break;

        case "move":
          commit((s) => {
            if (s.sprites[step.actor]) s.sprites[step.actor].pos = step.pos;
          });
          break;

        case "emotion":
          commit((s) => {
            if (s.sprites[step.actor]) s.sprites[step.actor].emotion = step.emotion;
          });
          break;

        case "play": {
          const { type, actor, anim, wait, ...params } = step;
          void type;
          const done = bus.play(actor, anim, params);
          if (wait) await done;
          break;
        }

        case "wait":
          await sleep(step.ms ?? 500);
          break;

        case "say":
          commit((s) => {
            if (step.actor && step.emotion && s.sprites[step.actor]) {
              s.sprites[step.actor].emotion = step.emotion;
            }
            s.stepIndex = i;
            s.dialogue = { actor: step.actor ?? null, text: step.text };
          });
          if (step.anim && step.actor) bus.play(step.actor, step.anim, {});
          return; // blocking: resumes via advance()

        case "choice":
          commit((s) => {
            s.stepIndex = i;
            s.choice = { prompt: step.prompt ?? null, options: step.options };
          });
          return; // blocking: resumes via choose()

        case "jump":
          run(step.goto, 0);
          return;

        case "end":
          audio.stopMusic({ fade: 1500 });
          commit((s) => {
            s.status = "ended";
            s.dialogue = null;
          });
          return;

        default:
          console.warn(`Unknown step type: "${step.type}"`, step);
      }
      i++;
    }
  }

  function start() {
    audio.unlock();
    runToken.current++;
    stateRef.current = { ...initialState, status: "playing" };
    setState(stateRef.current);
    run(script.start, 0);
  }

  function advance() {
    const s = stateRef.current;
    audio.unlock();
    if (s.status !== "playing" || s.choice || !s.dialogue) return;
    // Scene music may have been skipped if audio wasn't unlocked when the
    // scene started; this is a no-op when the track is already playing.
    if (s.music) audio.playMusic(s.music);
    commit((st) => void (st.dialogue = null));
    run(s.sceneId, s.stepIndex + 1);
  }

  function choose(index) {
    const s = stateRef.current;
    const option = s.choice?.options[index];
    if (!option) return;
    commit((st) => void (st.choice = null));
    run(option.goto, 0);
  }

  const notifyExited = useCallback(
    (actor) => {
      commit((s) => void delete s.sprites[actor]);
    },
    [commit]
  );

  function save(slot) {
    const s = stateRef.current;
    if (s.status !== "playing") return;
    const sprites = {};
    for (const [actor, sprite] of Object.entries(s.sprites)) {
      if (!sprite.exiting) sprites[actor] = { emotion: sprite.emotion, pos: sprite.pos, enterAnim: null, exiting: null };
    }
    saveToSlot(slot, {
      sceneId: s.sceneId,
      stepIndex: s.stepIndex,
      background: s.background ? { ...s.background, transition: "none" } : null,
      music: s.music,
      sprites,
      dialogue: s.dialogue,
      choice: s.choice,
      preview: s.dialogue?.text ?? s.choice?.prompt ?? "...",
    });
  }

  function load(slot) {
    const snapshot = loadFromSlot(slot);
    if (!snapshot) return false;
    audio.unlock();
    runToken.current++;
    const { preview, savedAt, ...rest } = snapshot;
    void preview;
    void savedAt;
    stateRef.current = { ...initialState, ...rest, status: "playing" };
    setState(stateRef.current);
    if (snapshot.music) audio.playMusic(snapshot.music);
    else audio.stopMusic();
    return true;
  }

  return { state, bus, start, advance, choose, notifyExited, save, load, title: script.title };
}
