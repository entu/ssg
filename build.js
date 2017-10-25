#!/usr/bin/env node

'use strict'

const async = require('async')
const fs = require('fs')
const fse = require('fs-extra')
const klaw = require('klaw')
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
    let files = []
    let filesForDelete = []
    let filesDeleted = 0

    for (let i = 0; i < buildFiles.length; i++) {
        if (files.indexOf(buildFiles[i].path.replace(/\\/g, '/')) === -1) {
            files.push(buildFiles[i].path.replace(/\\/g, '/'))
        }
    }

    console.log(files.length + ' files created - ' + duration.toFixed(2) + 's - ' + (files.length / duration).toFixed(2) + 'fps')

    if (process.argv[3] === 'cleanup') {
        buildErrors = buildErrors + sourceFiles.length
        if (buildErrors === 0) {

            klaw(appConf.build).on('data', item => {
                if (files.indexOf(item.path.replace(/\\/g, '/')) === -1 && item.path.replace(/\\/g, '/') !== appConf.build.replace(/\\/g, '/')) {
                    filesForDelete.push(item.path)
                }
            }).on('end', function () {
                filesForDelete.reverse()
                for (var i = 0; i < filesForDelete.length; i++) {
                    let file = filesForDelete[i]
                    let protect = false

                    for (let i = 0; i < appConf.protectedFromCleanup.length; i++) {
                        if (appConf.protectedFromCleanup[i] && file.startsWith(path.join(appConf.build, appConf.protectedFromCleanup[i]))) {
                            protect = true
                            break
                        }
                    }

                    if (!protect) {
                        try {
                            if (fs.lstatSync(file).isFile()) {
                                fs.unlinkSync(file)
                                filesDeleted++
                                console.log('DELETED: ' + file)
                            } else if (fs.lstatSync(file).isDirectory() && fs.readdirSync(file).length === 0) {
                                fs.rmdirSync(file)
                                filesDeleted++
                                console.log('DELETED: ' + file)
                            }
                        } catch (e) {
                            console.log(e)
                        }
                    }

                }
                console.log(filesDeleted + (filesDeleted > 1 ? ' files deleted' : ' file deleted'))
            })
        } else {
            console.log('No files deleted because ' + buildErrors + (buildErrors === 0 || buildErrors > 1 ? ' errors' : ' error'))
        }
    }
}

var fileBuildEnd = (err, files) => {
    if (err) {
        console.error(err)
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

    var limitedFiles = appConf.dev.paths.length > 0

    klaw(appConf.source).on('data', item => {
        if (!fs.lstatSync(item.path).isFile() ) { return }

        if (limitedFiles) {
            var ignore = true
            for (var i = 0; i < appConf.dev.paths.length; i++) {
                if (appConf.dev.paths[i] && item.path.startsWith(path.join(appConf.source, appConf.dev.paths[i]))) {
                    ignore = false
                    break
                }
            }
            if (ignore) { return }
        }

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
