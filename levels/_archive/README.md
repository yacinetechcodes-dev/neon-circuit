# Archived levels (not loaded)

Each world is now a single long level (`levels/worldNN/world.js`). The original five levels
of every world are kept here in `worldNN/level01.js` … `level05.js`; the world levels were built
from their best parts. The same rules apply to them as to the files below: nothing here loads.

These five levels are not in any world, so the game never loads them. Keep them
as raw material for future worlds: copy a file into `levels/worldNN/`, give it a
new `id`, list it in that world's `levels`, and adapt it to the world's theme,
abilities and weapons.

| File | Name | Ideas worth reusing |
| --- | --- | --- |
| level06.js | Firewall Run | moving laser walls (`laserWall`), timed gates, checkpoint-heavy gauntlet |
| level07.js | Gravity Lab | gravity-flip zones (`flipField`), heavy gravity (`heavyField`) |
| level08.js | Quantum Maze | teleporters, switches and doors (timed, two-switch), fake-wall shortcut |
| level09.js | Overclock Tower | 100-row vertical climb, speed-boost gate run, Warden Mk-III arena |
| level10.js | Core Meltdown | gauntlet of every mechanic, **The Kernel** final boss (`kernel`) |

The entity types they use stay registered (`entities/firewall.js`, `gravity.js`,
`quantum.js`, `boss_kernel.js`), so an archived level runs as soon as a world lists it.
Status when archived: levels 6, 7, 8 and 10 were proven beatable by the headless
solver; level 9's final solver run was interrupted, so re-check it before reuse.
