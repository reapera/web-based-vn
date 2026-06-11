#!/usr/bin/env node
/**
 * Ren'Py → engine JSON converter.
 *
 * Usage: node tools/convert-renpy.mjs <path-to-renpy-game-dir>
 *
 * Reads script.rpy + arcs/ * * / *.rpy, emits:
 *   src/data/script.json       scenes (labels, plus synthesized scenes for
 *                              menu option bodies and if/elif/else branches)
 *   src/data/characters.json   speakers with colors and emotion → sprite maps
 *   src/data/backgrounds.json  bg/cg images (+ "black" color background)
 *   src/data/audio.json        music tracks that actually exist on disk
 * and copies referenced images/audio into public/assets/cyan/.
 *
 * Unsupported statements are skipped with a warning — the goal is a faithful
 * but never-crashing port of a somewhat messy source.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error("Usage: node tools/convert-renpy.mjs <renpy-game-dir>");
  process.exit(1);
}
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ASSET_OUT = path.join(ROOT, "public/assets/cyan");
const DATA_OUT = path.join(ROOT, "src/data");

const warnings = {};
const warn = (kind, detail) => {
  (warnings[kind] ??= []).push(detail);
};

// ---------------------------------------------------------------- helpers

const listRpy = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listRpy(p) : e.name.endsWith(".rpy") ? [p] : [];
  });

const files = [path.join(SRC, "script.rpy"), ...listRpy(path.join(SRC, "arcs"))].filter((f) => fs.existsSync(f));

/** Strip a trailing comment that is not inside a string. */
function stripComment(line) {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") inStr = !inStr;
    else if (ch === "#" && !inStr) return line.slice(0, i);
  }
  return line;
}

/** Ren'Py text → engine text: drop {tags}, [var] → {var}, unescape. */
function cleanText(text) {
  return text
    .replace(/\{\/?[a-zA-Z=#.\-_/ 0-9]*\}/g, "") // renpy text tags {i} {w=0.5} ...
    .replace(/\[cap_func\((\w+)\)\]/g, "{$1_cap}")
    .replace(/\[(\w+)\]/g, "{$1}")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, " ")
    .trim();
}

const toId = (s) => s.trim().replace(/\s+/g, "_");

// ----------------------------------------------------- pass 1: definitions

const imageMap = {}; // "char_eve broom ask" -> "images/sprites/eve/3.png"
const condSwitch = {}; // "char_cyan neutral" -> "char_cyan normal neutral"
const defines = {}; // speaker id -> { name, color }

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trimEnd();
    const t = line.trim();
    let m;
    if ((m = t.match(/^image (.+?)\s*=\s*"(.+?)"\s*$/))) {
      imageMap[m[1].trim()] = m[2];
    } else if ((m = t.match(/^image (.+?):\s*$/))) {
      // ConditionSwitch block: take the "True" fallback image name.
      const name = m[1].trim();
      for (let j = i + 1; j < lines.length && (lines[j].trim() === "" || /^\s/.test(lines[j])); j++) {
        const mm = lines[j].match(/"True",\s*"(.+?)"/);
        if (mm) {
          condSwitch[name] = mm[1];
          break;
        }
        if (/^\S/.test(lines[j])) break;
      }
    } else if ((m = t.match(/^define (\w+)\s*=\s*Character\((.*)\)\s*$/))) {
      const args = m[2];
      if (/^None/.test(args.trim())) continue; // narrator
      const nameM = args.match(/^"((?:[^"\\]|\\.)*)"/);
      const colorM = args.match(/color="(#[0-9a-fA-F]+)"/);
      defines[m[1]] = { name: cleanText(nameM ? nameM[1] : m[1]), color: colorM ? colorM[1] : "#9a9ab0" };
    }
  }
}

// Resolve ConditionSwitch aliases (gendered player sprites → male fallback).
for (const [name, target] of Object.entries(condSwitch)) {
  if (imageMap[target]) imageMap[name] = imageMap[target];
}

