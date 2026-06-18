import baseCharacters from "./characters.json";
import baseBackgrounds from "./backgrounds.json";
import baseAudio from "./audio.json";
import baseScript from "./script.json";
import overlay from "./test-scene.json";

// Manual content overlay merged on top of the converter-generated data.
// Hand-authored scenes (characters, backgrounds, audio, and scene steps)
// live in test-scene.json so they survive `node tools/convert-renpy.mjs`,
// which rewrites the base JSON files. Overlay keys win on collision.
export const characters = { ...baseCharacters, ...(overlay.characters ?? {}) };
export const backgrounds = { ...baseBackgrounds, ...(overlay.backgrounds ?? {}) };
export const audioData = {
  music: { ...baseAudio.music, ...(overlay.audio?.music ?? {}) },
  sfx: { ...baseAudio.sfx, ...(overlay.audio?.sfx ?? {}) },
};
export const scenes = { ...baseScript.scenes, ...(overlay.scenes ?? {}) };
export const scriptMeta = { title: baseScript.title, start: baseScript.start };
