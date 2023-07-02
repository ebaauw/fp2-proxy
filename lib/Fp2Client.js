// fp2-proxy/lib/Fp2Client.js
// Copyright © 2023 Erik Baauw. All rights reserved.
//
// Proxy for Aqara Presence Sensor FP2.

const events = require('events')
const { EventEmitter } = events
const { HttpClient, IPDiscovery } = require('hap-controller')
const { OptionParser } = require('hb-lib-tools')
const sodium = require('libsodium-wrappers')

const uuids = {
  AccessoryInformation: '0000003E-0000-1000-8000-0026BB765291',
  Identify: '00000014-0000-1000-8000-0026BB765291',
  Manufacturer: '00000020-0000-1000-8000-0026BB765291', // value: 'Aqara'
  Model: '00000021-0000-1000-8000-0026BB765291', // value 'PS-S02D'
  Name: '00000023-0000-1000-8000-0026BB765291',
  SerialNumber: '00000030-0000-1000-8000-0026BB765291', // value: '54EF444A850F'
  FirmwareRevision: '00000052-0000-1000-8000-0026BB765291', // value: '1.1.7'
  HardwareRevision: '00000053-0000-1000-8000-0026BB765291', // value: '1.0.0'
  Aqara: '34AB8811-AC7F-4340-BAC3-FD6A85F9943B', // value: 6.1;6.1
  ProductData: '00000220-0000-1000-8000-0026BB765291', // value: 6.1;6.1

  ProtocolInformation: '000000A2-0000-1000-8000-0026BB765291',
  Version: '00000037-0000-1000-8000-0026BB765291',

  WiFiTransport: '0000022A-0000-1000-8000-0026BB765291',
  CurrentTransport: '0000022B-0000-1000-8000-0026BB765291', // value: true
  WiFiCapabilities: '0000022C-0000-1000-8000-0026BB765291', // value: 9
  WiFiConfigurationControl: '0000022D-0000-1000-8000-0026BB765291', // value 0x02020000030400000000

  AccessoryRuntimeInformation: '00000239-0000-1000-8000-0026BB765291',
  Ping: '0000023C-0000-1000-8000-0026BB765291',

  Aqara1: '9715BF53-AB63-4449-8DC7-2785D617390A',
  Aqara11: '7D943F6A-E052-4E96-A176-D17BF00E32CB', // value: -1
  Aqara12: 'A45EFD52-0DB5-4C1A-9727-513FBCD8185F', // write only
  Aqara13: '40F0124A-579D-40E4-865E-0EF6740EA64B', // write only
  AqaraFirmware: '96BF5F20-2996-4DB6-8D65-0E36314BCB6D', // value: '1.1.7'
  AqaraModel: '36B7A28B-3200-4783-A3FB-6714F11B1417', // value: 'lumi.motion.agl001'
  Aqara14: 'F5329CB1-A50B-4225-BA9B-331449E7F7A9', // value: 1

  Aiot: 'F49132D1-12DF-4119-87D3-A93E8D68531E',
  // Name: '00000023-0000-1000-8000-0026BB765291', // value: 'AIOT'
  AiotCountryDomain: '25D889CB-7135-4A29-B5B4-C1FFD6D2DD5C', // value: 'aiot-coap.aqara.cn'
  AiotDid: 'C7EECAA7-91D9-40EB-AD0C-FFDDE3143CB9', // value: 'lumi1.54ef444a850f'
  AiotBindKey: '80FA747E-CB45-45A4-B7BE-AA7D9964859E', // write only
  AiotBindState: 'C3B8A329-EF0C-4739-B773-E5B7AEA52C71', // value: true

  LightSensor: '00000084-0000-1000-8000-0026BB765291',
  // Name: '00000023-0000-1000-8000-0026BB765291',
  CurrentAmbientLightLevel: '0000006B-0000-1000-8000-0026BB765291',

  OccupancySensor: '00000086-0000-1000-8000-0026BB765291',
  // Name: '00000023-0000-1000-8000-0026BB765291',
  OccupancyDetected: '00000071-0000-1000-8000-0026BB765291',
  AqaraIndex: 'C8622A33-826A-4DD3-9BE9-D496361F29BB'
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

  async identify () {
    try {
      this.emit('identify')
      await this._client.identify()
    } finally {
      this._client.close()
    }
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
    await this._client.removePairing(this._client.pairingProtocol.iOSDevicePairingID)
    this._client.close()
    delete this._options.pairData
  }

  async accessories () {
    const accessories = await this._client.getAccessories()
    this._client.close()
    return accessories
  }
}

module.exports = Fp2Client