// Build actor sprite registry and background registry from image names.
const actorSprites = {}; // actor -> { emotionKey -> source path }
const bgImages = {}; // bgName -> source path
for (const [name, src] of Object.entries(imageMap)) {
  const parts = name.split(/\s+/);
  if (parts[0] === "bg") {
    bgImages[toId(parts.slice(1).join(" "))] = src;
  } else if (parts[0].startsWith("cg_") || parts[0] === "cg") {
    bgImages[toId(name)] = src;
  } else if (parts[0] === "white_flash" || parts[0] === "vignette") {
    // engine-side effects we don't port
  } else {
    const actor = parts[0].startsWith("char_") ? parts[0].slice(5) : parts[0];
    const emotion = parts.slice(1).join("_") || "default";
    (actorSprites[actor] ??= {})[emotion] = src;
  }
}
for (const sprites of Object.values(actorSprites)) {
  sprites.neutral ??= sprites.normal_neutral ?? sprites.normal ?? sprites.default ?? Object.values(sprites)[0];
  // Short aliases: scripts say `show eve sad` while images define "normal sad"
  // or "broom sad". Prefer the "normal" variant when both exist.
  const keys = Object.keys(sprites).sort((a, b) => (a.startsWith("normal_") ? -1 : 0) - (b.startsWith("normal_") ? -1 : 0));
  for (const key of keys) {
    const short = key.replace(/^(normal|broom|hood|battle)_/, "");
    sprites[short] ??= sprites[key];
  }
}

// Speaker aliases for the shorthand/capitalized ids used in some scenes.
// b/g are scene-local shorthands (Brandt in rmc_scene8, Gabe elsewhere).
const speakerAlias = { c: "cyan", e: "eve", l: "lyrel", g: "gabe", b: "Brandt" };
const resolveSpeaker = (tok) => {
  const id = speakerAlias[tok] ?? (defines[tok] ? tok : defines[tok.toLowerCase()] ? tok.toLowerCase() : tok);
  if (!defines[id] && !actorSprites[id]) {
    defines[id] = { name: id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " "), color: "#9a9ab0" };
    warn("auto-created character", id);
  }
  return id;
};

// --------------------------------------------------- transform mapping

const POSITION_AT = {
  center: "center", center_pos: "center", truecenter: "center",
  midleft: "centerLeft", mid_left: "centerLeft", near_left: "centerLeft",
  midright: "centerRight", mid_right: "centerRight", near_right: "centerRight",
  farleft: "left", far_left: "left", anne_small_left: "left", left: "left",
  farright: "right", far_right: "right", anne_small_right: "right", right: "right",
  anne_small_center: "center",
};
const MOVE_END = { center: "center", midleft: "centerLeft", midright: "centerRight", farleft: "left", farright: "right" };
const ANIM_AT = {
  startled: "startled",
  small_shake: "smallShake",
  shake: "moderateShake",
  moderate_shake: "moderateShake",
  constant_shake: "constantShake",
  idle_breathe: "breathe",
  cat_float: "breathe",
  bg_slight_tilt: "tilt",
};
const ENTER_AT = {
  pop_from_up: { anim: "popFromTop" },
  pop_from_down: { anim: "popFromTop" },
  pop_from_left: { anim: "popFromLeft" },
  pop_from_right: { anim: "popFromRight" },
  enter_left: { anim: "slideInLeft", pos: "centerLeft" },
  enter_right: { anim: "slideInRight", pos: "centerRight" },
  enter_center: { anim: "slideInLeft", pos: "center" },
};
const EXIT_AT = { exit_left: "slideOutLeft", exit_right: "slideOutRight" };
const IGNORED_AT = new Set([
  "close_up", "normal_zoom", "small", "catsize", "flipped", "facing_right", "facing_left",
  "shadowed", "dialogue", "flash", "topleft", "offscreenleft", "offscreenright",
]);

