import { useCallback, useMemo, useRef, useState } from "react";
import { scenes as sceneTable, scriptMeta as script } from "../data/registry";
import { createAnimationBus } from "./animations";
import { audio } from "./audio";
import { loadFromSlot, saveToSlot } from "./saves";
import { evalCond, interpolate } from "./vars";

const initialState = {
  status: "title", // "title" | "playing" | "ended"
  sceneId: null,
  stepIndex: 0,
  background: null, // { name, transition, duration }
  music: null,
  sprites: {}, // actor -> { emotion, pos, enterAnim, exiting }
  dialogue: null, // { actor, text }
  choice: null, // { prompt, options }
  input: null, // { var, prompt, default }
  vars: {}, // script variables (player_name, affection points, ...)
  callStack: [], // [{ sceneId, stepIndex }] for call/return
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stage collision avoidance: source scripts (and Ren'Py's default) put
// everyone at center, which stacks sprites. Never land on an occupied slot;
// a lone center occupant is nudged aside so a conversation pairs up
// left/right. May mutate other sprites' pos (call from within commit()).
function resolvePos(sprites, selfActor, desired) {
  const others = Object.entries(sprites)
    .filter(([actor, sp]) => actor !== selfActor && !sp.exiting)
    .map(([, sp]) => sp);
  const occupied = () => new Set(others.map((sp) => sp.pos));
  const pos = desired ?? "center";
  if (!occupied().has(pos)) return pos;
  if (pos === "center" && others.length === 1) {
    others[0].pos = "centerLeft";
    return "centerRight";
  }
  const order =
    pos === "centerLeft" || pos === "left"
      ? ["centerLeft", "left", "center", "centerRight", "right"]
      : pos === "centerRight" || pos === "right"
        ? ["centerRight", "right", "center", "centerLeft", "left"]
        : ["center", "centerRight", "centerLeft", "right", "left"];
  return order.find((p) => !occupied().has(p)) ?? pos;
}

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
  // choice, input) hands control back to the player, or the scene jumps/ends.
  async function run(sceneId, stepIndex) {
    const token = ++runToken.current;
    const alive = () => runToken.current === token;
    const scene = sceneTable[sceneId];
    if (!scene) {
      console.error(`Unknown scene: "${sceneId}"`);
      // Pop the call stack if possible so a missing scene doesn't dead-end.
      const frame = stateRef.current.callStack[stateRef.current.callStack.length - 1];
      if (frame) {
        commit((s) => void s.callStack.pop());
        run(frame.sceneId, frame.stepIndex);
      }
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
      if (!step) {
        // Scene ran out of steps: behave like an implicit `return`.
        const frame = stateRef.current.callStack[stateRef.current.callStack.length - 1];
        if (frame) {
          commit((s) => void s.callStack.pop());
          run(frame.sceneId, frame.stepIndex);
        }
        return;
      }

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
            const existing = s.sprites[step.actor];
            if (existing) {
              // Already on stage: act like move/emotion, don't re-run entrance.
              if (step.pos) existing.pos = resolvePos(s.sprites, step.actor, step.pos);
              if (step.emotion) existing.emotion = step.emotion;
              existing.exiting = null;
            } else {
              s.sprites[step.actor] = {
                emotion: step.emotion ?? "neutral",
                pos: resolvePos(s.sprites, step.actor, step.pos),
                enterAnim: step.anim ?? "fadeIn",
                exiting: null,
              };
            }
          });
          break;

        case "exit":
          commit((s) => {
            if (s.sprites[step.actor]) s.sprites[step.actor].exiting = step.anim ?? "fadeOut";
          });
          break;

        case "clearAll":
          commit((s) => void (s.sprites = {}));
          break;

        case "move":
          commit((s) => {
            if (s.sprites[step.actor]) s.sprites[step.actor].pos = resolvePos(s.sprites, step.actor, step.pos);
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

        case "set":
          commit((s) => {
            if (step.add != null) s.vars[step.var] = (s.vars[step.var] ?? 0) + step.add;
            else s.vars[step.var] = step.value;
          });
          break;

        case "if": {
          const target = evalCond(step, stateRef.current.vars) ? step.goto : step.elseGoto;
          if (target) {
            run(target, 0);
            return;
          }
          break; // condition false and no elseGoto: fall through
        }

        case "call":
          commit((s) => void s.callStack.push({ sceneId, stepIndex: i + 1 }));
          run(step.goto, 0);
          return;

        case "return": {
          const frame = stateRef.current.callStack[stateRef.current.callStack.length - 1];
          if (frame) {
            commit((s) => void s.callStack.pop());
            run(frame.sceneId, frame.stepIndex);
          } else {
            audio.stopMusic({ fade: 1500 });
            commit((s) => {
              s.status = "ended";
              s.dialogue = null;
            });
          }
          return;
        }

        case "input":
          commit((s) => {
            s.stepIndex = i;
            s.input = { var: step.var, prompt: step.prompt ?? "", default: step.default ?? "" };
          });
          return; // blocking: resumes via submitInput()

        case "say":
          commit((s) => {
            if (step.actor && step.emotion && s.sprites[step.actor]) {
              s.sprites[step.actor].emotion = step.emotion;
            }
            s.stepIndex = i;
            s.dialogue = { actor: step.actor ?? null, text: interpolate(step.text, s.vars) };
          });
          if (step.anim && step.actor) bus.play(step.actor, step.anim, {});
          return; // blocking: resumes via advance()

        case "choice":
          commit((s) => {
            s.stepIndex = i;
            s.choice = {
              prompt: step.prompt ? interpolate(step.prompt, s.vars) : null,
              options: step.options.map((o) => ({ ...o, text: interpolate(o.text, s.vars) })),
            };
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

  // Jump straight into any scene (chapter browser). Seeds the variables the
  // intro normally sets so mid-story interpolation and conditions work.
  function startAt(sceneId) {
    audio.unlock();
    runToken.current++;
    stateRef.current = {
      ...initialState,
      status: "playing",
      vars: {
        player_name: "Cyan",
        player_gender: "male",
        player_pronoun_subj: "he",
        player_pronoun_subj_cap: "He",
        player_pronoun_obj: "him",
        player_pronoun_poss: "his",
        player_appearance: "spiky blonde hair that stood out in a crowd",
      },
    };
    setState(stateRef.current);
    run(sceneId, 0);
  }

  function advance() {
    const s = stateRef.current;
    audio.unlock();
    if (s.status !== "playing" || s.choice || s.input || !s.dialogue) return;
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

  function submitInput(value) {
    const s = stateRef.current;
    if (!s.input) return;
    const trimmed = String(value ?? "").trim();
    commit((st) => {
      st.vars[st.input.var] = trimmed || st.input.default;
      st.input = null;
    });
    run(s.sceneId, s.stepIndex + 1);
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
      input: s.input,
      vars: s.vars,
      callStack: s.callStack,
      preview: s.dialogue?.text ?? s.choice?.prompt ?? s.input?.prompt ?? "...",
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

  return { state, bus, start, startAt, advance, choose, submitInput, notifyExited, save, load, title: script.title };
}
