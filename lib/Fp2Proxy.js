// fp2-proxy/lib/Fp2Proxy.js
// Copyright © 2023 Erik Baauw. All rights reserved.
//
// Proxy for Aqara Presence Sensor FP2.

'use strict'

const { readFileSync, writeFileSync } = require('fs')
const { watch } = require('node:fs/promises')

const {
  CommandLineParser, CommandLineTool, JsonFormatter, OptionParser
} = require('hb-lib-tools')
const { ApiClient, Discovery } = require('hb-deconz-tools')
const Fp2Discovery = require('./Fp2Discovery')
const Fp2Client = require('./Fp2Client')

const configFile = process.env.HOME + '/.fp2-proxy'
const fp2 = {
  manufacturername: 'Aqara',
  modelid: 'PS-S02D'
}

const { b, u } = CommandLineTool
const { UsageError } = CommandLineParser

const usage = {
  'fp2-proxy': `${b('fp2-proxy')} [${b('-hVD')}] [${b('-H')} ${u('hostname')}[${b(':')}${u('port')}]] [${b('-K')} ${u('apiKey')}] [${b('-t')} ${u('timeout')}] [${b('-s')} | ${u('command')} [${u('argument')} ...]]`,

  getApiKey: `${b('getApiKey')}`,

  discover: `${b('disover')} [${b('-h')}]`,
  identify: `${b('identify')} [${b('-h')}] ${u('id')}`,
  pair: `${b('pair')} [${b('-h')}] ${u('id')} ${u('setupCode')}`,
  info: `${b('info')} [${b('-h')}] ${u('id')}`,
  unpair: `${b('unpair')} [${b('-h')}] ${u('id')}`
}

const description = {
  'fp2-proxy': 'Proxy for Aqara Presence Sensor FP2.',

  getApiKey: 'Obtain an API key for the deCONZ gateway.',

  discover: 'Discover FP2 devices.',
  identify: 'Identify FP2 device.',
  pair: 'Add FP2 device.',
  info: 'Get FP2 device information.',
  unpair: 'Remove FP2 device.'
}

const help = {
  'fp2-proxy': `${description['fp2-proxy']}

Usage: ${usage['fp2-proxy']}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.

  ${b('-V')}, ${b('--version')}
  Print version and exit.

  ${b('-D')}, ${b('--debug')}
  Print debug messages for communication with the gateway.

  ${b('-H')} ${u('hostname')}[${b(':')}${u('port')}], ${b('--host=')}${u('hostname')}[${b(':')}${u('port')}]
  Connect to the deCONZ gateway at ${u('hostname')}${b(':80')} or ${u('hostname')}${b(':')}${u('port')} instead of the default ${b('localhost:80')}.
  The hostname and port can also be specified by setting ${b('DECONZ_HOST')}.

  ${b('-K')} ${u('API key')}, ${b('--apiKey=')}${u('apiKey')}
  Use ${u('API key')} to connect to deCONZ gateway, instead of the API key saved in ${b('~/.fp2-proxy')}.
  The API key can also be specified by setting ${b('DECONZ_API_KEY')}.

  ${b('-s')}, ${b('--service')}
  Do not output timestamps (useful when running as service).

  ${b('-t')} ${u('timeout')}, ${b('--timeout=')}${u('timeout')}
  Set timeout to ${u('timeout')} seconds instead of default ${b(5)}.

Commands:
  (none)
  Proxy paired FP2 devices to deCONZ gateway.

  ${usage.discover}
  ${description.discover}

  ${usage.getApiKey}
  ${description.getApiKey}

  ${usage.discover}
  ${description.discover}

  ${usage.identify}
  ${description.identify}

  ${usage.pair}
  ${description.pair}

  ${usage.info}
  ${description.info}

  ${usage.unpair}
  ${description.unpair}
  
For more help, issue: ${b('fp2-proxy')} ${u('command')} ${b('-h')}`,
  getApiKey: `${description['fp2-proxy']}

Usage: ${b('fp2-proxy')} ${usage.getApiKey}

${description.getApiKey}
The API key is stored in ${b('~/.fp2-proxy')}.

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.`,
  discover: `${description['fp2-proxy']}

Usage: ${b('fp2-proxy')} ${usage.discover}

${description.discover}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.`,
  identify: `${description['fp2-proxy']}

Usage: ${b('fp2-proxy')} ${usage.identify}

${description.identify}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.
  
  ${u('id')}
  The ID of the FP2 device, as returned by ${b('fp2-proxy discover')},
  typically "Presence-Sensor-FP2-xxxx".`,
  pair: `${description['fp2-proxy']}

Usage: ${b('fp2-proxy')} ${usage.pair}

${description.pair}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.
  
  ${u('id')}
  The ID of the FP2 device, as returned by ${b('fp2-proxy discover')},
  typically "Presence-Sensor-FP2-xxxx".
  
  ${u('setupCode')}
  The HomeKit setup code of the FP2 device.`,
  info: `${description['fp2-proxy']}

Usage: ${b('fp2-proxy')} ${usage.info}

${description.info}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.
  
  ${u('id')}
  The ID of the FP2 device, as returned by ${b('fp2-proxy discover')}.`,
  unpair: `${description['fp2-proxy']}

Usage: ${b('fp2-proxy')} ${usage.unpair}

${description.unpair}

Parameters:
  ${b('-h')}, ${b('--help')}
  Print this help and exit.
  
  ${u('id')}
  The ID of the FP2 device, as returned by ${b('fp2-proxy discover')}.`
}

