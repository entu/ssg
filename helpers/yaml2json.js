#!/usr/bin/env node

'use strict'

const fs = require('fs-extra')
const path = require('path')
const yaml = require('js-yaml')


if (process.argv.length > 2) {
    fs.writeFileSync(process.argv[2] + '.json', JSON.stringify(yaml.safeLoad(fs.readFileSync(process.argv[2], 'utf8')), null, 4))
}
