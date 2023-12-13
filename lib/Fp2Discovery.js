// fp2-proxy/lib/Fp2Discovery.js
// Copyright © 2023 Erik Baauw. All rights reserved.
//
// Proxy for Aqara Presence Sensor FP2.

const events = require('events')
const { EventEmitter } = events
const { IPDiscovery } = require('hap-controller')
const { OptionParser, timeout } = require('hb-lib-tools')

const fp2 = {
  manufacturername: 'Aqara',
  modelid: 'PS-S02D'
}

class Fp2Discovery extends EventEmitter {
  constructor (params = {}) {
    super()
    this.options = {
      timeout: 5
    }
    const optionParser = new OptionParser(this.options)
    optionParser
      .intKey('timeout', 1, 60)
      .parse(params)

    this._discovery = new IPDiscovery()
  }

  /** Find FP2 device.
    * @param {string} id - The ID of the FP2.
    * @returns {Service} fp2
    */
  async find (id) {
    this._discovery.on('serviceUp', (service) => {
      if (service.md !== fp2.modelid) {
        return
      }
      this.emit('alive', service)
      if (service.id === id) {
        this.emit('_found', service)
      }
    })
    const timer = setTimeout(() => {
      this.emit('error', new Error(`cannot find ${id}`))
    }, this.options.timeout * 1000)
    this.emit('search', id)
    this._discovery.start()
    try {
      const a = await events.once(this, '_found')
      clearTimeout(timer)
      return a[0]
    } finally {
      this._discovery.stop()
      this._discovery.removeAllListeners('serviceUp')
      this.emit('searchDone')
    }
  }

  /** Search for FP2 devices.
    * @returns {Object.<string, Service>} Map of found FP2 devices by ID.
    */
  async search () {
    const fp2s = {}
    this._discovery.on('serviceUp', (service) => {
      if (service.md !== fp2.modelid) {
        return
      }
      this.emit('alive', service)
      fp2s[service.id] = service
    })
    this.emit('search')
    this._discovery.start()
    await timeout(this.options.timeout * 1000)
    this._discovery.stop()
    this._discovery.removeAllListeners('serviceUp')
    this.emit('searchDone')
    return fp2s
  }
}

module.exports = Fp2Discovery
