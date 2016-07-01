const {remote} = require('electron')
const {app, dialog, shell} = remote
const renderer = require('../renderer.js')

var confFile = localStorage.getItem('confFile')
var appConf = {}
var serverStarted = false
var serverUrl = ''


document.getElementById('tools-footer').innerHTML = app.getVersion()


document.addEventListener('keydown', function (e) {
	if (e.which === 123) {
		remote.getCurrentWindow().toggleDevTools()
	} else if (e.which === 116) {
		location.reload()
	}
})


var openConf = function () {
    files = dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
            {name: 'Yaml files', extensions: ['yaml']}
        ]
    })
    if(!files && !confFile) { app.quit() }
    if(!files) { return }

    confFile = files[0]
    localStorage.setItem('confFile', confFile)

    location.reload()
}


var startRendering = function () {
    renderer.openConfFile(confFile, function (err, conf) {
        if(err) {
            dialog.showMessageBox({
                type: 'error',
                message: err.toString(),
                buttons: ['OK']
            }, function () {
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

            renderer.watchFiles(function (err, data) {
                if (err) {
                    addLogError(
                        err.event,
                        err.source,
                        `javascript:shell.showItemInFolder('${appConf.source+err.source}')`,
                        err.error.toString().trim()
                    )
                } else {
                    for (var i = 0; i < data.build.length; i++) {
                        addLog(
                            data.event,
                            data.source,
                            `javascript:shell.showItemInFolder('${appConf.source+data.source}')`,
                            data.build[i].replace('/index.html', ''),
                            `javascript:openUrl('${serverUrl+data.build[i].replace('index.html', '')}')`
                        )
                    }
                }
            })
        }
    })
}


var openUrl = function (url) {
    if (serverStarted) {
        shell.openExternal(url || serverUrl)
        return
    }

    renderer.startServer(function (err) {
        if (err) {
            addLogError(
                err.event,
                err.source,
                `javascript:openUrl('${serverUrl+err.source}')`,
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


var clearLog = function () {
    document.getElementById('log-table').innerHTML = ''
}


var addLogError = function (event, source, sourceLink, error) {
    document.getElementById('log-table').innerHTML = document.getElementById('log-table').innerHTML + `
        <tr class="error">
            <td>${event}</td>
            <td colspan="3">
                <a href="${sourceLink}">${source}</a><br>
                <pre>${error}</pre>
            </td>
        </tr>
    `
    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight
}


var addLog = function (event, source, sourceLink, build, buildLink) {
    document.getElementById('log-table').innerHTML = document.getElementById('log-table').innerHTML + `
        <tr class="log">
            <td>${event}</td>
            <td><a href="${sourceLink}">${source}</a></td>
            <td><a href="${buildLink}">${build || '/'}</a></td>
            <td width="100%"></td>
        </tr>
    `
    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight
}


if (confFile) {
    startRendering()
} else {
    openConf()
}
