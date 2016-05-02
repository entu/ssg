#!/usr/bin/env node

var express = require('express')
var fs      = require('fs')
var fse     = require('fs-extra')
var jade    = require('jade')
var md      = require('markdown-it')()
var path    = require('path')
var stylus  = require('stylus')
var yaml    = require('js-yaml')



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

// Scans source folder and generates HTMLs
var worker = function() {
    htmlFiles = []
    css = {}
    fse.walk(appConf.source)
        .on('data', function (item) {
            if (item.path.indexOf('/_') > -1) { return }

            for (var l in appConf.locales) {
                if (!appConf.locales.hasOwnProperty(l)) { continue }

                try {
                    var jadeFile = getFilePath(item.path, 'index.jade', appConf.locales[l])
                    if (!jadeFile) { continue }

                    var configFile = getFilePath(item.path, 'config.yaml', appConf.locales[l])
                    var config = {}
                    if (configFile) {
                        config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8'))
                    }

                    var dataFile = getFilePath(item.path, 'data.yaml', appConf.locales[l])
                    var data = {}
                    if (dataFile) {
                        data.D = yaml.safeLoad(fs.readFileSync(dataFile, 'utf8'))
                    }

                    var styleFile = getFilePath(item.path, 'style.styl', appConf.locales[l])
                    if (styleFile) {
                        var styl = stylus(fs.readFileSync(styleFile, 'utf8')).set('warn', false).set('compress', !appConf.stylus.pretty)
                        if (!css[appConf.locales[l]]) { css[appConf.locales[l]] = [] }
                        css[appConf.locales[l]].push(styl.render())
                    }

                    data.G = {}
                    data.G.base = appConf.build_path
                    data.G.language = appConf.locales[l]
                    data.G.path = path.dirname(jadeFile).replace(appConf.source, '')
                    data.G.data = appConf.data[appConf.locales[l]]
                    data.pretty = appConf.jade.pretty
                    data.basedir = appConf.jade.basedir
                    data.md = markdown

                    var html = jade.renderFile(jadeFile, data)
                    var htmlDir = path.dirname(jadeFile.replace(appConf.source, path.join(appConf.build,  appConf.locales[l])))
                    var htmlFile = path.join(htmlDir, 'index.html')

                    htmlFiles.push(htmlFile)
                    fse.outputFileSync(htmlFile, html)
                } catch (e) {
                    console.error(e.message)
                }
            }
        })
        .on('end', function () {
            for (var l in appConf.locales) {
                if (!appConf.locales.hasOwnProperty(l)) { continue }

                fse.outputFileSync(path.join(appConf.build, appConf.locales[l], 'style.css'), css[appConf.locales[l]].join('\n'))
            }

            setTimeout(worker, (appConf.timeout * 1000))
        })
    console.log('Build finished')

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
appConf.timeout = appConf.timeout || 60

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


//Printout configuration
var c = {}
c[appConfFile] = appConf
console.log()
console.log()
console.log(yaml.safeDump(c))


// Start server to listen port 4000
express()
    .use(appConf.build_path, express.static(appConf.build))
    .use(appConf.assets_path, express.static(appConf.assets))
    .listen(4000, function() {
        console.log()
        console.log()
        console.log('Server started at http://localhost:4000')
        console.log()
        console.log()

        // Start scanning source folder and building
        worker()
    })
