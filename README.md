# FreeDM for CS2

[Freedoom](https://freedoom.github.io)'s deathmatch (FreeDM, all 32 levels) rebuilt to run inside one
Counter-Strike 2 map, with no server plugins. The whole Doom game — movement, weapons, items, doors,
lifts, teleporters, frags — runs as a cs_script inside the map. Up to 64 players in up to 4 arenas,
with modes that change every round (free-for-all, team deathmatch, team elimination, last man
standing). Every frag is a real CS2 kill.

Workshop: *(link to the Steam Workshop page)*

This repository is the **source**: the converter that turns Freedoom's files into CS2 models,
materials, sounds and HUD graphics, the game logic, and the tools that write everything into the
Hammer map. The built addon is what the Workshop item contains.

## Layout

| Folder | What it is |
|---|---|
| `src/core/` | The Doom game: level loading, movement, collision, weapons, things, specials, arenas, bots, round manager. Plain JavaScript, no engine code, so it can be tested outside CS2. |
| `src/cs2/` | The CS2 side: pawn parking and camera, input, rendering (prop pool), HUD, sounds, round control and kill credit. |
| `tools/` | The build: `convert.py` (WAD levels → models/materials), `sprites.py` (sprites → voxel models), `hud.py` (Doom status bar → Panorama layout), `extras.py` (sounds, sky), `vmap.py` / `vmap_env.py` (write entities, lobby, moondomes and vis hints into the Hammer map), `dmx.py` (binary DMX reader/writer), `build.mjs` (assembles the script). |
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

Output lands in `out/addon/`; copy it into `content/csgo_addons/mg_freedm/` and build the map in
Hammer. `FDM_CURRENT_VMAP=<path to the map as last saved by Hammer>` makes the build layer its
entities onto that map instead of starting from the template.

## Credits and licences

All game content — levels, textures, sprites, sounds, graphics and the text — is from the
**Freedoom project** and its contributors, used under their BSD licence (`FREEDOOM_LICENSE.txt`,
contributors in `FREEDOOM_CREDITS.txt`). The game logic is a fresh implementation of Doom's rules.
The code in this repository is MIT-licensed; see `LICENSE`.

Not affiliated with id Software, Bethesda or the Freedoom project.
