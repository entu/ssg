#!/usr/bin/env node

'use strict'

const fs = require('fs')
const fse = require('fs-extra')
const op = require('object-path')
const path = require('path')

const renderer = require('./renderer.js')

var appConf = {}
var buildFiles = []


if (process.argv.length <= 2) {
    throw new Error('Give config Yaml file as 1st parameter!')
}


renderer.openConfFile(process.argv[2], (err, conf) => {
    if (err) { throw err }

    appConf = conf

    fse.walk(appConf.source).on('data', item => {
        if (!fs.lstatSync(item.path).isFile() ) { return }

        let filePath = path.dirname(item.path)
        let fileName = path.basename(item.path)
        let fileExt = path.extname(item.path)

        switch(fileExt) {
            case '.jade':
                if (fileName === 'index.jade' || fileName.search(/^index\..{2}\.jade$/) === 0) {
                    buildFiles.push(item.path)
                    renderer.makeHTML(item.path, false, (err, files) => {
                        if (err) { console.error(err.message) }
                        // console.log(item.path)
                    })
                }
                break
            case '.js':
                if (fileName.indexOf('_') !== 0) {
                    buildFiles.push(item.path)
                    renderer.makeJS(item.path, (err, files) => {
                        if (err) { console.error(err.message) }
                        // console.log(item.path)
                    })
                }
                break
            case '.styl':
                if (fileName.indexOf('_') !== 0) {
                    buildFiles.push(item.path)
                    renderer.makeCSS(item.path, (err, files) => {
                        if (err) { console.error(err.message) }
                        // console.log(item.path)
                    })
                }
                break
            default:
                // console.log(item.path)
        }
    }).on('end', function () {
        // console.dir(buildFiles)
    })
})