/** Map an `at a, b(...)` clause to { pos, anim, enterAnim } best-effort. */
function mapAtClause(atText, context) {
  const result = {};
  for (let part of atText.split(",")) {
    part = part.trim();
    const call = part.match(/^(\w+)\s*\((.*)\)$/);
    const name = call ? call[1] : part;
    if (POSITION_AT[name]) result.pos = POSITION_AT[name];
    else if (ENTER_AT[name]) {
      result.enterAnim = ENTER_AT[name].anim;
      result.pos ??= ENTER_AT[name].pos;
      if (call && /MIDLEFT/.test(call[2])) result.pos = "centerLeft";
      else if (call && /MIDRIGHT/.test(call[2])) result.pos = "centerRight";
      else if (call && /FARLEFT/.test(call[2])) result.pos = "left";
      else if (call && /FARRIGHT/.test(call[2])) result.pos = "right";
      else if (call && /CENTER/.test(call[2])) result.pos ??= "center";
    } else if (ANIM_AT[name]) result.anim = ANIM_AT[name];
    else if (EXIT_AT[name]) result.exitAnim = EXIT_AT[name];
    else if (name === "move" && call) {
      const xs = call[2].match(/(CENTER_X|MIDLEFT_X|MIDRIGHT_X|FARLEFT_X|FARRIGHT_X|[\d.]+)/g) ?? [];
      const end = xs[1] ?? xs[0];
      const endPos = { CENTER_X: "center", MIDLEFT_X: "centerLeft", MIDRIGHT_X: "centerRight", FARLEFT_X: "left", FARRIGHT_X: "right" }[end];
      result.pos = endPos ?? posFromNumber(end);
    } else {
      const moveName = name.match(/^(center|midleft|midright|farleft|farright)_(center|midleft|midright|farleft|farright)_(fast|normal|slow)$/);
      if (moveName) result.pos = MOVE_END[moveName[2]];
      else if (IGNORED_AT.has(name)) warn("ignored transform", `${name} (${context})`);
      else warn("unknown transform", `${name} (${context})`);
    }
  }
  return result;
}

function posFromNumber(n) {
  const x = parseFloat(n);
  if (Number.isNaN(x)) return undefined;
  if (x < 0.22) return "left";
  if (x < 0.42) return "centerLeft";
  if (x < 0.58) return "center";
  if (x < 0.78) return "centerRight";
  return "right";
}

// --------------------------------------------------------- audio lookup

const audioFiles = new Map(); // basename -> absolute path
(function scanAudio(dir) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scanAudio(p);
    else if (/\.(mp3|ogg|wav|opus)$/i.test(e.name)) audioFiles.set(e.name, p);
  }
})(path.join(SRC, "audio"));

const usedMusic = {}; // name -> source path
const usedSynthSfx = new Set();
function synthSfxFor(base) {
  const n = base.toLowerCase();
  if (/knock/.test(n)) return "knock";
  if (/foot|step|thud|impact|punch|slam|stomp|land|crash|drop/.test(n)) return "thud";
  if (/whoosh|swish|dash|wind|swing|slash|gasp/.test(n)) return "whoosh";
  if (/chime|bell|ding|sparkle|magic|glint|coin/.test(n)) return "chime";
  return null;
}

function musicName(file) {
  const base = path.basename(file);
  if (!audioFiles.has(base)) {
    warn("missing audio", base);
    return null;
  }
  const name = base.replace(/\.\w+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
  usedMusic[name] = audioFiles.get(base);
  return name;
}

// ------------------------------------------------------ statement parsing

/** Read a file into {indent, text, file, line} statements, skipping blanks. */
function readStatements(file) {
  const out = [];
  const raw = fs.readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < raw.length; i++) {
    const noComment = stripComment(raw[i].replace(/\t/g, "    ")).trimEnd();
    if (!noComment.trim()) continue;
    out.push({ indent: noComment.length - noComment.trimStart().length, text: noComment.trim(), file: path.basename(file), line: i + 1 });
  }
  return out;
}

const scenes = {};
const sceneCounters = {};
function subSceneId(base, kind) {
  const n = (sceneCounters[base] = (sceneCounters[base] ?? 0) + 1);
  return `${base}__${kind}${n}`;
}

/** Collect the statements of an indented block starting after stmts[i]. */
function collectBlock(stmts, i, parentIndent) {
  const body = [];
  let j = i + 1;
  while (j < stmts.length && stmts[j].indent > parentIndent && !/^label /.test(stmts[j].text)) {
    body.push(stmts[j]);
    j++;
  }
  return { body, next: j };
}

function parseCond(expr) {
  let m;
  if ((m = expr.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/))) {
    return { var: m[1], op: m[2], value: parseValue(m[3]) };
  }
  if ((m = expr.match(/^not\s+(\w+)$/))) return { var: m[1], op: "falsy", value: null };
  if ((m = expr.match(/^(\w+)$/))) return { var: m[1], op: "truthy", value: null };
  warn("unparsed condition", expr);
  return { var: "__unknown", op: "truthy", value: null };
}

