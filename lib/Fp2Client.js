// fp2-proxy/lib/Fp2Client.js
// Copyright © 2023-2025 Erik Baauw. All rights reserved.
//
// Proxy for Aqara Presence Sensor FP2.

import { EventEmitter } from 'node:events'

import { HttpClient, IPDiscovery } from 'hap-controller'

import { OptionParser } from 'hb-lib-tools/OptionParser'

import sodium from 'libsodium-wrappers'

function uuid (id) {
  return '00000' + id + '-0000-1000-8000-0026BB765291'
}

const nZones = 30

const uuids = {
  AccessoryInformation: uuid('03E'),
  Identify: uuid('014'),
  Manufacturer: uuid('020'), // value: 'Aqara'
  Model: uuid('021'), // value 'PS-S02D'
  Name: uuid('023'), // value: 'Presence-Sensor-FP2-XXXX
  SerialNumber: uuid('030'), // value: '54EF44XXXXXX'
  FirmwareRevision: uuid('052'), // value: '1.1.7'
  HardwareRevision: uuid('053'), // value: '1.0.0'
  Aqara: '34AB8811-AC7F-4340-BAC3-FD6A85F9943B', // value: 6.1;6.1
  ProductData: uuid('220'), // value: xDsGOzOmv1k=

  ProtocolInformation: uuid('0A2'),
  Version: uuid('037'),

  WiFiTransport: uuid('22A'),
  CurrentTransport: uuid('22B'), // value: true
  WiFiCapabilities: uuid('22C'), // value: 9
  WiFiConfigurationControl: uuid('22D'), // value 0x02020000030400000000

  AccessoryRuntimeInformation: uuid('239'),
  Ping: uuid('23C'),

  FirmwareUpdate: '9715BF53-AB63-4449-8DC7-2785D617390A',
  FirmwareUpdateStatus: '7D943F6A-E052-4E96-A176-D17BF00E32CB', // value: -1
  FirmwareUpdateUrl: 'A45EFD52-0DB5-4C1A-9727-513FBCD8185F', // write only
  FirmwareUpdateChecksum: '40F0124A-579D-40E4-865E-0EF6740EA64B', // write only
  FirmwareVersion: '96BF5F20-2996-4DB6-8D65-0E36314BCB6D', // value: '1.1.7'
  DeviceModel: '36B7A28B-3200-4783-A3FB-6714F11B1417', // value: 'lumi.motion.agl001'
  SelectedIotPlatform: 'F5329CB1-A50B-4225-BA9B-331449E7F7A9', // value: 1

  Aiot: 'F49132D1-12DF-4119-87D3-A93E8D68531E',
  // Name: uuid('023'), // value: 'AIOT'
  AiotCountryDomain: '25D889CB-7135-4A29-B5B4-C1FFD6D2DD5C', // value: 'aiot-coap.aqara.cn'
  AiotDid: 'C7EECAA7-91D9-40EB-AD0C-FFDDE3143CB9', // value: 'lumi1.54ef44xxxxxx'
  AiotBindKey: '80FA747E-CB45-45A4-B7BE-AA7D9964859E', // write only
  AiotBindState: 'C3B8A329-EF0C-4739-B773-E5B7AEA52C71', // value: true

  LightSensor: uuid('084'),
  // Name: uuid('023'),
  CurrentAmbientLightLevel: uuid('06B'),

  OccupancySensor: uuid('086'),
  // Name: uuid('023'),
  OccupancyDetected: uuid('071'),
  SensorIndex: 'C8622A33-826A-4DD3-9BE9-D496361F29BB'
}

class Fp2Client extends EventEmitter {
  constructor (params = {}) {
    super()
    this._options = {
      timeout: 5
    }
    const optionParser = new OptionParser(this._options)
    optionParser
      .objectKey('service')
      .objectKey('pairData')
      .intKey('timeout', 5, 60)
      .parse(params)
    this._discovery = new IPDiscovery()
    this._client = new HttpClient(
      this._options.service.id, this._options.service.address, this._options.service.port,
      this._options.pairData, { usePersistentConnections: true }
    )
  }

