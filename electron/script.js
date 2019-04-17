'use strict'

const { remote } = require('electron')
const { app, dialog, shell } = remote
const async = require('async')
const git = require('simple-git')
const path = require('path')

const renderer = require('../index.js')


var confFile = localStorage.getItem('confFile')
var render
var gitRepo = ''
var gitRemote = ''
var gitBranch = ''
var appConf = {}
var serverStarted = false
var serverUrl = ''
var errors = {}
var watcher


document.getElementById('version').innerHTML = app.getVersion()


var openConf = () => {
    render = new renderer(confFile)

    if(!render.sourceDir || !render.buildDir) {
        localStorage.removeItem('confFile')
        remote.getCurrentWindow().reload()
    }

    async.waterfall([
        (callback) => {
            git(path.dirname(confFile)).revparse(['--show-toplevel'], (err, repo) => {
                if(!repo) { return callback('NOGIT') }

                callback(null, repo)
            })
        },
        (repo, callback) => {
            if(!repo) { return callback('NOGIT') }

            gitRepo = repo.trim()
            git(gitRepo).raw(['config', '--get', 'remote.origin.url'], callback)
        },
        (remote, callback) => {
            if(!remote) { return callback('NOGIT') }

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

        //     git(gitRepo).log({splitter: 'commit', '--max-count': '30'}, callback)
        // },
        // (log, callback) => {
        //     for (let i = 0; i < log.all.length; i++) {
        //         let dt = new Date(log.all[i].date)
        //
        //         document.getElementById('log-table').innerHTML = document.getElementById('log-table').innerHTML + `
        //             <tr class="log">
        //                 <td>${log.all[i].message}</td>
        //                 <td class="nowrap">${log.all[i].author_name}</td>
        //                 <td class="nowrap" style="text-align:right;">${dt.toLocaleDateString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
        //             </tr>
        //         `
        //     }
        //
        //     git(gitRepo).show({'--name-only': null, '0da5fc637ea889d8ca5c3ca9b4fcaed78d077458': null}, callback)
        // },
        // (diff, callback) => {
            callback(null)
        }
    ], err => {
        if (err && err !== 'NOGIT') {
            dialog.showMessageBox({
                type: 'error',
                message: err.toString(),
                buttons: ['OK']
            }, () => {
                confFile = null
                openConfFile()
            })

            return
        } else if (err === 'NOGIT') {
            document.getElementById('remote').innerHTML = 'No Git'

            gitRepo = path.dirname(confFile)
        } else {
            document.getElementById('remote').innerHTML = gitRemote.replace('http://', '').replace('https://', '')
            document.getElementById('remote').setAttribute('title', gitRemote)
        }

        document.getElementById('repo').innerHTML = gitRepo.replace(app.getPath('home'), '~')
        document.getElementById('repo').setAttribute('title', gitRepo)

        document.getElementById('conf').innerHTML = confFile.replace(gitRepo, '.')
        document.getElementById('conf').setAttribute('title', confFile)

        document.getElementById('source').innerHTML = render.sourceDir.replace(gitRepo, '.')
        document.getElementById('source').setAttribute('title', render.sourceDir)

        document.getElementById('build').innerHTML = render.buildDir.replace(gitRepo, '.')
        document.getElementById('build').setAttribute('title', render.buildDir)

        document.getElementById('log').style.left = document.getElementById('tools').offsetWidth + 'px'

        startBuild()
        startWatch()
        startServe()
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
    clearLog()

    let e = document.getElementById('branch')
    gitBranch = e.options[e.selectedIndex].value

    git(gitRepo).checkout(gitBranch).fetch().status(function (err, data) {
        if (err) { console.error(err) }

        openConf()
    })
}


var startBuild = () => {
    render.build(false, err => {
        if (err) {
            addLogError(
                'BUILD',
                err,
                false
            )
        }
    })
}


var startWatch = () => {
    render.watch((err, log) => {
        if (err) {
            addLogError(
                err.event,
                err.error,
                false
            )
        } else if (log) {
            addLog(
                log.event,
                log.filename,
                log.files
            )
        }
    })
}


var startServe = () => {
    render.serve((err) => {
        serverUrl = `http://localhost:${render.serverPort}`
        document.getElementById('preview').innerHTML = serverUrl
        document.getElementById('preview').setAttribute('href', `javascript:shell.openExternal('${serverUrl}');`)

        if (err) {
            addLogError(
                err.event,
                err.error.toString().trim(),
                false
            )
        } else {
            serverStarted = true

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


var addLogError = (event, error, notify) => {
    if (notify) {
        let myNotification = new Notification('Error in file', { body: source })
    }

    document.getElementById('log-table').innerHTML = document.getElementById('log-table').innerHTML + `
        <tr class="error">
            <td style="width:5%">${event}</td>
            <td style="width:95%" colspan="2">
                <pre>${error}</pre>
            </td>
        </tr>
    `

    document.getElementById('log').scrollTop = document.getElementById('log').scrollHeight
}


var addLog = (event, source, build) => {
    let links = []
    for (let i = 0; i < build.length; i++) {
        let buildUrl = build[i].build.replace(render.buildDir, '').replace(/\\/g, '/').replace('/index.html', '')
        links.push(`<a class="${build[i].alias ? 'alias' : ''}" href="javascript:shell.openExternal('${serverUrl + buildUrl}')">${buildUrl || '/'}</a>`)
    }
    links.sort()
    document.getElementById('log-table').innerHTML = document.getElementById('log-table').innerHTML + `
        <tr class="log">
            <td style="width:5%">${event}</td>
            <td style="width:5%"><a href="javascript:shell.showItemInFolder('${source}')" title="${source}">${source.replace(render.sourceDir ,'.')}</a></td>
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