function parseValue(raw) {
  const t = raw.trim();
  if (/^-?[\d.]+$/.test(t)) return parseFloat(t);
  if (t === "True") return true;
  if (t === "False") return false;
  const s = t.match(/^"(.*)"$/);
  return s ? s[1] : t;
}

const endsControl = (steps) => ["jump", "return", "end", "if"].includes(steps[steps.length - 1]?.type);

/**
 * Emit statements into scenes[sceneId]. Menus and if-chains split the
 * remainder into a synthesized continuation scene.
 */
function emitInto(stmts, sceneId) {
  const steps = (scenes[sceneId] ??= { steps: [] }).steps;

  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const t = s.text;
    const ctx = `${s.file}:${s.line}`;
    let m;

    // ---- menu ----
    if (/^menu\s*:/.test(t)) {
      const { body, next } = collectBlock(stmts, i, s.indent);
      let prompt = null;
      let optionStmts = body;
      // Source quirk: a single "prompt": child whose body holds the real options.
      if (body.length && /^".*"\s*:$/.test(body[0].text)) {
        const first = collectBlock(body, 0, body[0].indent);
        const onlyOptions = first.body.length && first.body.every((b) => b.indent > body[0].indent);
        const siblings = body.slice(first.next);
        if (onlyOptions && siblings.length === 0 && first.body.some((b) => /^".*"\s*:$/.test(b.text))) {
          prompt = cleanText(body[0].text.replace(/^"|"\s*:$/g, ""));
          optionStmts = first.body;
        }
      }
      const contId = subSceneId(sceneId.split("__")[0], "cont");
      const options = [];
      for (let j = 0; j < optionStmts.length; j++) {
        const o = optionStmts[j];
        if (!/^".*"\s*:$/.test(o.text)) {
          if (o.indent <= (optionStmts[0]?.indent ?? 0)) warn("unexpected menu child", `${o.text} (${ctx})`);
          continue;
        }
        const { body: optBody, next: optNext } = collectBlock(optionStmts, j, o.indent);
        const optId = subSceneId(sceneId.split("__")[0], "opt");
        emitInto(optBody, optId);
        if (!endsControl(scenes[optId].steps)) scenes[optId].steps.push({ type: "jump", goto: contId });
        options.push({ text: cleanText(o.text.replace(/^"|"\s*:$/g, "")), goto: optId });
        j = optNext - 1;
      }
      steps.push({ type: "choice", ...(prompt ? { prompt } : {}), options });
      emitInto(stmts.slice(next), contId);
      return;
    }

    // ---- if / elif / else chain ----
    if ((m = t.match(/^if (.+):$/))) {
      const branches = [];
      let { body, next } = collectBlock(stmts, i, s.indent);
      branches.push({ cond: parseCond(m[1].trim()), body });
      while (next < stmts.length && stmts[next].indent === s.indent && /^(elif .+|else)\s*:$/.test(stmts[next].text)) {
        const bt = stmts[next].text;
        const blk = collectBlock(stmts, next, stmts[next].indent);
        branches.push({ cond: bt.startsWith("elif") ? parseCond(bt.replace(/^elif (.+):$/, "$1").trim()) : null, body: blk.body });
        next = blk.next;
      }
      const contId = subSceneId(sceneId.split("__")[0], "cont");
      // Build the chain back-to-front: each cond gets goto + elseGoto.
      let elseTarget = contId;
      const last = branches[branches.length - 1];
      if (last.cond === null) {
        const elseId = subSceneId(sceneId.split("__")[0], "br");
        emitInto(last.body, elseId);
        if (!endsControl(scenes[elseId].steps)) scenes[elseId].steps.push({ type: "jump", goto: contId });
        elseTarget = elseId;
        branches.pop();
      }
      let chainEntry = elseTarget;
      for (let b = branches.length - 1; b >= 0; b--) {
        const brId = subSceneId(sceneId.split("__")[0], "br");
        emitInto(branches[b].body, brId);
        if (!endsControl(scenes[brId].steps)) scenes[brId].steps.push({ type: "jump", goto: contId });
        if (b === 0) {
          steps.push({ type: "if", ...branches[b].cond, goto: brId, elseGoto: chainEntry });
        } else {
          const chkId = subSceneId(sceneId.split("__")[0], "chk");
          scenes[chkId] = { steps: [{ type: "if", ...branches[b].cond, goto: brId, elseGoto: chainEntry }] };
          chainEntry = chkId;
        }
      }
      emitInto(stmts.slice(next), contId);
      return;
    }

    // ---- block say:  speaker (args):  "line" "line" ----
    if ((m = t.match(/^(\w+)(\s*\([^)]*\))?\s*:$/)) && !/^(label|menu|init|screen|transform|image|layeredimage|style|python|define)$/.test(m[1])) {
      const { body, next } = collectBlock(stmts, i, s.indent);
      const textLines = body.filter((b) => /^".*"$/.test(b.text)).map((b) => cleanText(b.text.slice(1, -1)));
      if (textLines.length) {
        steps.push({ type: "say", actor: resolveSpeaker(m[1]), text: textLines.join(" ") });
        i = next - 1;
        continue;
      }
    }

    // ---- one-line say ----
    if ((m = t.match(/^"(.*)"$/))) {
      steps.push({ type: "say", text: cleanText(m[1]) });
      continue;
    }
    if (
      (m = t.match(/^(\w+)((?:\s+\w+)*)?(\s*\([^)]*\))?\s+"(.*)"(\s*\([^)]*\))?$/)) &&
      !/^(play|stop|show|hide|scene|jump|call|pause|queue|voice)$/.test(m[1])
    ) {
      if (m[1] === "centered") {
        steps.push({ type: "say", text: cleanText(m[4]) });
        continue;
      }
      const actor = resolveSpeaker(m[1]);
      const attrs = (m[2] ?? "").trim();
      const step = { type: "say", actor, text: cleanText(m[4]) };
      if (attrs && actorSprites[actor]?.[toId(attrs)]) step.emotion = toId(attrs);
      steps.push(step);
      continue;
    }

    // ---- scene / show / hide ----
    if ((m = t.match(/^(scene|show)\s+(.+?)(:)?$/))) {
      const isScene = m[1] === "scene";
      const hasBlock = !!m[3];
      let rest = m[2];
      if (hasBlock) i = collectBlock(stmts, i, s.indent).next - 1; // skip raw ATL block
      let transition = null;
      rest = rest.replace(/\s+with\s+(.+)$/, (_, w) => {
        transition = w;
        return "";
      });
      let at = null;
      rest = rest.replace(/\s+at\s+(.+)$/, (_, a) => {
        at = a;
        return "";
      });
      const tokens = rest.trim().split(/\s+/);
      const fadeLike = transition && /fade|Fade|dissolve|Dissolve/.test(transition);

      if (tokens[0] === "expression") {
        warn("skipped statement", `${t} (${ctx})`);
        continue;
      }
      if (tokens[0] === "black") {
        if (isScene) steps.push({ type: "clearAll" });
        steps.push({ type: "bg", name: "black", transition: fadeLike ? "fade" : "none" });
        continue;
      }
      if (tokens[0] === "bg" || tokens[0] === "cg" || tokens[0].startsWith("cg_")) {
        const bgName = tokens[0] === "bg" ? toId(tokens.slice(1).join(" ")) : toId(tokens.join(" "));
        if (!bgImages[bgName]) warn("unknown background", `${bgName} (${ctx})`);
        if (isScene) steps.push({ type: "clearAll" });
        steps.push({ type: "bg", name: bgName, transition: fadeLike ? "fade" : "none", ...(fadeLike ? { duration: 800 } : {}) });
        if (at) {
          const mapped = mapAtClause(at, ctx);
          if (mapped.anim) warn("bg animation skipped", `${mapped.anim} (${ctx})`);
        }
        continue;
      }
      if (tokens[0] === "white_flash" || tokens[0] === "vignette") continue;
      if (isScene) {
        warn("skipped statement", `${t} (${ctx})`);
        continue;
      }
      // sprite show
      const rawActor = tokens[0].startsWith("char_") ? tokens[0].slice(5) : tokens[0];
      if (!actorSprites[rawActor]) {
        warn("unknown sprite", `${tokens.join(" ")} (${ctx})`);
        continue;
      }
      const emotion = tokens.slice(1).join("_") || undefined;
      if (emotion && !actorSprites[rawActor][emotion]) warn("missing emotion", `${rawActor} ${emotion} (${ctx})`);
      const mapped = at ? mapAtClause(at, ctx) : {};
      const enter = { type: "enter", actor: rawActor };
      if (emotion) enter.emotion = emotion;
      if (mapped.pos) enter.pos = mapped.pos;
      if (mapped.enterAnim) enter.anim = mapped.enterAnim;
      else if (transition && fadeLike) enter.anim = "fadeIn";
      steps.push(enter);
      if (mapped.anim) steps.push({ type: "play", actor: rawActor, anim: mapped.anim });
      continue;
    }
    if ((m = t.match(/^hide\s+(.+?)(:)?$/))) {
      let rest = m[1].replace(/\s+with\s+.+$/, "");
      let at = null;
      rest = rest.replace(/\s+at\s+(.+)$/, (_, a) => {
        at = a;
        return "";
      });
      const tokens = rest.trim().split(/\s+/);
      if (tokens[0] === "bg" || tokens[0] === "vignette" || tokens[0] === "white_flash" || tokens[0].startsWith("cg_")) continue;
      const rawActor = tokens[0].startsWith("char_") ? tokens[0].slice(5) : tokens[0];
      if (!actorSprites[rawActor]) continue;
      const mapped = at ? mapAtClause(at, ctx) : {};
      steps.push({ type: "exit", actor: rawActor, anim: mapped.exitAnim ?? "fadeOut" });
      continue;
    }

    // ---- audio ----
    if ((m = t.match(/^play music\s+"([^"]+)"(?:\s+fadein\s+([\d.]+))?/))) {
      const name = musicName(m[1]);
      if (name) steps.push({ type: "music", name, ...(m[2] ? { fade: parseFloat(m[2]) * 1000 } : {}) });
      continue;
    }
    if ((m = t.match(/^play (?:sound|ambient|audio)\s+"([^"]+)"/))) {
      const base = path.basename(m[1]);
      if (audioFiles.has(base)) {
        const name = base.replace(/\.\w+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
        usedMusic[`sfx:${name}`] = audioFiles.get(base);
        steps.push({ type: "sfx", name });
      } else {
        // Most sfx files were never added to the source; approximate the
        // common ones with the engine's built-in synth presets.
        const synth = synthSfxFor(base);
        if (synth) {
          usedSynthSfx.add(synth);
          steps.push({ type: "sfx", name: synth });
        } else warn("missing audio", `${base} (${ctx})`);
      }
      continue;
    }
    if ((m = t.match(/^stop music(?:\s+fadeout\s+([\d.]+))?/))) {
      steps.push({ type: "music", name: null, ...(m[1] ? { fade: parseFloat(m[1]) * 1000 } : {}) });
      continue;
    }
    if (/^stop (sound|ambient|audio)/.test(t) || /^queue /.test(t)) continue;

    // ---- pacing & misc ----
    if ((m = t.match(/^pause(?:\s+([\d.]+))?$/))) {
      steps.push({ type: "wait", ms: Math.min(3000, m[1] ? parseFloat(m[1]) * 1000 : 400) });
      continue;
    }
    if ((m = t.match(/^with\s+(.+)$/))) {
      if (/punch|shake/i.test(m[1])) steps.push({ type: "play", actor: "*", anim: "moderateShake" });
      continue; // standalone transitions are pacing sugar; shows already animate
    }
    if ((m = t.match(/^\$\s*(\w+)\s*(\+=|-=|=)\s*(.+)$/))) {
      if (m[2] === "=") steps.push({ type: "set", var: m[1], value: parseValue(m[3]) });
      else steps.push({ type: "set", var: m[1], add: (m[2] === "+=" ? 1 : -1) * (parseFloat(m[3]) || 0) });
      continue;
    }
    if ((m = t.match(/^call\s+(\w+)/))) {
      steps.push({ type: "call", goto: m[1] });
      continue;
    }
    if ((m = t.match(/^jump\s+(\w+)/))) {
      steps.push({ type: "jump", goto: m[1] });
      continue;
    }
    if (/^return\b/.test(t)) {
      steps.push({ type: "return" });
      continue;
    }
    if (/^(window|camera|voice|nvl|show screen|hide screen|call screen|play movie|stop movie|define|image|transform|init|screen|style|python|label|pass)\b/.test(t)) {
      if (/^(call screen|play movie)/.test(t)) warn("skipped statement", `${t} (${ctx})`);
      continue;
    }
    // Stray ATL keywords from blocks the source forgot to indent, and
    // python expressions we can't translate.
    if (/^(ease|linear|easein|easeout|xalign|yalign|xoffset|yoffset|zoom|alpha|rotate|block|repeat|parallel|choice|time|function|on |event)\b/.test(t) || /^\$/.test(t)) {
      continue;
    }
    // Salvage: a few narration lines in the source were never quoted.
    if (/^[A-Z][^"=:{}]*[.!?…]$/.test(t) && t.split(/\s+/).length > 3) {
      steps.push({ type: "say", text: cleanText(t) });
      warn("unquoted narration (salvaged)", `${t.slice(0, 50)} (${ctx})`);
      continue;
    }
    warn("unhandled line", `${t.slice(0, 70)} (${ctx})`);
  }
}

