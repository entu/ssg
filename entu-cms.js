#!/usr/bin/env node

var chokidar = require('chokidar')
var fs       = require('fs')
var fse      = require('fs-extra')
var http     = require('http')
var jade     = require('jade')
var md       = require('markdown-it')()
var path     = require('path')
var stylus   = require('stylus')
var yaml     = require('js-yaml')


// Markdown-it wrapper to handle empty text
var markdown = function (text) {
    if (text) {
        return md.render(text)
    }

    return ''
}


// Returns file path with locale if exists
var getFilePath = function (dirName, fileName, locale) {
    var localeFile = fileName.split('.')
    localeFile.splice(localeFile.length - 1, 0, locale)

    var localeFilePath = path.join(dirName, localeFile.join('.'))
    var filePath = path.join(dirName, fileName)

    if (fs.existsSync(localeFilePath)) {
        return localeFilePath
    } else if (fs.existsSync(filePath)) {
        return filePath
    }

    return false
}


// Generates HTMLs from template
var appConf = {}
var makeHTML = function (fileEvent, filePath) {
    var folderName = path.dirname(filePath)
    var fileName = path.basename(filePath)
    var locales = []

    if (fileName.split('.').length > 2) {
        locales = [fileName.split('.')[1]]
    } else {
        locales = appConf.locales
    }

    for (var l in locales) {
        if (!locales.hasOwnProperty(l)) { continue }

        try {
            // Get Jade template
            var jadeFile = getFilePath(folderName, 'index.jade', locales[l])
            if (!jadeFile) { continue }

            // Get and set data for Jade template
            var data = {
                page: {},
                D: {},
                G: {}
            }

            var dataFile = getFilePath(folderName, 'data.yaml', locales[l])
            if (dataFile) {
                data.D = yaml.safeLoad(fs.readFileSync(dataFile, 'utf8'))
            }
            for (var i in data.D.page) {
                if (!data.D.hasOwnProperty(i)) { continue }

                data.page[i] = data.D.page[i]
            }
            delete data.D.page

            data.page.language = data.page.language || locales[l]
            data.page.base = data.page.base || appConf.basePath
            data.page.path = data.page.path || path.dirname(jadeFile).replace(appConf.source, '').substr(1)
            data.pretty = data.pretty || appConf.jade.pretty
            data.basedir = data.basedir || appConf.jade.basedir

            data.G = appConf.data[locales[l]]
            data.G.md = markdown

            var html = jade.renderFile(jadeFile, data)
            var htmlDir = path.dirname(jadeFile.replace(appConf.source, path.join(appConf.build,  locales[l])))
            var htmlFile = path.join(htmlDir, 'index.html')

            fse.outputFileSync(htmlFile, html)

            console.log(fileEvent.toUpperCase() + ':', filePath.replace(appConf.source, ''), '>', htmlFile.replace(appConf.build, ''))
        } catch (e) {
            console.error('ERROR:', filePath.replace(appConf.source, ''), '>', e.message)
        }
    }
}


// Generates CSS from stylus
var stylesList = {}
var makeCSS = function (fileEvent, filePath) {
    var folderName = path.dirname(filePath)
    var fileName = path.basename(filePath)
    var locales = []

    if (fileName.split('.').length > 2) {
        locales = [fileName.split('.')[1]]
    } else {
        locales = appConf.locales
    }

    for (var l in locales) {
        if (!locales.hasOwnProperty(l)) { continue }

        try {
            if (!stylesList[locales[l]]) { stylesList[locales[l]] = {} }

            var styleFile = getFilePath(folderName, 'style.styl', locales[l])
            if (styleFile) {
                var styl = stylus(fs.readFileSync(styleFile, 'utf8')).set('warn', false).set('compress', !appConf.stylus.pretty)
                stylesList[locales[l]][folderName] = styl.render()
            } else {
                delete stylesList[locales[l]][folderName]
            }

            var css = []
            for (var s in stylesList[locales[l]]) {
                if (!stylesList[locales[l]].hasOwnProperty(s)) { continue }

                css.push(stylesList[locales[l]][s])
            }

            var cssDir = path.join(appConf.build, locales[l])
            var cssFile = path.join(cssDir, 'style.css')

            fse.outputFileSync(cssFile, css.join('\n'))

            console.log(fileEvent.toUpperCase() + ':', filePath.replace(appConf.source, ''), '>', cssFile.replace(appConf.build, ''))
        } catch (e) {
            console.error('ERROR:', filePath.replace(appConf.source, ''), '>', e.message)
        }
    }
}


