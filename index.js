'use strict'

/*
 * signalk-x729 — Geekworm X729 UPS monitor for Signal K
 *
 * Reads the X729 on a Raspberry Pi and publishes:
 *   - electrical.batteries.<id>.voltage                     (MAX17040 @ I2C 0x36, reg 0x02)
 *   - electrical.batteries.<id>.capacity.stateOfCharge      (MAX17040 reg 0x04, ratio 0..1)
 *   - notifications.electrical.batteries.<id>               (alert when AC power lost)
 *
 * Design notes (Raspberry Pi 5 / X729):
 *   - Battery is read with the `i2cget` CLI (i2c-tools) — no native node module.
 *   - AC-power-loss is read from GPIO6 with `pinctrl get` (reads the pad register, so it
 *     does NOT claim the line and will not conflict with the X729 `powerloss` service that
 *     also uses GPIO6). hi = power loss, lo = AC present.
 *   - This plugin is READ-ONLY. Safe shutdown is handled by the X729 powerloss/pwr services;
 *     the plugin never drives the shutdown GPIO (26).
 *
 * Fuel-gauge formulas adapted from tmcolby/signalk-geekworm-x728 (Apache-2.0).
 */

const { execFile } = require('child_process')

module.exports = function (app) {
  let timer = null
  let lastAcLoss = null

  const plugin = {
    id: 'signalk-x729',
    name: 'Geekworm X729 UPS',
    description: 'Publishes X729 battery voltage/capacity and an AC power-loss notification to Signal K.'
  }

  plugin.schema = {
    type: 'object',
    properties: {
      rate: { type: 'number', title: 'Polling rate (seconds)', default: 10 },
      batteryId: { type: 'string', title: 'Battery id (electrical.batteries.<id>)', default: 'x729' },
      i2cBus: { type: 'integer', title: 'I2C bus number', default: 1 },
      i2cAddress: { type: 'string', title: 'Fuel gauge I2C address', default: '0x36' },
      acLossGpio: { type: 'integer', title: 'AC power-loss GPIO (BCM)', default: 6 },
      notify: { type: 'boolean', title: 'Raise a notification on AC power loss', default: true }
    }
  }

  function sh (cmd, args) {
    return new Promise((resolve) => {
      execFile(cmd, args, { timeout: 4000 }, (err, stdout) => resolve(err ? null : String(stdout).trim()))
    })
  }

  // SMBus word read, byte-swapped (MAX17040 is big-endian)
  async function readWord (bus, addr, reg) {
    const out = await sh('i2cget', ['-y', String(bus), addr, reg, 'w'])
    if (out === null) return null
    const w = parseInt(out, 16)
    if (Number.isNaN(w)) return null
    return ((w & 0xff) << 8) | (w >> 8)
  }

  // GPIO level via pinctrl (conflict-free). true = power loss (hi), false = AC ok (lo)
  async function readAcLoss (gpio) {
    const out = await sh('pinctrl', ['get', String(gpio)])
    if (out === null) return null
    if (/\|\s*hi\b/.test(out)) return true
    if (/\|\s*lo\b/.test(out)) return false
    return null
  }

  function status (msg) { try { app.setPluginStatus(msg) } catch (e) {} }

  async function poll (o) {
    const values = []
    let voltage = null
    let soc = null

    const vRaw = await readWord(o.i2cBus, o.i2cAddress, '0x02')
    if (vRaw !== null) {
      voltage = vRaw * 1.25 / 1000 / 16
      values.push({ path: 'electrical.batteries.' + o.batteryId + '.voltage', value: voltage })
    }
    const cRaw = await readWord(o.i2cBus, o.i2cAddress, '0x04')
    if (cRaw !== null) {
      soc = Math.min(1, (cRaw / 256) / 100)
      values.push({ path: 'electrical.batteries.' + o.batteryId + '.capacity.stateOfCharge', value: soc })
    }
    if (values.length) app.handleMessage(plugin.id, { updates: [{ values }] })

    const acLoss = await readAcLoss(o.acLossGpio)
    if (acLoss !== null && o.notify !== false && acLoss !== lastAcLoss) {
      lastAcLoss = acLoss
      app.handleMessage(plugin.id, {
        updates: [{
          values: [{
            path: 'notifications.electrical.batteries.' + o.batteryId,
            value: {
              state: acLoss ? 'alert' : 'normal',
              method: acLoss ? ['visual', 'sound'] : [],
              message: acLoss ? 'X729: external power lost — running on battery' : 'X729: external power restored'
            }
          }]
        }]
      })
    }

    const parts = []
    if (voltage !== null) parts.push(voltage.toFixed(2) + 'V')
    if (soc !== null) parts.push((soc * 100).toFixed(0) + '%')
    parts.push(acLoss === null ? 'AC=?' : (acLoss ? 'ON BATTERY' : 'AC ok'))
    status('X729: ' + parts.join('  '))
  }

  plugin.start = function (options) {
    const o = Object.assign(
      { rate: 10, batteryId: 'x729', i2cBus: 1, i2cAddress: '0x36', acLossGpio: 6, notify: true },
      options || {}
    )
    app.handleMessage(plugin.id, {
      updates: [{
        meta: [
          { path: 'electrical.batteries.' + o.batteryId + '.voltage', value: { units: 'V' } },
          { path: 'electrical.batteries.' + o.batteryId + '.capacity.stateOfCharge', value: { units: 'ratio' } }
        ]
      }]
    })
    lastAcLoss = null
    poll(o)
    timer = setInterval(() => poll(o), (o.rate || 10) * 1000)
  }

  plugin.stop = function () {
    if (timer) { clearInterval(timer); timer = null }
  }

  return plugin
}