  async connect () {
    if (this._map != null) {
      return
    }
    if (this._options.pairData == null) {
      throw new Error(`${this._options.service.id}: not paired`)
    }
    this._accessories = await this._client.getAccessories()
    this._map = {}
    const services = this._accessories.accessories[0].services
    for (const service of services) {
      const characteristics = {}
      for (const characteristic of service.characteristics) {
        characteristics[characteristic.type] = characteristic.iid
        if (characteristic.type === uuids.SensorIndex) {
          if (service.type === uuids.OccupancySensor) {
            service.type += '|' + characteristic.value
          }
        }
      }
      this._map[service.type] = { iid: service.iid, characteristics }
    }
  }

  async disconnect () {
    delete this._map
    this._client?.close()
  }

  async identify () {
    if (this._options.pairData == null) {
      this.emit('identify')
      // Doesn't work: FP2 doesn't support unauthenticated identify.
      await this._client.identify()
      return
    }
    await this.connect()
    const iid = this._iid(uuids.AccessoryInformation, uuids.Identify)
    await this._put(iid, true)
  }

  get service () {
    return this._options.service
  }

  get pairData () {
    return this._options.pairData
  }

  async pair (setupCode) {
    if (!this._options.service.availableToPair) {
      throw new Error('already paired')
    }
    const pairMethod = await this._discovery.getPairMethod(this._options.service)
    const data = await this._client.startPairing(pairMethod)
    await this._client.finishPairing(data, setupCode)
    this._options.pairData = this._client.getLongTermData()
    const seed = Buffer.from(sodium.randombytes_buf(32))
    const key = sodium.crypto_sign_seed_keypair(seed)
    const identifier = 'abcdefg'
    const isAdmin = false
    await this._client.addPairing(identifier, Buffer.from(key.publicKey), isAdmin)
    this._client.close()
    return this._options.pairData
  }

  async unpair () {
    await this.connect()
    await this._client.removePairing(this._client.pairingProtocol.iOSDevicePairingID)
    this._client.close()
    delete this._options.pairData
  }

  async accessories () {
    await this.connect()
    return this._accessories
  }

  _iid (serviceType, characteristicType, subtype) {
    if (serviceType.length === 3) {
      serviceType = uuid(serviceType)
    }
    if (subtype != null) {
      serviceType += '|' + subtype
    }
    return this._map[serviceType]?.characteristics?.[characteristicType]
  }

  async _get (iid) {
    await this.connect()
    const list = ['1.' + iid]
    this.emit('get', list)
    const chars = await this._client.getCharacteristics(list)
    return chars.characteristics[0].value
  }

  async _put (iid, value) {
    await this.connect()
    const body = {}
    body['1.' + iid] = value
    this.emit('put', body)
    await this._client.setCharacteristics(body)
  }

  async getId () {
    await this.connect()
    const iid = this._iid(uuids.AccessoryInformation, uuids.SerialNumber)
    return this._get(iid)
  }

  async subscribe () {
    await this.connect()
    const events = {}
    this._client
      .on('event', (event) => {
        for (const message of event.characteristics) {
          this.emit('event', events[message.iid](message))
        }
      })
      .on('event-disconnect', async (list) => {
        this.emit('event', { reachable: false })
        try {
          await this._client.subscribeCharacteristics(list)
        } catch (error) {
          this.emit(error)
        }
      })
    const iid = this._iid(uuids.LightSensor, uuids.CurrentAmbientLightLevel)
    const list = ['1.' + iid]
    this.emit('event', { lightLevel: await this._get(iid) })
    events[iid] = (message) => { return { lightLevel: message.value } }
    for (let i = 0; i < nZones; i++) {
      const iid = this._iid(uuids.OccupancySensor, uuids.OccupancyDetected, i)
      if (iid != null) {
        list.push('1.' + iid)
        this.emit('event', { zone: i, presence: (await this._get(iid)).value === 1 })
        events[iid] = (message) => {
          return { zone: i, presence: message.value === 1 }
        }
      }
    }
    this.emit('subscribe', list)
    await this._client.subscribeCharacteristics(list)
  }
}

export { Fp2Client }
