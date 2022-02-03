#!/usr/bin/env node

'use strict'

const renderer = require('./ssg.js')

if (process.argv.length <= 2) {
    throw new Error('Give config Yaml file as 1st parameter!')
}

let configFile = null
let doServe = false
let fullRun = true

if(['build', 'serve'].includes(process.argv[2])) {
    doServe = process.argv[2].toLowerCase() === 'serve'
    configFile = process.argv[3]
    fullRun = process.argv[4] && process.argv[4].toLowerCase() === 'full'
} else {
    configFile = process.argv[2]
    fullRun = process.argv[3] && process.argv[3].toLowerCase() === 'full'
}

const render = new renderer(configFile)

render.build(fullRun, err => {
    if (err) {
        if (Array.isArray(err)) {
            console.error(`\nERROR: ${err[1]}\n${err[0].message || err[0].stack || err[0]}\n`)
        } else {
            console.error(`\nERROR:\n${err.message || err.stack || err}\n`)
        }

        process.exit(1)
    }
})

if(doServe) {
    render.serve((err) => {
        if (err) {
            console.error(`\nERROR: ${JSON.stringify(err, null, 2)}\n`)
        } else {
            console.log(`Server started - http://localhost:${render.serverPort}`)
        }
    })

    render.watch((err, log) => {
        if (err) {
            console.error(`\nERROR: ${err.event} - ${err.error}\n`)
        } else if (log) {
            console.log(`${log.event} - ${log.filename}:\n    ${log.files.map(x => x.build.replace(render.buildDir, '').replace(/\\/g, '/').replace('/index.html', '')).join('\n    ')}`)
        }
    })
}

