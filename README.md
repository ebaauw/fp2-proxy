<span align="center">

# FP2 Proxy
[![Downloads](https://img.shields.io/npm/dt/fp2-proxy)](https://www.npmjs.com/package/fp2-proxy)
[![Version](https://img.shields.io/npm/v/fp2-proxy)](https://www.npmjs.com/package/fp2-proxy)

[![GitHub issues](https://img.shields.io/github/issues/ebaauw/fp2-proxy)](https://github.com/ebaauw/fp2-proxy/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/ebaauw/fp2-proxy)](https://github.com/ebaauw/fp2-proxy/pulls)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen)](https://standardjs.com)

</span>

## Proxy for Aqara Presence Sensor FP2
Copyright© 2023 Erik Baauw. All rights reserved.

This repository provides a daemon programme, `fp2-proxy`, that creates a virtual device, mirroring an [Aqara Presence Sensor FP2](https://www.aqara.com/eu/product/presence-sensor-fp2), on a [deCONZ gateway](https://github.com/dresden-elektronik/deconz-rest-plugin) ~~or [Hue](https://www.philips-hue.com/) bridge~~.

This virtual device enables the FP2 to be used in rules on the deCONZ gateway ~~or on the Hue bridge~~.
Genrally speaking, these rules are more reliable, more responsive, and functionally richer than HomeKit automations.  Furthermore, these rules don't require an Apple home hub.

The virtual device can be exposed to HomeKit through [Homebridge deCONZ](https://github.com/ebaauw/homebridge-deconz) ~~or [Homebridge Hue2](https://github.com/ebaauw/homebridge-hue2)~~.
This provides a richer experience than using the native HomeKit feature of the FP2,
as the Homebridge plugins include additional characteristics for _Last Motion_, _Dark_, and _Daylight_ and history for _Motion_ and _Light Level_.

## Work in Progress
This repository is work in progress.
Notably, the following features have yet to be implemented:
- Connection to the FP2 over HAP.
- Connection to Hue bridge instead of deCONZ gateway.

### Aqara FP2
The Aqara Presence Sensor FP2 is a mmWave presence detector supporting multiple detection zones.
It also contains a light level sensor.
The sensor is powered over a USB-C connection, like the Aqara FP1 Human Presence Sensor.
However, unlike the FP1, the FP2 communicates over WiFi rather than Zigbee.
It supports HomeKit natively, exposing an _Occupancy Sensor_ and _Light Sensor_ service by default.

The FP2 can be bound to the Aqara app, next to its pairing with HomeKit.
It is configured through the Aqara app, as far as I can tell over the Aqara Home server in the cloud.
Once configured, the sensor can be unbound from the app, and no longer communicates with the Aqara Home server.
For each configured detection zone, an additional _Occupancy Sensor_ service is exposed to HomeKit.

### Virtual Device
The virtual device consist of a number of CLIPPresence and CLIPLightLevel `sensors` resources
on the deCONZ gateway ~~or the Hue bridge~~.
`fp2-proxy` creates the CLIP resources and mirrors state changes of the FP2 to these,
effectively creating a proxy FP2 sensor on the deCONZ gateway or Hue bridge.

To REST API clients, including Homebridge deCONZ ~~and Homebridge Hue2~~, these CLIP resources are similar to the ZHAPresence and ZHALightLevel resources for a Zigbee motion sensor.
Only the `state` of the CLIP resources is updated through the API, instead of from the Zigbee device.

### Configuration
Without any command arguments, `fp2-proxy` connects to and monitors paired FP2 devices,
mirroring any state changes to the corresponding virtual devices on the deCONZ gateway.
Typically, you would run `fp2-proxy` as a service on system startup.
I recommend running `fp2-proxy` on the same server as deCONZ.

`fp2-proxy` keeps its configuration in a hidden configuration file, `~/.fp2-proxy`.
It contains parameters like the API key for the deCONZ gateway, and the HomeKit setup code for the FP2.
While running, `fp-proxy` monitors the configuration file for changes,
adding or deleting virtual FP2 devices on the deCONZ gateway, as FP2 devices are paired or unpaired.
To pair or unpair FP2 devices, run `fp-proxy pair` or `fp-proxy unpair`.

## Acknowledgements
Conceptually, `fp2-proxy` consists of a HAP client to connect to the FP2 devices, and a REST API client to connect to the deCONZ gateway or Hue bridge.
The HAP client is from Andi's [hap-proxy](https://github.com/Supereg/hap-proxy).
The REST API clients are from Homebridge deCONZ and Homebridge Hue2.
