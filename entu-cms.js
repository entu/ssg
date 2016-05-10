#!/usr/bin/env node

var chokidar = require('chokidar')
var express  = require('express')
var fs       = require('fs')
var fse      = require('fs-extra')
var jade     = require('jade')
var md       = require('markdown-it')()
var path     = require('path')
var stylus   = require('stylus')
var yaml     = require('js-yaml')


// Markdown-it wrapper to handle empty text
var markdown = function(text) {
    if (text) {
        return md.render(text)
    } else {
        return ''
    }
}


// Returns file path with locale if exists
var getFilePath = function(dirName, fileName, locale) {
    var localeFile = fileName.split('.')
    localeFile.splice(localeFile.length - 1, 0, locale)

    var localeFilePath = path.join(dirName, localeFile.join('.'))
    var filePath = path.join(dirName, fileName)

    if (fs.existsSync(localeFilePath)) {
        return localeFilePath
    } else if (fs.existsSync(filePath)) {
        return filePath
    } else {
        return false
    }
}


// Generates HTMLs from template
var makeHTML = function(fileEvent, filePath) {
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
            var data = {}
            data.G = {}
            data.G.base = appConf.build_path
            data.G.language = locales[l]
            data.G.path = path.dirname(jadeFile).replace(appConf.source, '').substr(1)
            data.G.data = appConf.data[locales[l]]
            data.pretty = appConf.jade.pretty
            data.basedir = appConf.jade.basedir
            data.md = markdown

            var dataFile = getFilePath(folderName, 'data.yaml', locales[l])
            if (dataFile) {
                data.D = yaml.safeLoad(fs.readFileSync(dataFile, 'utf8'))
            }

            var html = jade.renderFile(jadeFile, data)
            var htmlDir = path.dirname(jadeFile.replace(appConf.source, path.join(appConf.build,  locales[l])))
            var htmlFile = path.join(htmlDir, 'index.html')

            fse.outputFileSync(htmlFile, html)

            console.log(filePath.replace(appConf.source, ''), '>', htmlFile.replace(appConf.build, ''))
        } catch (e) {
            console.error(e.message)
        }
    }
}


// Generates CSS from stylus
var makeCSS = function(fileEvent, filePath) {
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

            console.log(filePath.replace(appConf.source, ''), '>', cssFile.replace(appConf.build, ''))
        } catch (e) {
            console.error(e.message)
        }
    }
}


// Open config.yaml
var appConf = {}
var appConfFile = path.resolve(process.argv[2]) || path.join(__dirname, 'config.yaml')

try {
    appConf = yaml.safeLoad(fs.readFileSync(appConfFile, 'utf8'))
} catch (e) {
    console.error('Invalid configuration file: ' + appConfFile)
    console.error(e.message)
    process.exit(1)
}


// Set config variables
appConf.locales = appConf.locales || '.'
appConf.source = appConf.source || path.join(__dirname, 'source')
appConf.build = appConf.build || path.join(__dirname, 'build')
appConf.assets = appConf.assets || path.join(__dirname, 'assets')
appConf.assets_path = appConf.assets_path || '/assets'
appConf.build_path = appConf.build_path || '/build'

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

appConf.data = {}
for (var l in appConf.locales) {
    var dataFile = getFilePath(path.dirname(appConfFile), 'data.yaml', appConf.locales[l])

    if (dataFile) {
        appConf.data[appConf.locales[l]] = yaml.safeLoad(fs.readFileSync(dataFile, 'utf8'))
    }
}


// Printout configuration
// var c = {}
// c[appConfFile] = appConf
// console.log()
// console.log(yaml.safeDump(c))


// Start server to listen port 4000
express()
    .use(appConf.build_path, express.static(appConf.build))
    .use(appConf.assets_path, express.static(appConf.assets))
    .listen(4000, function() {
        console.log()
        console.log('Server started at http://localhost:4000')
        console.log()
    })


// Start to watch Jade files
chokidar.watch(appConf.source + '/**/index*.jade', { ignored: '*/_*' }).on('all', makeHTML)


// Start to watch Yaml files
chokidar.watch(appConf.source + '/**/data*.yaml', { ignored: '*/_*', ignoreInitial: true }).on('all', makeHTML)


// Start to watch style files changes
var stylesList = {}
chokidar.watch(appConf.source + '/**/style*.styl', { ignored: '*/_*' }).on('all', makeCSS)
