const { ApiClient } = require('homebridge-deconz')

const client = new ApiClient()

const manufacturername = 'Aqara'
const modelid = 'PS-S02D'
const swversion = '1.1.6_0005'
const mac = '54:ef:44:ff:fe:4a:85:0f'
const name = 'Dining Room Presence'

const presenceId = await client.post('/sensors', {
  type: 'CLIPPresence',
  manufacturername,
  modelid,
  swversion,
  uniqueid: [mac, '01', '0406'].join('-'),
  name
})

const lightLevelId = await client.post('/sensors', {
  type: 'CLIPLightLevel',
  manufacturername,
  modelid,
  swversion,
  uniqueid: [mac, '01', '0400'].join('-'),
  name
})

console.log('presence: %d, lightlevel: %d', presenceId, lightLevelId)
