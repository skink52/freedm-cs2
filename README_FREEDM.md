# FreeDM for CS2: setup

This is Freedoom's deathmatch (FreeDM, all 32 maps) rebuilt to run inside one CS2 map, with no server plugins. The whole Doom game is the cs_script `maps/scripts/freedm.js`: movement, weapons, items, doors, lifts, teleporters and frags. Every texture, sprite, sound and HUD graphic comes straight from Freedoom.

## 1. Install

The addon is `mg_freedm`. Its map `maps/mg_freedm.vmap` already contains everything: the 32 levels, door and lift props, the lobby, the booth, sounds, the script, the HUD, sky and fog. Hammer's original sample map is kept as `maps/mg_freedm_original.vmap.bak`.

All other files (models, materials, HUD, sounds, script) go into the same addon folder, next to `maps/`.

## 2. Build the map

1. Open `maps/mg_freedm.vmap` in Hammer.
2. Build it. The first build compiles about 1,900 materials and 480 models, so it takes a while.

The map's main entities:

| Entity | Name | Setting |
|---|---|---|
| `point_script` | `fdm_script` | cs_script = `maps/scripts/freedm.vjs` |
| `custom_hud_layout` | `fdm_hud` | Layout = `panorama/layout/custom_game/freedm.vxml` |
| `point_template` | `fdm_tpl_prop` | Template01 = `fdm_src_prop` |
| `prop_dynamic` | `fdm_src_prop` | Model = `models/fdm/null.vmdl`, not solid |
| `info_target` | `fdm_booth` | Centre of the small sealed room (players' bodies wait here) |
| `point_soundevent` ×37 | `fdm_snd_<name>` | Sound Event Name = `fdm.<name>` |
| `env_sky` | `fdm_sky` | `materials/fdm/sky/sky.vmat` |
| `env_gradient_fog` | `fdm_fog` | Black, 256 to 3000 units (Doom's light fade) |

Everything else is plain props:
- `prop_static` for the 32 levels.
- `prop_dynamic` named `fdm_mXX_f/cNN` for doors and lifts.
- `fdm_cache_*` props that make every model available to the script.
- The lobby, with 32 T and 32 CT spawns, about 12,000 units below the levels.

## 3. How it plays

- Players spawn in the lobby. After freeze time everyone on T/CT is split into Doom arenas: up to four, filled to 16 first, minimum 6. A round needs at least 2 players on T/CT (bots count); the lobby shows what it is waiting for and the time left in a running round.
- Each round picks one mode:

  | Mode | Rule | Chance |
  |---|---|---|
  | Free for all | First to 20 frags (fewer in small arenas) | 35% |
  | Team deathmatch | First team to 32 frags. T = red, CT = blue | 35% |
  | Team elimination | One life each, last team standing | 20% |
  | Last man standing | One life each, last player standing | 10% |

- Every arena gets its own random map.
- Every frag is a real CS2 kill, credited to the killer, so the killfeed, scoreboard and rank plugins count it.
  - In respawn modes the CS2 kill happens about 1 second after the Doom death, and CS2 respawns the player.
  - In elimination modes the kills are applied when the round ends, so eliminated players can keep watching.
- When an arena finishes, its players watch the arenas still fighting. Mouse 1 / mouse 2 change player, E or Space changes arena.
- The CS2 round ends when every arena is done, or after 10 minutes.
- AFK: after 20 seconds idle you get a warning. At 30 seconds you are moved to spectating and skipped next round until you press a key or type `!back`.
- CS2 bots on the server play using the Doom bot AI. `bot_quota 6` fills a test server.

## Controls

| Key | Doom action |
|---|---|
| W A S D | move (always running) |
| Shift | walk |
| Mouse | turn and aim. Autoaim works like Doom; with no target the shot follows your crosshair up and down |
| Mouse 1 | fire |
| E or Space | use (doors, lifts, switches) |
| R or Mouse 2 | next weapon |
| F (inspect) | previous weapon |

Chat: `!doom` (controls, shown on your own screen), `!spec` (watch other arenas), `!afk` (sit out), `!back` (rejoin), `!hud` (status bar size: normal, classic, small).

Frags during CS2 warmup are not sent to the scoreboard.

## Settings

Open `maps/scripts/freedm.js` and search for `const CONFIG`. The top of that block has the frag limits, mode chances, round length, kill-credit options, AFK times, bot skill, and whether the map sets server cvars (`APPLY_CVARS`).

When `APPLY_CVARS` is on, the map sets these:
- `mp_ignore_round_win_conditions` while arenas are running.
- `mp_respawn_on_death_t/ct` (on for respawn modes, off for elimination).
- `mp_teammates_are_enemies` (1 in free-for-all rounds so same-side kills aren't teamkills).
- `mp_respawn_immunitytime 0`, `mp_death_drop_gun 0`, and the buy settings.

## Credits

The code (the cs_script and the build tools) was written by an AI coding agent (Claude, by Anthropic), directed and tested by skink52.

All game content is from Freedoom (freedoom.github.io, BSD-licensed): FreeDM levels, textures, sprites, sounds and graphics. The game code is a fresh implementation of Doom's rules in cs_script.
