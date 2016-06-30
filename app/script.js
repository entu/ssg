const {remote} = require('electron')
const {app, dialog, shell} = remote
const renderer = require('../renderer.js')
const async = require('async')

var confFile = ''
var appConf = {}
var serverUrl = ''

document.getElementById('tools-footer').innerHTML = app.getVersion()

async.waterfall([
    function(callback) {
        files = dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [
                {name: 'Yaml files', extensions: ['yaml']}
            ]
        })
        if(!files) { app.quit() }
        callback(null, files[0])
    },
    function(file, callback) {
        confFile = file
        renderer.openConfFile(confFile, callback)
    },
    function(conf, callback) {
        appConf = conf
        document.getElementById('title').innerHTML = confFile.replace(app.getPath('home'), '~')
        document.getElementById('source').innerHTML = appConf.source.replace(app.getPath('home'), '~')
        document.getElementById('build').innerHTML = appConf.build.replace(app.getPath('home'), '~')
        renderer.startServer(callback)
    },
    function(callback) {
        serverUrl = `http://localhost:${appConf.port}`
        document.getElementById('preview').innerHTML = serverUrl

        let myNotification = new Notification('Entu CMS', {
            body: `Server started at ${serverUrl}`
        })
        myNotification.onclick = () => {
            shell.openExternal(serverUrl)
        }

        callback(null)
    }
], function(err) {
    if(err) {
        dialog.showMessageBox({
            type: 'error',
            message: err.toString(),
            buttons: ['OK']
        }, function() {
            app.quit()
        })
    } else {
        renderer.watchFiles(function(err, data) {
            var log = document.getElementById('log-table')
            if (err) {
                log.innerHTML = log.innerHTML + `
                    <tr class="error">
                        <td>${err.event}</td>
                        <td colspan="3">
                            <a href="javascript:shell.showItemInFolder('${appConf.source+err.source}')">${err.source}</a><br>
                            <pre>${err.error.toString()}<pre>
                        </td>
                    </tr>
                `
            } else {
                for (var i = 0; i < data.build.length; i++) {
                    log.innerHTML = log.innerHTML + `
                        <tr class="log">
                            <td>${data.event}</td>
                            <td><a href="javascript:shell.showItemInFolder('${appConf.source+data.source}')">${data.source}</a></td>
                            <td><a href="javascript:shell.openExternal('${serverUrl+data.build[i].replace('index.html', '')}')">${data.build[i].replace('/index.html', '')}</a></td>
                            <td width="100%"></td>
                        </tr>
                    `
                }
            }
            document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight
        })
    }
})

document.addEventListener('keydown', function (e) {
	if (e.which === 123) {
		remote.getCurrentWindow().toggleDevTools()
	} else if (e.which === 116) {
		location.reload()
	}
})

var clearLog = function() {
    document.getElementById('log-table').innerHTML = ''
}
