'use strict'

const {remote} = require('electron')
const {app, dialog, shell} = remote
const async = require('async')
const renderer = require('../renderer.js')
const path = require('path')
const git = require('simple-git')


var confFile = localStorage.getItem('confFile')
var gitRepo = ''
var gitRemote = ''
var gitBranch = ''
var appConf = {}
var serverStarted = false
var serverUrl = ''
var errors = {}


document.getElementById('version').innerHTML = app.getVersion()
document.getElementById('tools').style.height = window.innerHeight + 'px'
document.getElementById('log').style.height = window.innerHeight + 'px'


window.addEventListener('resize', function(e){
    document.getElementById('tools').style.height = window.innerHeight + 'px'
    document.getElementById('log').style.height = window.innerHeight + 'px'
})


var openConf = () => {
    async.waterfall([
        callback => {
            renderer.openConfFile(confFile, callback)
        },
        (conf, callback) => {
            appConf = conf
            git(path.dirname(confFile)).revparse(['--show-toplevel'], callback)
        },
        (repo, callback) => {
            gitRepo = repo.trim()
            git(gitRepo).raw(['config', '--get', 'remote.origin.url'], callback)
        },
        (remote, callback) => {
            gitRemote = remote.trim()
            git(gitRepo).branchLocal(callback)
        },
        (branches, callback) => {
            gitBranch = branches.current

            let select = []
            for (let i = 0; i < branches.all.length; i++) {
                select.push(`<option value="${branches.all[i]}" ${(branches.all[i] === branches.current ? 'selected' : '')}>${branches.all[i]}</option>`)
            }
            document.getElementById('branch').innerHTML = select.join('')

            callback(null)
        }
    ], err => {
        if (err) {
            dialog.showMessageBox({
                type: 'error',
                message: err.toString(),
                buttons: ['OK']
            }, () => {
                confFile = null
                openConfFile()
            })
        } else {
            serverUrl = `http://localhost:${appConf.server.port}`

            document.getElementById('remote').innerHTML = gitRemote
            document.getElementById('repo').innerHTML = gitRepo.replace(app.getPath('home'), '~')
            document.getElementById('conf').innerHTML = confFile.replace(gitRepo, '.')
            document.getElementById('source').innerHTML = appConf.source.replace(gitRepo, '.')
            document.getElementById('build').innerHTML = appConf.build.replace(gitRepo, '.')
            document.getElementById('preview').innerHTML = serverUrl
            document.getElementById('tools').style.display = 'block'

            // startRendering()
        }
    })
}


var openConfFile = () => {
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

    openConf()
}


var setBranch = () => {
    let e = document.getElementById('branch')
    gitBranch = e.options[e.selectedIndex].value

    git(gitRepo).checkout(gitBranch).fetch().status(function (err, data) {
        if (err) { console.error(err) }
    })
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
                openConfFile()
                return
            })
        } else {
            appConf = conf
            serverUrl = `http://localhost:${appConf.server.port}`

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

            serverUrl = `http://localhost:${appConf.server.port}`
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
    openConf()
} else {
    openConfFile()
}
