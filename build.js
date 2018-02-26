#!/usr/bin/env node


'use strict'

const async = require('async')
const fs = require('fs-extra')
const klaw = require('klaw')
const path = require('path')

const renderer = require('./renderer.js')



if (process.argv.length <= 2) {
    throw new Error('Give config Yaml file as 1st parameter!')
}



const render = new renderer(process.argv[2])

// const theEnd = () => {
//     let endDate = new Date()
//     let duration = (endDate.getTime() - startDate.getTime()) / 1000
//     let files = []
//     let filesForDelete = []
//     let filesDeleted = 0
//
//     for (let i = 0; i < buildFiles.length; i++) {
//         if (files.indexOf(buildFiles[i].path.replace(/\\/g, '/')) === -1) {
//             files.push(buildFiles[i].path.replace(/\\/g, '/'))
//         }
//     }
//
//     console.log(files.length + ' files created - ' + duration.toFixed(2) + 's - ' + (files.length / duration).toFixed(2) + 'fps')
//
//     if (process.argv[3] === 'cleanup') {
//         buildErrors = buildErrors + sourceFiles.length
//         if (buildErrors === 0) {
//
//             klaw(appConf.build).on('data', item => {
//                 if (files.indexOf(item.path.replace(/\\/g, '/')) === -1 && item.path.replace(/\\/g, '/') !== appConf.build.replace(/\\/g, '/')) {
//                     filesForDelete.push(item.path)
//                 }
//             }).on('end', function () {
//                 filesForDelete.reverse()
//                 for (var i = 0; i < filesForDelete.length; i++) {
//                     let file = filesForDelete[i]
//                     let protect = false
//
//                     for (let i = 0; i < appConf.protectedFromCleanup.length; i++) {
//                         if (appConf.protectedFromCleanup[i] && file.startsWith(path.join(appConf.build, appConf.protectedFromCleanup[i]))) {
//                             protect = true
//                             break
//                         }
//                     }
//
//                     if (!protect) {
//                         try {
//                             if (fs.lstatSync(file).isFile()) {
//                                 fs.unlinkSync(file)
//                                 filesDeleted++
//                                 console.log('DELETED: ' + file)
//                             } else if (fs.lstatSync(file).isDirectory() && fs.readdirSync(file).length === 0) {
//                                 fs.rmdirSync(file)
//                                 filesDeleted++
//                                 console.log('DELETED: ' + file)
//                             }
//                         } catch (e) {
//                             console.log(e)
//                         }
//                     }
//
//                 }
//                 console.log(filesDeleted + (filesDeleted > 1 ? ' files deleted' : ' file deleted'))
//             })
//         } else {
//             console.log('No files deleted because ' + buildErrors + (buildErrors === 0 || buildErrors > 1 ? ' errors' : ' error'))
//         }
//     }
// }



var sourcePugFiles = []
var sourceStylusFiles = []
var sourceJsFiles = []
var filesToRender = 0
var buildErrors = 0


klaw(render.sourceDir).on('data', item => {
    if (!fs.lstatSync(item.path).isFile()) { return }

    const dirName = path.dirname(item.path)
    const fileName = path.basename(item.path)


    if (fileName.startsWith('_')) { return }
    if (!fileName.endsWith('.pug') && !fileName.endsWith('.js') && !fileName.endsWith('.styl')) { return }

    if (render.paths.length) {
        var ignore = true
        for (var i = 0; i < render.paths.length; i++) {
            if (render.paths[i] && item.path.startsWith(path.join(render.sourceDir, render.paths[i]))) {
                ignore = false
                break
            }
        }
        if (ignore) { return }
    }

    if (fileName.startsWith('index.') && fileName.endsWith('.pug') && sourcePugFiles.indexOf(dirName) === -1) {
        sourcePugFiles.push(dirName)
    }
    if (fileName.endsWith('.js') && sourceJsFiles.indexOf(dirName) === -1) {
        sourceJsFiles.push(item.path)
    }
    if (fileName.endsWith('.styl') && sourceStylusFiles.indexOf(dirName) === -1) {
        sourceStylusFiles.push(item.path)
    }
}).on('end', function () {
    sourcePugFiles.sort()

    const startDate = new Date()

    console.log(sourcePugFiles.length + ' .pug files to render')
    console.log(sourceJsFiles.length + ' .js files to render')
    console.log(sourceStylusFiles.length + ' .styl files to render')

    async.parallel({
        html: callback => {
            let buildFiles = []
            async.each(sourcePugFiles, (source, callback) => {
                render.makeHTML(source, (err, files) => {
                    if (files && files.length) { buildFiles = buildFiles.concat(files) }

                    callback(null)
                })
            }, err => {
                const duration = ((new Date()).getTime() - startDate.getTime()) / 1000
                console.log(`${buildFiles.length} .html files created - ${duration.toFixed(2)}s - ${(buildFiles.length / duration).toFixed(2)}fps`)

                callback(null, buildFiles)
            })
        },
        css: callback => {
            render.makeCSS(sourceStylusFiles, (err, files) => {
                const duration = ((new Date()).getTime() - startDate.getTime()) / 1000
                console.log(`${files.length} .css files created - ${duration.toFixed(2)}s - ${(files.length / duration).toFixed(2)}fps`)

                callback(null, files)
            })
        },
        js: callback => {
            render.makeJS(sourceJsFiles, (err, files) => {
                const duration = ((new Date()).getTime() - startDate.getTime()) / 1000
                console.log(`${files.length} .js files created - ${duration.toFixed(2)}s - ${(files.length / duration).toFixed(2)}fps`)

                callback(null, files)
            })
        }
    }, (err, build) => {
        if (err) { console.log(err) }
    })
})