// ----------------------------------------------------- split into labels

for (const file of files) {
  const stmts = readStatements(file);
  let current = null;
  let bucket = [];
  const flush = () => {
    if (current) {
      if (scenes[current]) warn("duplicate label", current);
      emitInto(bucket, current);
    }
    bucket = [];
  };
  for (const s of stmts) {
    const m = s.text.match(/^label\s+(\w+)\s*:/);
    if (m) {
      flush();
      current = m[1];
    } else if (current) bucket.push(s);
  }
  flush();
}

// -------------------------------------- synthesized start / char select

delete scenes.start; // replace the screen-based flow from script.rpy
delete scenes.character_selection;

const PRONOUNS = {
  female: { subj: "she", obj: "her", poss: "her", appearance: "beautiful blonde hair that flowed in the wind" },
  male: { subj: "he", obj: "him", poss: "his", appearance: "spiky blonde hair that stood out in a crowd" },
};
const genderScene = (g) => ({
  steps: [
    { type: "set", var: "player_gender", value: g },
    { type: "set", var: "player_pronoun_subj", value: PRONOUNS[g].subj },
    { type: "set", var: "player_pronoun_subj_cap", value: PRONOUNS[g].subj[0].toUpperCase() + PRONOUNS[g].subj.slice(1) },
    { type: "set", var: "player_pronoun_obj", value: PRONOUNS[g].obj },
    { type: "set", var: "player_pronoun_poss", value: PRONOUNS[g].poss },
    { type: "set", var: "player_appearance", value: PRONOUNS[g].appearance },
    { type: "jump", goto: "start__go" },
  ],
});
Object.assign(scenes, {
  start: {
    background: "black",
    steps: [
      { type: "say", text: "Before we begin, please choose your character." },
      { type: "input", var: "player_name", prompt: "What is your name?", default: "Cyan" },
      {
        type: "choice",
        prompt: "Choose your character",
        options: [
          { text: "Play as female", goto: "start__female" },
          { text: "Play as male", goto: "start__male" },
        ],
      },
    ],
  },
  start__female: genderScene("female"),
  start__male: genderScene("male"),
  start__go: {
    steps: [
      { type: "enter", actor: "cyan", pos: "center", emotion: "neutral", anim: "fadeIn" },
      { type: "say", text: "Welcome, {player_name}." },
      { type: "exit", actor: "cyan", anim: "fadeOut" },
      { type: "call", goto: "common_route_1a_prologue" },
      { type: "end" },
    ],
  },
});

