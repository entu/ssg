#!/usr/bin/env node

var chokidar = require('chokidar')
var fs = require('fs')
var fse = require('fs-extra')
var http = require('http')
var jade = require('jade')
var md = require('markdown-it')
var mime = require('mime-types')
var op = require('object-path')
var path = require('path')
var stylus = require('stylus')
var yaml = require('js-yaml')


// Returns file path with locale if exists
var getFilePath = (dirName, fileName, locale) => {
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


// Load Yaml file
var getYamlFile = (dirName, fileName, locale, defaultResult) => {
    var dataFile = getFilePath(dirName, fileName, locale)

    if (!dataFile) return defaultResult

    return yaml.safeLoad(fs.readFileSync(dataFile, 'utf8'))
}


// Generates HTMLs from template
var appConf = {}
var jadeDependencies = {}
var makeHTML = (filePath, callback) => {
    try {
        var folderName = path.dirname(filePath)
        var fileName = path.basename(filePath)
        var outputFiles = []
        var locales = []

        if (fileName.split('.').length > 2) {
            locales = [fileName.split('.')[1]]
        } else {
            locales = appConf.locales
        }

        for (var l in locales) {
            if (!locales.hasOwnProperty(l)) { continue }

            var locale = locales[l]

            // Get Jade template
            var jadeFile = getFilePath(folderName, 'index.jade', locale)
            if (!jadeFile) { continue }

            // Get and set data for Jade template
            var data = {
                page: {},
                D: {},
                G: {}
            }

            data.D = getYamlFile(folderName, 'data.yaml', locale, {})

            for (var i in data.D.page) {
                if (!data.D.page.hasOwnProperty(i)) { continue }

                op.set(data, ['page', i], op.get(data, ['D', 'page', i]))
            }
            op.del(data, 'D.page')

            op.ensureExists(data, 'page.language', locale)
            op.ensureExists(data, 'page.otherLocales', {})
            op.ensureExists(data, 'page.base', appConf.basePath)
            op.ensureExists(data, 'page.path', path.dirname(jadeFile).replace(appConf.source, '').substr(1))
            op.ensureExists(data, 'pretty', appConf.jade.pretty)
            op.ensureExists(data, 'basedir', appConf.jade.basedir)

            for (var i in appConf.locales) {
                if (!appConf.locales.hasOwnProperty(i)) { continue }
                if (appConf.locales[i] === locale) { continue }

                var otherLocaleData = getYamlFile(folderName, 'data.yaml', appConf.locales[i], {})

                op.ensureExists(otherLocaleData, 'page', {})
                op.ensureExists(otherLocaleData, 'page.language', appConf.locales[i])
                op.ensureExists(otherLocaleData, 'page.base', appConf.basePath)
                op.ensureExists(otherLocaleData, 'page.path', path.dirname(jadeFile).replace(appConf.source, '').substr(1))

                op.set(data, ['page', 'otherLocales', appConf.locales[i]], otherLocaleData.page)
            }

            data.G = appConf.data[locale]
            data.G.md = text => {
                if (text) {
                    return md({ breaks: appConf.markdown.breaks, html: appConf.markdown.html }).render(text).replace(/\r?\n|\r/g, '')
                } else {
                    return ''
                }
            }

            var redirect = op.get(data, 'page.redirect')

            var htmlDirs = op.get(data, 'page.aliases', [])
            var defaultHtmlDir = path.join('/', locale, data.page.path)
            htmlDirs.push(defaultHtmlDir)

            for (var h in htmlDirs) {
                if (!htmlDirs.hasOwnProperty(h)) { continue }

                if (redirect) {
                    op.set(data, 'page.redirect', redirect)
                } else if (htmlDirs[h] !== defaultHtmlDir) {
                    op.set(data, 'page.redirect', defaultHtmlDir)
                } else {
                    op.del(data, 'page.redirect')
                }

                var compiledJade = jade.compileFile(jadeFile, data)
                var html = compiledJade(data)

                for (var i in compiledJade.dependencies) {
                    if (!compiledJade.dependencies.hasOwnProperty(i)) { continue }

                    var key = op.get(compiledJade, ['dependencies', i]).replace(appConf.source, '').replace('.jade', '')

                    if (op.get(jadeDependencies, key, []).indexOf(jadeFile) > -1) { continue }

                    op.push(jadeDependencies, key, jadeFile)

                    dependenciesWatcher.add(op.get(compiledJade, ['dependencies', i]))
                }


                var htmlFile = path.join(appConf.build, htmlDirs[h], 'index.html')

                fse.outputFileSync(htmlFile, html)

                outputFiles.push(htmlFile.replace(appConf.build, ''))
            }

        }

        callback(null, outputFiles)
    } catch (e) {
        callback(e)
    }
}


// Generates CSS from stylus
var stylesList = {}
var makeCSS = (filePath, callback) => {
    try {
        var folderName = path.dirname(filePath)
        var fileName = path.basename(filePath)
        var outputFiles = []
        var locales = []

        if (fileName.split('.').length > 2) {
            locales = [fileName.split('.')[1]]
        } else {
            locales = appConf.locales
        }

        for (var l in locales) {
            if (!locales.hasOwnProperty(l)) { continue }

            var locale = locales[l]

            if (!stylesList[locales[l]]) { stylesList[locale] = {} }

            var styleFile = getFilePath(folderName, 'style.styl', locale)
            if (styleFile) {
                var styl = stylus(fs.readFileSync(styleFile, 'utf8')).set('warn', false).set('compress', !appConf.stylus.pretty)
                stylesList[locale][folderName] = styl.render()
            } else {
                delete stylesList[locale][folderName]
            }

            var css = []
            for (var s in stylesList[locale]) {
                if (!stylesList[locale].hasOwnProperty(s)) { continue }

                css.push(stylesList[locale][s])
            }

            var cssDir = path.join(appConf.build, locale)
            var cssFile = path.join(cssDir, 'style.css')

            fse.outputFileSync(cssFile, css.join('\n'))

            outputFiles.push(cssFile.replace(appConf.build, ''))
        }

        callback(null, outputFiles)
    } catch (e) {
        callback(e)
    }
}


// Open config.yaml and set config variables
exports.openConfFile = (appConfFile, callback) => {
    try {
        appConf = yaml.safeLoad(fs.readFileSync(appConfFile, 'utf8'))

        op.ensureExists(appConf, 'locales', [''])
        op.ensureExists(appConf, 'source', path.join(__dirname, 'source'))
        op.ensureExists(appConf, 'build', path.join(__dirname, 'build'))
        op.ensureExists(appConf, 'assets', path.join(__dirname, 'assets'))
        op.ensureExists(appConf, 'basePath', '/')
        op.ensureExists(appConf, 'assetsPath', '/assets')
        op.ensureExists(appConf, 'markdown.breaks', true)
        op.ensureExists(appConf, 'markdown.html', false)
        op.ensureExists(appConf, 'jade.basedir', path.join(__dirname, 'source'))
        op.ensureExists(appConf, 'jade.pretty', false)
        op.ensureExists(appConf, 'stylus.pretty', false)
        op.ensureExists(appConf, 'port', 0)

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
        // var c = {}
        // c[appConfFile] = appConf
        // console.log(yaml.safeDump(c))

        // Load global data
        for (var l in appConf.locales) {
            if (!appConf.locales.hasOwnProperty(l)) { continue }

            var locale = appConf.locales[l]
            op.set(appConf, ['data', locale], getYamlFile(appConf.source, 'global.yaml', locale, {}))
        }

        callback(null, appConf)
    } catch (e) {
        callback(e)
    }
}


// Start web server
exports.startServer = callback => {
    try {
        var server = http.createServer((request, response) => {
            var filePath = request.url.split('?')[0]
            if (filePath.substr(0, appConf.assetsPath.length) === appConf.assetsPath) {
                filePath = path.join(appConf.assets, filePath.substr(appConf.assetsPath.length - 1))
            } else {
                filePath = path.join(appConf.build, filePath)
            }

            if (filePath.indexOf('.') === -1) {
                filePath = path.join(filePath, 'index.html')
            }

            var contentType = mime.lookup(path.extname(filePath)) || 'application/octet-stream'

            fs.readFile(filePath, (err, content) => {
                if (err) {
                    response.writeHead(404, { 'Content-Type': 'text/plain' })
                    response.end('404\n')
                    callback({
                        event: err.code,
                        source: filePath.replace(appConf.build, '').replace(appConf.assets, appConf.assetsPath),
                        error: err.message.replace(`${err.code}: `, '')
                    })
                } else {
                    response.writeHead(200, { 'Content-Type': contentType })
                    response.end(content, 'utf-8')
                }
            })
        })
        server.listen(appConf.port)
        server.on('listening', () => {
            appConf.port = server.address().port

            callback(null)
        })
    } catch (e) {
        callback(e)
    }
}


// Watch source files
var dependenciesWatcher
exports.watchFiles = callback => {
    // Start to watch Jade files
    chokidar.watch(appConf.source + '/**/index*.jade', { ignored: '*/_*' }).on('all', (fileEvent, filePath) => {
        makeHTML(filePath, (err, file) => {
            if (err) {
                callback({
                    event: fileEvent.toUpperCase(),
                    source: filePath.replace(appConf.source, ''),
                    error: err
                })
            } else {
                callback(null, {
                    event: fileEvent.toUpperCase(),
                    source: filePath.replace(appConf.source, ''),
                    build: file
                })
            }
        })
    })

    // Start to watch Jade dependencies
    dependenciesWatcher = chokidar.watch([], { ignoreInitial: true }).on('all', (fileEvent, filePath) => {
        var files = op.get(jadeDependencies, filePath.replace(appConf.source, '').replace('.jade', ''))

        for (var i in files) {
            if (!files.hasOwnProperty(i)) { continue }

            makeHTML(files[i], (err, file) => {
                if (err) {
                    callback({
                        event: fileEvent.toUpperCase(),
                        source: files[i].replace(appConf.source, ''),
                        error: err
                    })
                } else {
                    callback(null, {
                        event: fileEvent.toUpperCase(),
                        source: files[i].replace(appConf.source, ''),
                        build: file
                    })
                }
            })
        }
    })

    // Start to watch Yaml files
    chokidar.watch(appConf.source + '/**/data*.yaml', { ignored: '*/_*', ignoreInitial: true }).on('all', (fileEvent, filePath) => {
        makeHTML(filePath, (err, file) => {
            if (err) {
                callback({
                    event: fileEvent.toUpperCase(),
                    source: filePath.replace(appConf.source, ''),
                    error: err
                })
            } else {
                callback(null, {
                    event: fileEvent.toUpperCase(),
                    source: filePath.replace(appConf.source, ''),
                    build: file
                })
            }
        })
    })

    // Start to watch style files changes
    chokidar.watch(appConf.source + '/**/style*.styl', { ignored: '*/_*' }).on('all', (fileEvent, filePath) => {
        makeCSS(filePath, (err, file) => {
            if (err) {
                callback({
                    event: fileEvent.toUpperCase(),
                    source: filePath.replace(appConf.source, ''),
                    error: err
                })
            } else {
                callback(null, {
                    event: fileEvent.toUpperCase(),
                    source: filePath.replace(appConf.source, ''),
                    build: file
                })
            }
        })
    })
}
