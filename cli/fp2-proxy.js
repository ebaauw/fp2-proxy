#!/usr/bin/env node

// fp2-proxy.js
// Copyright © 2023-2025 Erik Baauw. All rights reserved.
//
// Proxy for Aqara Presence Sensor FP2.

'use strict'

const Fp2Proxy = require('../lib/Fp2Proxy')
const pkgJson = require('../package.json')

new Fp2Proxy(pkgJson).main()
