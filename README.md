# Web-Based Visual Novel Engine

A data-driven visual novel engine built with React + Vite. The whole game — story,
characters, backgrounds, animations, audio — is defined in JSON files under
`src/data/`, so adding content never requires touching engine code.

The repo currently ships **Cyan Adventure**, ported from the Ren'Py project
[reapera/vn-cyan](https://github.com/reapera/vn-cyan) via the included
converter (see below): 252 scenes, ~4,400 dialogue lines, branching routes,
player name/gender selection, and affection-point tracking.

## Run it

```bash
npm install
npm run dev      # dev server
npm run build    # production build to dist/
```

## How it's organized

```
src/data/          ← ALL game content lives here
  script.json        scenes, dialogue, choices, stage directions
  characters.json    character roster (name, color, sprite per emotion)
  backgrounds.json   background name → image path
  animations.json    reusable, parameterized animation presets
  audio.json         music tracks and sound effects
src/engine/        ← script interpreter, animation player, audio, saves
src/components/    ← stage, sprites, dialogue box, choice menu, save menu
public/assets/     ← sprite & background images (SVG/PNG/WebP all work)
```

## Writing the story (`script.json`)

A story is a set of named **scenes**, each a list of **steps**. Steps run
automatically until a blocking step (`say` or `choice`) waits for the player.

```jsonc
{
  "title": "After School",
  "start": "intro",                  // scene to begin at
  "scenes": {
    "intro": {
      "background": "classroom",     // optional: set on scene entry
      "music": "daytime",            // optional: play on scene entry
      "steps": [ ... ]
    }
  }
}
```

### Step reference

| Step | Example | Notes |
|---|---|---|
| `say` | `{ "type": "say", "actor": "rin", "emotion": "happy", "text": "Hi!", "anim": "hop" }` | Omit `actor` for narration. `emotion`/`anim` are optional. |
| `choice` | `{ "type": "choice", "prompt": "?", "options": [{ "text": "...", "goto": "sceneA" }] }` | Each option jumps to a scene. |
| `enter` | `{ "type": "enter", "actor": "akira", "pos": "centerLeft", "emotion": "neutral", "anim": "slideInLeft" }` | Positions: `left`, `centerLeft`, `center`, `centerRight`, `right`. |
| `exit` | `{ "type": "exit", "actor": "akira", "anim": "slideOutLeft" }` | Sprite is removed after the animation. |
| `move` | `{ "type": "move", "actor": "rin", "pos": "right" }` | Glides to the new position. |
| `emotion` | `{ "type": "emotion", "actor": "rin", "emotion": "sad" }` | Swap sprite without dialogue. |
| `play` | `{ "type": "play", "actor": "rin", "anim": "shake", "intensity": 14, "wait": true }` | Run any preset; extra keys override preset vars. `wait` pauses the script until it finishes. |
| `bg` | `{ "type": "bg", "name": "night", "transition": "fade", "duration": 1500 }` | Transitions: `fade`, `wipe`, `none`. |
| `music` | `{ "type": "music", "name": "nighttime", "fade": 1000 }` | `"name": null` stops music. |
| `sfx` | `{ "type": "sfx", "name": "knock" }` | |
| `wait` | `{ "type": "wait", "ms": 800 }` | |
| `jump` | `{ "type": "jump", "goto": "ending" }` | |
| `call` / `return` | `{ "type": "call", "goto": "side_scene" }` | Like jump, but `return` resumes after the call. A `return` with no caller ends the game. |
| `set` | `{ "type": "set", "var": "eve_heart", "add": 1 }` | Or `"value": ...` to assign. Variables interpolate into text as `{eve_heart}`. |
| `if` | `{ "type": "if", "var": "eve_heart", "op": ">=", "value": 3, "goto": "good_end", "elseGoto": "bad_end" }` | Ops: `==` `!=` `>` `<` `>=` `<=` `truthy` `falsy`. `elseGoto` optional (falls through). |
| `input` | `{ "type": "input", "var": "player_name", "prompt": "Your name?", "default": "Cyan" }` | Blocking text input. |
| `clearAll` | `{ "type": "clearAll" }` | Removes all sprites (Ren'Py `scene`). |
| `end` | `{ "type": "end" }` | Shows the end screen. |

## Adding a character

1. Drop sprite images into `public/assets/characters/<id>/` (one per emotion).
2. Register it in `characters.json`:

```json
"mika": {
  "name": "Mika",
  "color": "#8a5ae6",
  "sprites": {
    "neutral": "/assets/characters/mika/neutral.png",
    "happy": "/assets/characters/mika/happy.png"
  }
}
```

That's it — `"actor": "mika"` now works in any step.

## Adding a background

Drop an image in `public/assets/backgrounds/` and add one line to
`backgrounds.json`:

```json
"beach": "/assets/backgrounds/beach.jpg"
```

An entry can also be an object with a CSS `filter`, so one image serves
several moods without a second file:

```json
"beachNight": {
  "src": "/assets/backgrounds/beach.jpg",
  "filter": "brightness(0.4) saturate(0.65) hue-rotate(185deg)"
}
```

## Reusable animations (`animations.json`)

Presets are Web Animations API keyframes with **named variables** (`{var}`),
so one definition serves every sprite and every intensity:

```json
"shake": {
  "keyframes": [
    { "transform": "translateX(0)" },
    { "transform": "translateX(-{intensity}px)" },
    { "transform": "translateX({intensity}px)" },
    { "transform": "translateX(0)" }
  ],
  "vars": { "intensity": 10 },
  "options": { "duration": 420, "easing": "ease-in-out" }
}
```

From the script, any var plus `duration`/`easing`/`iterations` can be
overridden per use:

```json
{ "type": "play", "actor": "rin", "anim": "shake", "intensity": 20, "duration": 300 }
```

Built-in presets: `fadeIn`, `fadeOut`, `slideInLeft`, `slideInRight`,
`slideOutLeft`, `slideOutRight`, `bounce`, `hop`, `shake`, `nod`, `sway`,
`pulse`, `jumpBack`, `talk`, `popFromTop`, `popFromLeft`, `popFromRight`,
`startled`, `smallShake`, `moderateShake`, `constantShake`, `breathe`,
`tilt`. Add your own by adding an entry to the JSON. Presets with
`"iterations": "infinite"` loop until the next animation on that sprite
replaces them.

## Audio (`audio.json`)

Two source types:

```jsonc
"theme":  { "type": "file", "src": "/audio/theme.mp3", "volume": 0.5 },  // your files
"knock":  { "type": "synth", "preset": "knock" }                          // built-in synth
```

The demo uses the built-in WebAudio synth (music = note patterns, sfx =
`knock`/`chime`/`whoosh`/`thud` presets) so it makes sound with zero audio
assets. Drop real files in `public/audio/` and switch the type when ready.

## Saves

Six save slots stored in `localStorage`, with preview text and timestamps,
available from the in-game toolbar and the title screen.

## Sprite size normalization

Sprite art is often framed inconsistently (full body vs knee-up, different
canvas sizes and padding). `tools/measure-sprites.mjs` measures every sprite's
content box and head width (run it with the dev server up):

```bash
node tools/measure-sprites.mjs
```

`CharacterSprite` uses the generated `src/data/sprite-metrics.json` to render
every character with the same head size at the same height — a consistent
medium shot, with longer bodies clipped behind the dialogue box. Re-run the
tool whenever sprite images change. Non-humanoid characters can opt out with
`"fixedHeight": <percent>` in `characters.json` (the converter sets this for
the cat and the worm).

## Ren'Py converter

`tools/convert-renpy.mjs` ports a Ren'Py game into this engine:

```bash
node tools/convert-renpy.mjs /path/to/renpy/game
```

It parses `script.rpy` + `arcs/**/*.rpy`, translates labels into scenes
(menus with inline bodies and if/elif/else chains become synthesized branch
scenes), maps `image`/`define` statements into `characters.json` /
`backgrounds.json`, remaps ATL transforms onto the engine's animation
presets, copies only the referenced images/audio into `public/assets/cyan/`,
and prints a warning report for anything it had to skip or stub (missing
labels become non-crashing placeholder scenes).

## Art credits

Sprites, backgrounds, and music come from
[reapera/vn-cyan](https://github.com/reapera/vn-cyan).
