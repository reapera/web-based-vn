# Web-Based Visual Novel Engine

A data-driven visual novel engine built with React + Vite. The whole game — story,
characters, backgrounds, animations, audio — is defined in JSON files under
`src/data/`, so adding content never requires touching engine code.

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
`pulse`, `jumpBack`, `talk`. Add your own by adding an entry to the JSON.

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
