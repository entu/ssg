#!/usr/bin/env node

'use strict'

if (process.argv.length <= 2) {
    throw new Error('Give config Yaml file as 1st parameter!')
}

const renderer = require('./index.js')
const render = new renderer(process.argv[2])
const fullRun = process.argv.length >= 4 && process.argv[3].toLowerCase() === 'full'

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