// ------------------------------------------------ validate jump targets

let stubs = 0;
for (const scene of Object.values(scenes)) {
  for (const step of scene.steps) {
    const targets = [step.goto, step.elseGoto, ...(step.options?.map((o) => o.goto) ?? [])].filter(Boolean);
    for (const target of targets) {
      if (!scenes[target]) {
        warn("stubbed missing label", target);
        stubs++;
        scenes[target] = {
          steps: [{ type: "say", text: `[This scene ("${target}") is missing from the original script.]` }, { type: "return" }],
        };
      }
    }
  }
}

// --------------------------------------------------------- write assets

const copied = new Set();
function copyAsset(srcRel, destDir) {
  const from = path.join(SRC, srcRel);
  if (!fs.existsSync(from)) {
    warn("missing image file", srcRel);
    return null;
  }
  const dest = path.join(ASSET_OUT, destDir, path.basename(srcRel));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (!copied.has(dest)) {
    fs.copyFileSync(from, dest);
    copied.add(dest);
  }
  return `/assets/cyan/${destDir}/${path.basename(srcRel)}`;
}

// Characters: only actors that are actually shown or speak.
const usedActors = new Set(["cyan"]);
const usedBgs = new Set(["black"]);
for (const scene of Object.values(scenes)) {
  for (const step of scene.steps) {
    if (step.actor && step.actor !== "*") usedActors.add(step.actor);
    if (step.type === "bg") usedBgs.add(step.name);
  }
}

