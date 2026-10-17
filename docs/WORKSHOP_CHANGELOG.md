# Workshop change notes (as posted on Steam)

## Update - 18 Oct: Boss Battle, monsters, new music
- New mode: Boss Battle (co-op). Everyone in the arena fights 4 waves of monsters and then a boss, with 3 lives each. The frag box counts your kills; the top right shows the wave and what's left.
- Monsters in deathmatch: an arena now has a 15% chance of creatures loose in the level. Killing one is no frag and dying to one costs none.
- Music: every round opens with the Hellmatch theme, and four new fast-paced tracks join the rotation.

## Update - 17 Oct: FreeDM Arena is now Hellmatch
- New name: Hellmatch. The map is now mg_hellmatch, with a new title, map icon and loading screens. Servers that load it by Workshop ID don't need to change anything.
- Music: the levels' own soundtrack plays during rounds, with longer tracks in free for all and team deathmatch and short ones in one-life rounds. Turn it down with your music volume.
- Fixed: you could see through walls, ledges, pillars and closed doors by running up against them.
- Kill messages at the top no longer get cut off: long ones wrap onto a second line. Player names on the game HUD are shortened to 12 characters (chat and the scoreboard still show full names).
- Spectating: the screen shows who you're watching and "TYPE !BACK TO PLAY", and the score at the top right follows the arena you're watching.
- !help shows the controls (!doom still works). While spectating it also shows how to switch player.
- One-life rounds (team elimination, last man standing): once you're out, whether killed or gone to spectate, you wait for the next round instead of taking over a bot. Fixed: typing !back after being knocked out could leave you stuck.
- Lighter on servers: the script uses about half the server time it did.
- Fixed: players joining mid-round could be left standing in the lobby with a knife and parts of the on-screen text missing. They now go straight in.
- No more money for kills (nothing can be bought anyway).
- The lobby bhop course is gone: it was there for late joiners, who now take a bot's place instead of waiting.
- The loading screens and description now make clear this is an unofficial fan project that uses Freedoom's content.

## Update - 16 Oct @ 8:59pm
- Players joining mid-round now take a bot's place when every arena is full (or it's a one-life round), instead of waiting for the next round. In one-life rounds you take over the bot's marine where it stands.
- Fixed: players could spawn stuck in walls (some spawn points sat right against a wall). Every spawn point is now checked and moved clear.
- Fixed: a player could occasionally end up outside a level and walk off into the void. Anyone outside a level is now put back at a spawn point.
- Bots no longer get stuck walking into walls toward enemies on the other side; they only chase enemies they can reach and step out of each other's way.
- New loading screen pictures with the controls and a map overview, plus a map icon and radar overview.
- New option: !hud scores hides the Doom HUD while the scoreboard is open (off by default).
- Weapon-start announcements now use Freedoom's weapon names (pump-action shotgun, minigun, SKAG 1337 and so on).
