# signalk-x729

A Signal K plugin for the **Geekworm X729 UPS** on a Raspberry Pi. Publishes the X729's
battery state and an AC-power-loss notification to Signal K.

## Paths published
- `electrical.batteries.<id>.voltage` — battery voltage (V), from the MAX17040 fuel gauge (I²C `0x36`, reg `0x02`)
- `electrical.batteries.<id>.capacity.stateOfCharge` — state of charge (ratio 0–1), reg `0x04`
- `notifications.electrical.batteries.<id>` — `alert` when external (AC) power is lost, `normal` when restored

`<id>` defaults to `x729` (configurable).

## How it reads the hardware
- **Battery:** shells out to `i2cget` (from `i2c-tools`). No native node modules.
- **AC power loss:** reads **GPIO6** with `pinctrl get 6`. This reads the pad register
  rather than claiming the GPIO line, so it does **not** conflict with the Geekworm
  `powerloss` service that also uses GPIO6. `hi` = power loss, `lo` = AC present.

The plugin is **read-only**. It never drives the X729 shutdown GPIO (26) — safe shutdown
is handled by the Geekworm `powerloss` / `x729-pwr` services.

## Requirements
- Raspberry Pi with a Geekworm X729 UPS; I²C enabled.
- `i2c-tools` (`i2cget`) and `pinctrl` installed (both ship with current Raspberry Pi OS).
- The Signal K user able to run `i2cget`/`pinctrl` (member of the `i2c` group; `pinctrl`
  needs no privilege for reads). Tested on Raspberry Pi 5 / Bookworm.

## Configuration
| Option | Default | Notes |
|---|---|---|
| Polling rate (s) | 10 | how often to read the gauge + GPIO |
| Battery id | `x729` | path segment under `electrical.batteries.` |
| I²C bus | 1 | |
| Fuel gauge I²C address | `0x36` | MAX17040 |
| AC power-loss GPIO (BCM) | 6 | X729 power-loss pin |
| Notify on AC loss | true | raise the notification |

## Credits / license
Fuel-gauge read formulas adapted from `tmcolby/signalk-geekworm-x728` (Apache-2.0).
Licensed under Apache-2.0.
