'use strict'

const {remote} = require('electron')
const {app, dialog, shell} = remote
const renderer = require('../renderer.js')

var confFile = localStorage.getItem('confFile')
var appConf = {}
var serverStarted = false
var serverUrl = ''
var errors = {}


document.getElementById('tools-footer-link').innerHTML = app.getVersion()


var openConf = () => {
    var files = dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            { name: 'Yaml files', extensions: ['yaml'] }
        ]
    })
    if (!files && !confFile) { app.quit() }
    if (!files) { return }

    confFile = files[0]
    localStorage.setItem('confFile', confFile)

    location.reload()
}


var startRendering = () => {
    renderer.openConfFile(confFile, (err, conf) => {
        if (err) {
            dialog.showMessageBox({
                type: 'error',
                message: err.toString(),
                buttons: ['OK']
            }, () => {
                confFile = null
                openConf()
                return
            })
        } else {
            appConf = conf
            serverUrl = `http://localhost:${appConf.port}`

            document.getElementById('conf').innerHTML = confFile.replace(app.getPath('home'), '~')
            document.getElementById('source').innerHTML = appConf.source.replace(app.getPath('home'), '~')
            document.getElementById('build').innerHTML = appConf.build.replace(app.getPath('home'), '~')

            clearLog()

            renderer.watchFiles((err, data) => {
                if (err) {
                    badge(err.source, true)
                    addLogError(
                        err.event,
                        err.source,
                        `javascript:shell.showItemInFolder('${appConf.source + err.source}')`,
                        err.error.toString().trim()
                    )
                } else {
                    if (data.build.length > 0) {
                        badge(data.source, false)
                        addLog(
                            data.event,
                            data.source,
                            data.build
                        )
                    }
                }
            })
        }
    })
}


var openUrl = (url) => {
    shell.openExternal(url || serverUrl)
    return
}


var startServer = () => {
    renderer.startServer((err) => {
        if (err) {
            addLogError(
                err.event,
                err.source,
                `javascript:openUrl('${serverUrl + err.source}')`,
                err.error.toString().trim()
            )
        } else {
            serverStarted = true

            serverUrl = `http://localhost:${appConf.port}`
            document.getElementById('preview').innerHTML = serverUrl

            let myNotification = new Notification('Server started', { body: serverUrl })
            myNotification.onclick = () => {
                shell.openExternal(serverUrl)
            }
        }
    })
}


var clearLog = () => {
    document.getElementById('log-table').innerHTML = ''
}


var addLogError = (event, source, sourceLink, error) => {
    let myNotification = new Notification('Error in file', { body: source })

    document.getElementById('log-table').innerHTML = document.getElementById('log-table').innerHTML + `
        <tr class="error">
            <td style="width:5%">${event}</td>
            <td style="width:95%" colspan="2">
                <a href="${sourceLink}">${source}</a><br>
                <pre>${error}</pre>
            </td>
        </tr>
    `
    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight
}


var addLog = (event, source, build) => {
    let links = []
    for (var i = 0; i < build.length; i++) {
        let buildUrl = build[i].path.replace(appConf.build, '').replace(/\\/g, '/').replace('/index.html', '')
        links.push(`<a class="${build[i].alias ? 'alias' : ''}" href="javascript:openUrl('${serverUrl + buildUrl}')">${buildUrl || '/'}</a>`)
    }
    links.sort()
    document.getElementById('log-table').innerHTML = document.getElementById('log-table').innerHTML + `
        <tr class="log">
            <td style="width:5%">${event}</td>
            <td style="width:5%"><a href="javascript:shell.showItemInFolder('${appConf.source + source}')">${source}</a></td>
            <td style="width:90%">${links.join('<br>')}</td>
        </tr>
    `

    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight
}

var badge = (source, add) => {
    if (add) {
        errors[source] = true
    } else {
        delete errors[source]
    }

    app.setBadgeCount(Object.keys(errors).length)
}


if (confFile) {
    startRendering()
    startServer()
} else {
    openConf()
}
