# FreeDM for CS2 — current status and handover (16 Oct 2026, 08:30 Adelaide)

Repo: https://github.com/skink52/freedm-cs2 (source only; `sh tools/build_all.sh` rebuilds the addon into out/addon,
needs a `freedoom` checkout next to the repo). Zach's addon: `content\csgo_addons\mg_freedm` (PC linked to the chat;
files are written straight into it, zips only for bulk model/material updates — and zips must NOT contain
maps/mg_freedm.vmap or maps/scripts/freedm.js, that overwrote newer files once).

## What works in CS2 (confirmed by Zach, 15 Oct)
Map builds, script loads (`[freedm] v0.1.0 ready` in console), Doom levels render with correct textures and sky,
movement, doors, pickups, shooting, Doom HUD (status bar, face, numbers, weapon sprite), bots play (need the nav seed
volume in the lobby, present), kills show in the killfeed, team deathmatch / LMS rounds run, LMS round ended
"CTs won by ELIMINATION", animated water/slime/lava (update 4), own body hidden (eye 15 units ahead, player models
carved no further than 13 units forward), bots toned down (BOT_SKILL 0.35).

## Update 16 Oct 08:30 (script + freedm.css written straight into the addon; map unchanged)
Console test at 08:15 with the current script confirmed: chat commands reach the script, round messages print,
FireWinCondition ended the CS2 round 7 s after a TDM arena finished (frag limit), no fdm_map_params warning.
Changes:
- `!doom` reply: chat lines are now paced (SAY_GAP 1 s, and held 1 s after a human types). On a listen server
  `say` speaks as the host, and the two !doom lines went out in the same tick right after the host's own chat line,
  so the flood limit dropped them. !doom also shows the controls on the Doom message line when in an arena.
  If it still prints nothing: remove !doom and put the controls on the loading screen (Zach is fine with that).
- TDM "FIRST TO N" missing: the line was 34 characters on a 32-character HUD line, the number was cut off.
  Now "TEAM DEATHMATCH - FIRST TO N".
- HUD entity re-found after a round restart: per-player HUD is reset and resent (stale cache could hide lines).
- Lobby status (players not in an arena see text lines only, class Lobby on fdm_root): waiting for players n/2,
  starts in / after freeze time, Doom round time left, arena scores cycling every 3 s, AFK / join T or CT hints.
- Console diagnostics: `[freedm] FireWinCondition <reason> (arenas won: T a, CT b)`, `[freedm] CS2 round ended:
  T win/CT win`, `[freedm] CS2 kill: killer (team, score) -> victim` for kills involving a human, warmup warning
  (Doom frags are not sent to CS2 during warmup - likely cause of the scoreboard problem with a 2nd human).
- `!body` removed; MIN_PLAYERS 2 (bots count, so a solo player with bots still gets rounds).

## Open problems
1. Verify !doom chat reply with the paced queue.
2. Confirm on the scoreboard that the T/CT win ticks (console now prints the CS2 round result).
3. Scoreboard kills with a second human: check the `CS2 kill:` lines and whether the warmup warning appears.
4. Zach's own additions to the map exist in ref/mg_freedm_hammer_saved_4.vmap (his 22:33 save); the map was
   regenerated from it at 08:02 15/16 Oct. Always rebuild from his latest Hammer save (FDM_CURRENT_VMAP).

## Requested next
- Optional: late joiner replaces a bot in a full arena.
- Radar image / loading screenshot (harmless "Failed loading resource ... overheadmaps" lines); controls on the
  loading screen if !doom is dropped.
- Known CS2 limits found: cl_draw_only_deathnotices can't be set from a script (only sv_disable_radar); alpha-tested
  textures must be power-of-two; Panorama keyframe names must be quoted; root HUD panel may not have an id; nav needs a
  func_nav_markup WALKABLESEED volume; CS2 draws both faces of model polygons; HUD text lines hold 32 characters;
  `say` from a script speaks as the listen-server host and is subject to the chat flood limit.
- Build note: set FREEDOOM_DIR=/path/to/freedoom if the freedoom checkout is not inside the repo.

## Workshop
Zach is uploading as game type Custom. Description text with the Freedoom BSD licence was provided; repo link to add.
