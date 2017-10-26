#!/usr/bin/env node

'use strict'

const fs = require('fs')
const path = require('path')
const html2jade = require('html2jade')


if (process.argv.length > 2) {
    html2jade.convertHtml(fs.readFileSync(process.argv[2], 'utf8'), { nspaces: 4, noemptypipe: true, donotencode: true, bodyless: true }, function (err, jade) {
        fs.writeFileSync(process.argv[2] + '.pug', jade)
    })
}
