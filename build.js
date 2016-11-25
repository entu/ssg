#!/usr/bin/env node

'use strict'

const fs = require('fs')
const fse = require('fs-extra')
const op = require('object-path')
const path = require('path')

const renderer = require('./renderer.js')

var startDate = new Date()
var appConf = {}
var sourceFiles = []
var buildFiles = []
var filesToRender = 0
var buildErrors = 0


if (process.argv.length <= 2) {
    throw new Error('Give config Yaml file as 1st parameter!')
}


var theEnd = () => {
    let endDate = new Date()
    let duration = (endDate.getTime() - startDate.getTime()) / 1000
    let f = []

    for (let i = 0; i < buildFiles.length; i++) {
        if (f.indexOf(buildFiles[i]) === -1) {
            f.push(buildFiles[i])
        }
    }

    console.log(f.length + ' files created - ' + duration.toFixed(2) + 's - ' + (f.length / duration).toFixed(2) + 'fps')

    buildErrors = buildErrors + sourceFiles.length
    if (buildErrors === 0) {
        fse.walk(appConf.build).on('data', item => {
            if (!fs.lstatSync(item.path).isFile() ) { return }

            if (f.indexOf(item.path) === -1) {
                // console.log('DELETE: ' + item.path)
            }
        })
    } else {
        console.log('No files deleted because ' + buildErrors + (buildErrors > 1 ? ' errors' : ' error'));
    }
}

var fileBuildEnd = (err, files) => {
    if (err) {
        console.log(err)
    } else {
        buildErrors--
        if (files && files.length) { buildFiles = buildFiles.concat(files) }
    }
    filesToRender--
    if (filesToRender === 0) { theEnd() }
}


renderer.openConfFile(process.argv[2], (err, conf) => {
    if (err) { throw err }

    appConf = conf

    fse.walk(appConf.source).on('data', item => {
        if (!fs.lstatSync(item.path).isFile() ) { return }

        let fileName = path.basename(item.path)
        let fileExt = path.extname(item.path)

        switch(fileExt) {
            case '.jade':
                if (fileName === 'index.jade' || fileName.search(/^index\..{2}\.jade$/) === 0) {
                    if (sourceFiles.indexOf(path.dirname(item.path)) === -1) {
                        sourceFiles.push(path.dirname(item.path))
                    }
                }
                break
            case '.js':
                if (fileName.indexOf('_') !== 0) {
                    sourceFiles.push(item.path)
                }
                break
            case '.styl':
                if (fileName.indexOf('_') !== 0) {
                    sourceFiles.push(item.path)
                }
                break
            default:
                break
        }
    }).on('end', function () {
        filesToRender = sourceFiles.length

        console.log(sourceFiles.length + ' files to render')
        sourceFiles.sort()

        let buildDate = new Date()

        for (var i = 0; i < sourceFiles.length; i++) {
            let file = sourceFiles[i]
            let fileName = path.basename(file)
            let fileExt = path.extname(file)

            switch(fileExt) {
                case '.js':
                    renderer.makeJS(file, fileBuildEnd)
                    break
                case '.styl':
                    renderer.makeCSS(file, fileBuildEnd)
                    break
                default:
                    renderer.makeHTML(file, false, fileBuildEnd)
                    break
            }
        }
    })
})
