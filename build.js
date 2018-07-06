#!/usr/bin/env node



'use strict'

if (process.argv.length <= 2) {
    throw new Error('Give config Yaml file as 1st parameter!')
}



const async = require('async')
const fs = require('fs-extra')
const klaw = require('klaw')
const path = require('path')

const renderer = require('./renderer.js')
const render = new renderer(process.argv[2])
const startDate = new Date()



var sourcePugFiles = []
var sourceStylusFiles = []
var sourceJsFiles = []



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
//             klaw(appConf.build).on('data', (item) => {
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



var puildPugPaths = []
var ignorePuildPugPaths = false
var buildPug = false
var buildStyle = false
var buildJs = false

try {
    const lastBuild = JSON.parse(fs.readFileSync(path.join(render.buildDir, 'build.json'), 'utf8'))

    if (lastBuild.commit) {
        const gitPath = require('child_process').execSync(`git -C "${render.sourceDir}" rev-parse --show-toplevel`).toString().trim()
        const changedFiles = require('child_process').execSync(`git -C "${render.sourceDir}" diff --name-only ${lastBuild.commit}`).toString().trim().split('\n')
        const addedFiles = require('child_process').execSync(`git -C "${render.sourceDir}" ls-files -o --exclude-standard --full-name`).toString().trim().split('\n')

        changedFiles.concat(addedFiles).forEach(f => {
            let file = path.join(gitPath, f)

            if (!f || !file.startsWith(render.sourceDir)) { return }

            if (file.endsWith('.pug') || file.endsWith('.yaml')) {
                let pathname = path.dirname(path.join(gitPath, f))
                if (puildPugPaths.indexOf(pathname) === -1) {
                    puildPugPaths.push(path.dirname(file))
                }
                buildPug = true
            }

            if (file.endsWith('.styl')) {
                buildStyle = true
            }

            if (file.endsWith('.js')) {
                buildJs = true
            }
        })
    }
} catch (e) {
    console.error(`Can\'t get last commit. Will run full build.`)

    ignorePuildPugPaths = true
    buildPug = true
    buildStyle = true
    buildJs = true
}



klaw(render.sourceDir).on('data', (item) => {
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

    if (buildPug && fileName.startsWith('index.') && fileName.endsWith('.pug') && sourcePugFiles.indexOf(dirName) === -1 && (ignorePuildPugPaths || puildPugPaths.indexOf(dirName) !== -1)) {
        sourcePugFiles.push(dirName)
    }
    if (buildJs && !fileName.startsWith('_') && fileName.endsWith('.js') && sourceJsFiles.indexOf(dirName) === -1) {
        sourceJsFiles.push(item.path)
    }
    if (buildStyle && !fileName.startsWith('_') && fileName.endsWith('.styl') && sourceStylusFiles.indexOf(dirName) === -1) {
        sourceStylusFiles.push(item.path)
    }
}).on('end', function () {
    sourcePugFiles.sort()

    console.log(sourcePugFiles.length + ' .pug files to render')
    console.log(sourceJsFiles.length + ' .js files to render')
    console.log(sourceStylusFiles.length + ' .styl files to render')

    async.parallel({
        html: (callback) => {
            let buildFiles = []
            async.eachSeries(sourcePugFiles, (source, callback) => {
                render.makeHTML(source, (err, files) => {
                    if (err) { return callback(err) }

                    if (files && files.length) { buildFiles = buildFiles.concat(files) }

                    callback(null)
                })
            }, (err) => {
                if (err) { return callback(err) }

                const duration = ((new Date()).getTime() - startDate.getTime()) / 1000
                console.log(`${buildFiles.length} .html files created - ${duration.toFixed(2)}s - ${(buildFiles.length / duration).toFixed(2)}fps`)

                callback(null, buildFiles || [])
            })
        },
        css: (callback) => {
            render.makeCSS(sourceStylusFiles, (err, files) => {
                if (err) { return callback(err) }

                const duration = ((new Date()).getTime() - startDate.getTime()) / 1000
                console.log(`${files.length} .css files created - ${duration.toFixed(2)}s - ${(files.length / duration).toFixed(2)}fps`)

                callback(null, files || [])
            })
        },
        js: (callback) => {
            render.makeJS(sourceJsFiles, (err, files) => {
                if (err) { return callback(err) }

                const duration = ((new Date()).getTime() - startDate.getTime()) / 1000
                console.log(`${files.length} .js files created - ${duration.toFixed(2)}s - ${(files.length / duration).toFixed(2)}fps`)

                callback(null, files || [])
            })
        }
    }, (err, build) => {
        if (err) {
            if (Array.isArray(err)) {
                console.error(`\nERROR: ${err[1]}\n${err[0].message || err[0].stack || err[0]}\n`)
            } else {
                console.error(`\nERROR:\n${err.message || err.stack || err}\n`)
            }

            process.exit(1)
        }

        let commit = null

        try {
            commit = require('child_process').execSync(`git -C "${render.sourceDir}" rev-parse HEAD`).toString().trim()
        } catch (e) {
            console.error(`Can\'t get last commit.`)
        }

        const state = {
            time: startDate.getTime(),
            commit: commit,
            build: build,
            ms: (new Date()).getTime() - startDate.getTime()
        }

        fs.outputFileSync(path.join(render.buildDir, 'build.json'), JSON.stringify(state))
    })
})