// Non-humanoid sprites where head-based size normalization (see
// tools/measure-sprites.mjs) doesn't apply: explicit stage height in %.
const FIXED_HEIGHT = { anne: 26, worm: 80, worm_sunset: 80 };

const charactersOut = {};
for (const actor of [...usedActors].sort()) {
  const def = defines[actor] ?? { name: actor.charAt(0).toUpperCase() + actor.slice(1), color: "#9a9ab0" };
  charactersOut[actor] = { name: def.name === "{player_name}" ? "{player_name}" : def.name, color: def.color };
  if (FIXED_HEIGHT[actor]) charactersOut[actor].fixedHeight = FIXED_HEIGHT[actor];
  if (actorSprites[actor]) {
    const sprites = {};
    for (const [emotion, src] of Object.entries(actorSprites[actor])) {
      const web = copyAsset(src, `sprites/${actor}`);
      if (web) sprites[emotion] = web;
    }
    if (Object.keys(sprites).length) charactersOut[actor].sprites = sprites;
  }
}

const backgroundsOut = { black: { color: "#000000" } };
for (const bg of [...usedBgs].sort()) {
  if (bg === "black") continue;
  const src = bgImages[bg];
  if (!src) continue;
  const web = copyAsset(src, src.includes("/cg/") ? "cg" : "backgrounds");
  if (web) backgroundsOut[bg] = web;
}