// Open config.yaml
var appConfFile = path.resolve(process.argv[2]) || path.join(__dirname, 'config.yaml')

try {
    appConf = yaml.safeLoad(fs.readFileSync(appConfFile, 'utf8'))
} catch (e) {
    throw new Error('Invalid configuration file: ' + appConfFile)
}


// Set config variables
appConf.port = appConf.port || 4000
appConf.locales = appConf.locales || '.'
appConf.source = appConf.source || path.join(__dirname, 'source')
appConf.build = appConf.build || path.join(__dirname, 'build')
appConf.assets = appConf.assets || path.join(__dirname, 'assets')
appConf.basePath = appConf.basePath || '/'
appConf.assetsPath = appConf.assetsPath || '/assets'

if (appConf.source.substr(0, 1) === '.') {
    appConf.source = path.join(path.dirname(appConfFile), appConf.source)
}
if (appConf.build.substr(0, 1) === '.') {
    appConf.build = path.join(path.dirname(appConfFile), appConf.build)
}
if (appConf.assets.substr(0, 1) === '.') {
    appConf.assets = path.join(path.dirname(appConfFile), appConf.assets)
}
if (appConf.jade.basedir.substr(0, 1) === '.') {
    appConf.jade.basedir = path.join(path.dirname(appConfFile), appConf.jade.basedir)
}


// Printout configuration
var c = {}
c[appConfFile] = appConf
console.log(yaml.safeDump(c))


// Load global data
appConf.data = {}
for (var l in appConf.locales) {
    if (!appConf.locales.hasOwnProperty(l)) { continue }

    var dataFile = getFilePath(path.dirname(appConfFile), 'data.yaml', appConf.locales[l])

    if (dataFile) {
        appConf.data[appConf.locales[l]] = yaml.safeLoad(fs.readFileSync(dataFile, 'utf8'))
    }

}


// Start server to listen port 4000
http.createServer(function (request, response) {
    var filePath = request.url.split('?')[0]
    if (filePath.substr(0, appConf.assetsPath.length) === appConf.assetsPath) {
        filePath = path.join(appConf.assets, filePath.substr(appConf.assetsPath.length - 1))
    } else {
        filePath = path.join(appConf.build, filePath)
    }

    if (filePath.indexOf('.') === -1) {
        filePath = path.join(filePath, 'index.html')
    }

    var contentType = 'application/octet-stream'
    switch(path.extname(filePath)) {
        case '.js':
            contentType = 'text/javascript'
            break
        case '.css':
            contentType = 'text/css'
            break
        case '.json':
            contentType = 'application/json'
            break
        case '.png':
            contentType = 'image/png'
            break
        case '.jpg':
            contentType = 'image/jpg'
            break
        case '.svg':
            contentType = 'image/svg+xml'
            break
        default:
            contentType = 'text/html'
    }

    fs.readFile(filePath, function (error, content) {
        if (error) {
            response.writeHead(404, { 'Content-Type': 'text/plain' })
            response.end('404\n')
            console.error(error.code + ':', filePath.replace(appConf.build, ''))
        } else {
            response.writeHead(200, { 'Content-Type': contentType })
            response.end(content, 'utf-8')
        }
    })
}).listen(appConf.port, function () {
    console.log('Server started at http://localhost:' + appConf.port)
})


// Start to watch Jade files
chokidar.watch(appConf.source + '/**/index*.jade', { ignored: '*/_*' }).on('all', makeHTML)


// Start to watch Yaml files
chokidar.watch(appConf.source + '/**/data*.yaml', { ignored: '*/_*', ignoreInitial: true }).on('all', makeHTML)


// Start to watch style files changes
chokidar.watch(appConf.source + '/**/style*.styl', { ignored: '*/_*' }).on('all', makeCSS)
