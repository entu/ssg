'use strict'

const {remote} = require('electron')
const {app, dialog, shell} = remote
const renderer = require('../renderer.js')

var confFile = localStorage.getItem('confFile')
var appConf = {}
var serverStarted = false
var serverUrl = ''


document.getElementById('tools-footer-link').innerHTML = app.getVersion()


document.addEventListener('keydown', e => {
    if (e.which === 123) {
        remote.getCurrentWindow().toggleDevTools()
    } else if (e.which === 116) {
        location.reload()
    }
})


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

            document.getElementById('title').innerHTML = confFile.replace(app.getPath('home'), '~')
            document.getElementById('source').innerHTML = appConf.source.replace(app.getPath('home'), '~')
            document.getElementById('build').innerHTML = appConf.build.replace(app.getPath('home'), '~')

            clearLog()

            renderer.watchFiles((err, data) => {
                if (err) {
                    addLogError(
                        err.event,
                        err.source,
                        `javascript:shell.showItemInFolder('${appConf.source + err.source}')`,
                        err.error.toString().trim()
                    )
                } else {
                    for (var i = 0; i < data.build.length; i++) {
                        addLog(
                            data.event,
                            data.source,
                            `javascript:shell.showItemInFolder('${appConf.source + data.source}')`,
                            data.build[i].replace(/\\/g, '/').replace('/index.html', ''),
                            `javascript:openUrl('${serverUrl + data.build[i].replace(/\\/g, '/').replace('index.html', '')}')`
                        )
                    }
                }
            })
        }
    })
}


var openUrl = (url) => {
    if (serverStarted) {
        shell.openExternal(url || serverUrl)
        return
    }

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

            let myNotification = new Notification('Entu CMS', {
                body: `Server started at ${serverUrl}`
            })
            myNotification.onclick = () => {
                shell.openExternal(serverUrl)
            }

            shell.openExternal(url || serverUrl)
        }
    })
}


var clearLog = () => {
    document.getElementById('log-table').innerHTML = ''
}


var addLogError = (event, source, sourceLink, error) => {
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


var addLog = (event, source, sourceLink, build, buildLink) => {
    document.getElementById('log-table').innerHTML = document.getElementById('log-table').innerHTML + `
        <tr class="log">
            <td style="width:5%">${event}</td>
            <td style="width:5%"><a href="${sourceLink}">${source}</a></td>
            <td style="width:90%"><a href="${buildLink}">${build || '/'}</a></td>
        </tr>
    `
    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight
}


if (confFile) {
    startRendering()
} else {
    openConf()
}
