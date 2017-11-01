#!/usr/bin/env node

'use strict'

const fs = require('fs-extra')
const path = require('path')
const yaml = require('js-yaml')


if (process.argv.length > 2) {
    fs.writeFileSync(process.argv[2] + '.yaml', yaml.safeDump(require(process.argv[2]), { indent: 4, lineWidth: 999999999 }))
}
