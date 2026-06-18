# signalk-x729

A Signal K plugin for the **Geekworm X729 UPS** on a Raspberry Pi. Publishes the X729's
battery state, fan speed, and an AC-power-loss notification to Signal K.

## Paths published
- `electrical.batteries.<id>.voltage` — battery voltage (V), from the MAX17040 fuel gauge (I²C `0x36`, reg `0x02`)
- `electrical.batteries.<id>.capacity.stateOfCharge` — state of charge (ratio 0–1), reg `0x04`
- `electrical.batteries.<id>.fan.speed` — fan PWM duty cycle (ratio 0–1; commanded speed, no tachometer)
- `notifications.electrical.batteries.<id>` — `alert` when external (AC) power is lost, `normal` when restored

`<id>` defaults to `x729` (configurable).

## How it reads the hardware
- **Battery:** shells out to `i2cget` (from `i2c-tools`). No native node modules.
- **AC power loss:** reads **GPIO6** with `pinctrl get 6`. This reads the pad register
  rather than claiming the GPIO line, so it does **not** conflict with the Geekworm
  `powerloss` service that also uses GPIO6. `hi` = power loss, `lo` = AC present.
- **Fan speed:** reads the X729 fan PWM channel sysfs (`duty_cycle / period`) — the
  commanded duty cycle set by the `x729-fan` service (the fan has no tachometer).

The plugin is **read-only**. It never drives the X729 shutdown GPIO (26) or the fan PWM —
safe shutdown and fan control are handled by the Geekworm `powerloss` / `x729-pwr` /
`x729-fan` services.

## Requirements
- Raspberry Pi with a Geekworm X729 UPS; I²C enabled; the `x729-fan` service running (for fan speed).
- `i2c-tools` (`i2cget`) and `pinctrl` installed (both ship with current Raspberry Pi OS).
- The Signal K user able to run `i2cget`/`pinctrl` and read the PWM sysfs. Tested on Raspberry Pi 5 / Bookworm.

## Install
Install from the Signal K appstore (search for "x729"), or with npm:

```bash
cd ~/.signalk
npm install signalk-x729
```

Then enable **Geekworm X729 UPS** in the Signal K plugin config and restart the server.

## Configuration
| Option | Default | Notes |
|---|---|---|
| Polling rate (s) | 10 | how often to read the gauge, GPIO and fan |
| Battery id | `x729` | path segment under `electrical.batteries.` |
| I²C bus | 1 | |
| Fuel gauge I²C address | `0x36` | MAX17040 |
| AC power-loss GPIO (BCM) | 6 | X729 power-loss pin |
| Notify on AC loss | true | raise the notification |
| Report fan speed | true | publish the fan duty cycle |
| Fan SignalK path | `electrical.batteries.x729.fan.speed` | |
| Fan PWM chip path | `/sys/class/pwm/pwmchip0` | |
| Fan PWM channel | 1 | GPIO13 → PWM channel 1 |

## Credits / license
Fuel-gauge read formulas adapted from `tmcolby/signalk-geekworm-x728` (Apache-2.0).
Licensed under Apache-2.0.
