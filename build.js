#!/usr/bin/env node

'use strict'

if (process.argv.length <= 2) {
    throw new Error('Give config Yaml file as 1st parameter!')
}

const renderer = require('./renderer.js')
const render = new renderer(process.argv[2])

render.build()
