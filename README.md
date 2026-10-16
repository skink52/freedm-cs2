# FreeDM for CS2

[Freedoom](https://freedoom.github.io)'s deathmatch (FreeDM, all 32 levels) rebuilt to run inside one
Counter-Strike 2 map, with no server plugins. The whole Doom game — movement, weapons, items, doors,
lifts, teleporters, frags — runs as a cs_script inside the map. Up to 64 players in up to 4 arenas,
with modes that change every round (free-for-all, team deathmatch, team elimination, last man
standing). Every frag is a real CS2 kill.

Workshop: *(link to the Steam Workshop page)*

> **About the code:** the code in this repository (the converter, game logic and build tools) was written by an
> AI coding agent (Claude, by Anthropic). skink52 directed the project, tested it in CS2, did the Hammer work and
> publishes the map, but is not the author of the code. Please keep that in mind when reading or reusing it.

This repository is the **source**: the converter that turns Freedoom's files into CS2 models,
materials, sounds and HUD graphics, the game logic, and the tools that write everything into the
Hammer map. The built addon is what the Workshop item contains.

## Layout

| Folder | What it is |
|---|---|
| `src/core/` | The Doom game: level loading, movement, collision, weapons, things, specials, arenas, bots, round manager. Plain JavaScript, no engine code, so it can be tested outside CS2. |
| `src/cs2/` | The CS2 side: pawn parking and camera, input, rendering (prop pool), HUD, sounds, round control and kill credit. |
| `tools/` | The build: `convert.py` (WAD levels → models/materials), `sprites.py` (sprites → voxel models), `hud.py` (Doom status bar → Panorama layout), `extras.py` (sounds, sky), `music.py` (renders the level music from MIDI), `loading.py` / `title.py` / `workshop_art.py` (loading screens, radar, title art, Workshop images), `vmap.py` / `vmap_env.py` (write entities, lobby, moondomes and vis hints into the Hammer map), `dmx.py` (binary DMX reader/writer), `build.mjs` (assembles the script). |
| `test/` | `sim.cjs` runs bot rounds on the pure game; `mock_cs2.mjs` runs the real script against a stand-in for the cs_script API; `tsconfig.json` type-checks it against Valve's `point_script.d.ts`. |
| `preview/` | Browser renders of levels, models and the HUD for checking without CS2. |
| `docs/` | Design plan and the list of known interactions with CounterStrikeSharp plugins. |
| `ref/` | The Hammer map the build writes into, as saved by Hammer. |

`README_FREEDM.md` and `TESTING_FREEDM.md` are the notes that ship with the addon.

## Building

Needs Python 3 with numpy and Pillow, Node 18+, and a checkout of Freedoom next to this repo:

```
git clone https://github.com/freedoom/freedoom
sh tools/build_all.sh
```

The music is rendered once with libADLMIDI (`sh tools/get_adlmidi.sh` builds it; needs cmake, a C++
compiler and ffmpeg) and cached in `build/music/`; without it the build skips the music.

Output lands in `out/addon/`; copy it into `content/csgo_addons/mg_freedm/` and build the map in
Hammer. `FDM_CURRENT_VMAP=<path to the map as last saved by Hammer>` makes the build layer its
entities onto that map instead of starting from the template.

## Credits and licences

All game content — levels, textures, sprites, sounds, music, graphics and the text — is from the
**Freedoom project** and its contributors, used under their BSD licence (`FREEDOOM_LICENSE.txt`,
contributors in `FREEDOOM_CREDITS.txt`, music in `MUSIC_CREDITS.txt`). The music is rendered from Freedoom's
MIDI files with libADLMIDI (Nuked OPL3) and the DMXOPL3 instrument bank by Shannon Freeman (MIT). The title
art uses the Russo One font by Jovanny Lemonad (SIL Open Font Licence, `tools/fonts/`). The game logic is a
fresh implementation of Doom's rules. The code in this repository is MIT-licensed; see `LICENSE`.

An unofficial fan project: not affiliated with or endorsed by the Freedoom project, id Software, Bethesda or
Valve. Freedoom is named only to credit its content.