class Fp2Proxy extends CommandLineTool {
  constructor (pkgJson) {
    super({ mode: 'command', debug: false })
    this.pkgJson = pkgJson
    this.usage = usage['fp2-proxy']
  }

  async main () {
    try {
      await this._main()
    } catch (error) {
      if (error.request == null) {
        this.error(error)
      }
    }
  }

  async _main () {
    this.clargs = this.parseArguments()
    try {
      await this.readConfig()
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.error(error)
      }
      this.config = {}
    }

    // try {
    //   this.gatewayConfig = await this.deconzDiscovery.config(
    //     this.clargs.options.host
    //   )
    // } catch (error) {
    //   if (error.request == null) {
    //     await this.fatal('%s: %s', this.clargs.options.host, error)
    //   }
    //   await this.fatal('%s: deCONZ gateway not found', this.clargs.options.host)
    // }

    if (this.clargs.command !== 'fp2-proxy') {
      this.name = 'fp2-proxy ' + this.clargs.command
      this.usage = `${b('fp2-proxy')} ${usage[this.clargs.command]}`
    }
    // this.createApiClient()
    return this[this.clargs.command](this.clargs.args)
  }

  async 'fp2-proxy' (...args) {
    const parser = new CommandLineParser(this.pkgJson)
    let mode = 'daemon'
    const options = {}
    parser
      .help('h', 'help', help['fp2-proxy'])
      .flag('n', 'noRetry', () => { options.retryTime = 0 })
      .flag('s', 'service', () => { mode = 'service' })
      .parse(...args)
    this.jsonFormatter = new JsonFormatter(
      mode === 'service' ? { noWhiteSpace: true } : {}
    )
    this.setOptions({ mode })
    this.configController = new AbortController()
    try {
      const watcher = watch(configFile, { signal: this.configController.signal })
      for await (const event of watcher) {
        this.vdebug('%s: %s event', configFile, event.eventType)
        if (this.configTimer != null) {
          continue
        }
        // Writing the file seems to generate two events (on open and on close?),
        // and reading it while it's still open for writing returns null.
        this.configTimer = setTimeout(async () => {
          delete this.configTimer
          try {
            this.readConfig()
            const sensors = await this.client.get('/sensors')
            for (const id in sensors) {
              const sensor = sensors[id]
              if (sensor.manufacturername === fp2.manufacturername && sensor.modelid === fp2.modelid) {
                this.log('/sensors/%d: %s %s', id, sensor.uniqueid, sensor.type)
              }
            }
          } catch (error) {
            this.error(error)
          }
        }, 1000)
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return
      }
      throw error
    }
  }

  async destroy () {
    if (this.configController != null) {
      await this.configController.abort()
    }
  }

  async getApiKey (...args) {
    const parser = new CommandLineParser(this.pkgJson)
    const jsonFormatter = new JsonFormatter(
      { noWhiteSpace: true, sortKeys: true }
    )
    parser
      .help('h', 'help', help.getApiKey)
      .parse(...args)
    const apiKey = await this.client.getApiKey('fp2-proxy')
    this.print(jsonFormatter.stringify(apiKey))
    this.config[this.bridgeid] = { apiKey }
    if (this.client.fingerprint != null) {
      this.config[this.bridgeid].fingerprint = this.client.fingerprint
    }
    this.writeConfig()
  }

  async discover (...args) {
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help.discover)
      .parse(...args)
    await this.createFp2Discovery()
    const fp2s = {}
    this.fp2Discovery.on('alive', (service) => {
      // Note: service.id is the fake mac address from the HAP advertisement,
      // not the WiFI MAC address.
      fp2s[service.id] = {
        host: service.address + ':' + service.port,
        modelid: service.md,
        name: service.name,
        pairable: service.availableToPair,
        paired: this.config[service.id]?.pairData != null
      }
    })
    await this.fp2Discovery.search()
    const jsonFormatter = new JsonFormatter()
    this.print(jsonFormatter.stringify(fp2s))
  }

  async identify (...args) {
    let id
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help.identify)
      .parameter('fp2', (value) => {
        id = this.checkId(value)
      })
      .parse(...args)
    const fp2Client = await this.createFp2Client(id)
    try {
      await fp2Client.identify()
    } finally {
      await fp2Client.disconnect()
    }
  }

  async pair (...args) {
    let id, setupCode
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help.pair)
      .parameter('fp2', (value) => {
        id = this.checkId(value)
      })
      .parameter('setupCode', (value) => {
        setupCode = OptionParser.toString('setupCode', value, true, true)
      })
      .parse(...args)
    const fp2Client = await this.createFp2Client(id)
    const pairData = await fp2Client.pair(setupCode)
    // const accessories = await fp2Client.accessories()
    // id = await fp2Client.getId()
    this.config[id] = { service: fp2Client.service, pairData }
    this.writeConfig()
  }

  async unpair (...args) {
    let id
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help.unpair)
      .parameter('fp2', (value) => {
        id = OptionParser.toString('fp2', value, true, true)
      })
      .parse(...args)
    const fp2Client = await this.createFp2Client(id)
    await fp2Client.unpair()
    this.writeConfig()
  }

  async info (...args) {
    let id
    const parser = new CommandLineParser(this.pkgJson)
    parser
      .help('h', 'help', help.pair)
      .parameter('fp2', (value) => {
        id = this.checkId(value)
      })
      .parse(...args)
    const fp2Client = await this.createFp2Client(id)
    const a = await fp2Client.accessories()
    const jsonFormatter = new JsonFormatter()
    this.print(jsonFormatter.stringify(a))
    // fp2Client.close()
    await fp2Client.subscribe()
  }

  readConfig () {
    this.debug('%s: read', configFile)
    const text = readFileSync(configFile)
    this.vdebug('%s: read: %s', configFile, text)
    try {
      this.config = JSON.parse(text)
    } catch (error) {
      this.warn('%s: file corrupted', configFile)
      this.config = {}
    }
  }

  writeConfig () {
    const jsonFormatter = new JsonFormatter(
      { noWhiteSpace: true, sortKeys: true }
    )
    this.vdebug('%s: write: %j', configFile, this.config)
    const text = jsonFormatter.stringify(this.config)
    writeFileSync(configFile, text, { mode: 0o600 })
    this.debug('%s: write done', configFile)
  }

  parseArguments () {
    const parser = new CommandLineParser(this.pkgJson)
    const clargs = {
      command: 'fp2-proxy',
      options: {
        host: process.env.DECONZ_HOST || 'localhost',
        timeout: 5
      }
    }
    parser
      .help('h', 'help', help['fp2-proxy'])
      .version('V', 'version')
      .option('H', 'host', (value) => {
        OptionParser.toHost('host', value, false, true)
        clargs.options.host = value
      })
      .option('K', 'apiKey', (value) => {
        clargs.options.apiKey = OptionParser.toString(
          'apiKey', value, true, true
        )
      })
      .flag('D', 'debug', () => {
        if (this.debugEnabled) {
          this.setOptions({ vdebug: true })
        } else {
          this.setOptions({ debug: true, chalk: true })
        }
      })
      .option('t', 'timeout', (value) => {
        clargs.options.timeout = OptionParser.toInt(
          'timeout', value, 1, 60, true
        )
      })
      .parameter('command', (value) => {
        if (usage[value] == null || typeof this[value] !== 'function') {
          throw new UsageError(`${value}: unknown command`)
        }
        clargs.command = value
      }, true)
      .remaining((list) => { clargs.args = list })
    parser
      .parse()
    return clargs
  }

  checkId (id) {
    if (id == null || id === '') {
      throw new UsageError('missing FP2')
    } else if (!OptionParser.patterns.mac.test(id)) {
      throw new UsageError(`${id}: invalid FP2`)
    }
    return id.toUpperCase()
  }

  createFp2Discovery () {
    if (this.fp2Discovery != null) {
      return
    }
    this.fp2Discovery = new Fp2Discovery({ timeout: this.clargs.options.timeout })
    this.fp2Discovery
      .on('alive', (service) => {
        this.debug(
          'mDNS: found %s [%s] at %s:%d',
          service.name, service.id, service.address, service.port
        )
      })
      .on('search', (id) => {
        this.debug('mDNS: searching%s...', id == null ? '' : ' for ' + id)
      })
      .on('searchDone', () => {
        this.debug('mDNS: search done')
      })
  }

  async createFp2Client (id) {
    if (id == null || id === '') {
      throw new UsageError('missing FP2')
    } else if (!OptionParser.patterns.mac.test(id)) {
      throw new UsageError(`${id}: invalid FP2`)
    }
    id = id.toUpperCase()

    this.createFp2Discovery()
    const params = {
      service: await this.fp2Discovery.find(id),
      timeout: this.clargs.options.timeout
    }
    if (this.config[id]?.pairData != null) {
      params.pairData = this.config[id]?.pairData
    }
    const fp2Client = new Fp2Client(params)
    fp2Client
      .on('event', (event) => { this.debug('%s: %j', id, event) })
      .on('identify', () => { this.debug('%s: identify', id) })
      .on('get', (list) => { this.debug('%s: get(%j)', id, list) })
      .on('put', (body) => { this.debug('%s: put %j', id, body) })
      .on('subscribe', (list) => { this.debug('%s: subscribe %j', id, list) })
    return fp2Client
  }

  createDeconzDiscovery () {
    this.discovery = new Discovery({ timeout: this.clargs.options.timeout })
    this.deconzDiscovery
      .on('error', (error) => {
        if (error.request != null) {
          this.log(
            '%s: request %d: %s %s', error.request.name,
            error.request.id, error.request.method, error.request.resource
          )
          this.warn(
            '%s: request %d: %s', error.request.name, error.request.id, error
          )
          return
        }
        this.warn(error)
      })
      .on('request', (request) => {
        this.debug(
          '%s: request %d: %s %s', request.name,
          request.id, request.method, request.resource
        )
        this.vdebug(
          '%s: request %d: %s %s', request.name,
          request.id, request.method, request.url
        )
      })
      .on('response', (response) => {
        this.vdebug(
          '%s: request %d: response: %j', response.request.name,
          response.request.id, response.body
        )
        this.debug(
          '%s: request %d: %d %s', response.request.name,
          response.request.id, response.statusCode, response.statusMessage
        )
      })
      .on('found', (name, id, address) => {
        this.debug('%s: found %s at %s', name, id, address)
      })
      .on('searching', (host) => {
        this.debug('upnp: listening on %s', host)
      })
      .on('searchDone', () => { this.debug('upnp: search done') })
  }

  async createDeconzClient () {
    this.bridgeid = this.gatewayConfig.bridgeid
    if (this.clargs.options.apiKey == null) {
      if (this.config[this.bridgeid]?.apiKey != null) {
        this.clargs.options.apiKey = this.config[this.bridgeid].apiKey
      } else if (process.env.DECONZ_API_KEY != null) {
        this.clargs.options.apiKey = process.env.DECONZ_API_KEY
      }
    }
    if (this.clargs.options.apiKey == null && this.clargs.command !== 'getApiKey') {
      let args = ''
      if (
        this.clargs.options.host !== 'localhost' &&
        this.clargs.options.host !== process.env.DECONZ_HOST
      ) {
        args += ' -H ' + this.clargs.options.host
      }
      await this.fatal(
        'missing API key - unlock gateway and run "fp2-proxy%s getApiKey"', args
      )
    }
    this.deconzClient = new ApiClient(this.clargs.options)
    this.deconzClient
      .on('error', (error) => {
        if (error.request.id !== this.requestId) {
          if (error.request.body == null) {
            this.log(
              'request %d: %s %s', error.request.id,
              error.request.method, error.request.resource
            )
          } else {
            this.log(
              'request %d: %s %s %s', error.request.id,
              error.request.method, error.request.resource, error.request.body
            )
          }
          this.requestId = error.request.id
        }
        if (error.nonCritical) {
          this.warn('request %d: %s', error.request.id, error)
        } else {
          this.error('request %d: %s', error.request.id, error)
        }
      })
      .on('request', (request) => {
        if (request.body == null) {
          this.debug(
            'request %d: %s %s', request.id, request.method, request.resource
          )
          this.vdebug(
            'request %d: %s %s', request.id, request.method, request.url
          )
        } else {
          this.debug(
            'request %d: %s %s %s', request.id,
            request.method, request.resource, request.body
          )
          this.vdebug(
            'request %d: %s %s %s', request.id,
            request.method, request.url, request.body
          )
        }
      })
      .on('response', (response) => {
        this.vdebug(
          'request %d: response: %j', response.request.id, response.body
        )
        this.debug(
          'request %d: %d %s', response.request.id,
          response.statusCode, response.statusMessage
        )
      })
  }
}

module.exports = Fp2Proxy

// const manufacturername = 'Aqara'
// const modelid = 'PS-S02D'
// const swversion = '1.1.6_0005'
// const mac = '54:ef:44:ff:fe:4a:85:0f'
// const name = 'Dining Room Presence'

// const presenceId = await client.post('/sensors', {
//   type: 'CLIPPresence',
//   manufacturername,
//   modelid,
//   swversion,
//   uniqueid: [mac, '01', '0406'].join('-'),
//   name
// })

// const lightLevelId = await client.post('/sensors', {
//   type: 'CLIPLightLevel',
//   manufacturername,
//   modelid,
//   swversion,
//   uniqueid: [mac, '01', '0400'].join('-'),
//   name
// })

// console.log('presence: %d, lightlevel: %d', presenceId, lightLevelId)
