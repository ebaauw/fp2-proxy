#!/usr/bin/env node

// fp2-proxy.js
// Copyright © 2023-2025 Erik Baauw. All rights reserved.
//
// Proxy for Aqara Presence Sensor FP2.

import { createRequire } from 'node:module'

import { Fp2Proxy } from '../lib/Fp2Proxy.js'

const require = createRequire(import.meta.url)
const packageJson = require('../package.json')

new Fp2Proxy(packageJson).main()