const audioOut = { music: {}, sfx: {} };
for (const name of usedSynthSfx) audioOut.sfx[name] = { type: "synth", preset: name };
for (const [name, src] of Object.entries(usedMusic)) {
  const web = copyAsset(path.relative(SRC, src), "audio");
  if (!web) continue;
  if (name.startsWith("sfx:")) audioOut.sfx[name.slice(4)] = { type: "file", src: web, volume: 0.8 };
  else audioOut.music[name] = { type: "file", src: web, volume: 0.45 };
}

const scriptOut = { title: "Cyan Adventure", start: "start", scenes };

fs.mkdirSync(DATA_OUT, { recursive: true });
fs.writeFileSync(path.join(DATA_OUT, "script.json"), JSON.stringify(scriptOut, null, 1));
fs.writeFileSync(path.join(DATA_OUT, "characters.json"), JSON.stringify(charactersOut, null, 1));
fs.writeFileSync(path.join(DATA_OUT, "backgrounds.json"), JSON.stringify(backgroundsOut, null, 1));
fs.writeFileSync(path.join(DATA_OUT, "audio.json"), JSON.stringify(audioOut, null, 1));

// ----------------------------------------------------------- reporting

const stepCount = Object.values(scenes).reduce((n, s) => n + s.steps.length, 0);
const sayCount = Object.values(scenes).reduce((n, s) => n + s.steps.filter((x) => x.type === "say").length, 0);
console.log(`Scenes: ${Object.keys(scenes).length} (${stubs} stubs for missing labels)`);
console.log(`Steps: ${stepCount} (${sayCount} dialogue lines)`);
console.log(`Characters: ${Object.keys(charactersOut).length}, backgrounds: ${Object.keys(backgroundsOut).length}, music: ${Object.keys(audioOut.music).length}, sfx: ${Object.keys(audioOut.sfx).length}`);
console.log(`Assets copied: ${copied.size}`);
for (const [kind, items] of Object.entries(warnings)) {
  const uniq = [...new Set(items)];
  console.log(`\n[${kind}] ${items.length} (${uniq.length} unique)`);
  for (const item of uniq.slice(0, 8)) console.log(`  - ${item}`);
  if (uniq.length > 8) console.log(`  ... and ${uniq.length - 8} more`);
}
