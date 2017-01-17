'use strict'

const {minify} = require('html-minifier')
const async = require('async')
const chokidar = require('chokidar')
const fm = require('front-matter')
const fs = require('fs')
const fse = require('fs-extra')
const http = require('http')
const jade = require('jade')
const md = require('markdown-it')
const mime = require('mime-types')
const op = require('object-path')
const path = require('path')
const stylus = require('stylus')
const uglify = require('uglify-js')
const yaml = require('js-yaml')

const htmlMinifyConf = {
    caseSensitive: false,
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: false,
    html5: true,
    keepClosingSlash: false,
    minifyCSS: true,
    minifyJS: true,
    preserveLineBreaks: false,
    quoteCharacter: '"',
    removeComments: true,
    removeEmptyAttributes: true
}
const jsMinifyConf = {
    fromString: true,
    outSourceMap: true
}


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

// Check if file is in dev.paths
var isFileIgnored = (file) => {
    if (!appConf.dev.paths) { appConf.dev.paths = [] }
    if (appConf.dev.paths.length === 0) { return false }

    var ignore = true
    for (var i = 0; i < appConf.dev.paths.length; i++) {
        if (appConf.dev.paths[i] && file.startsWith(path.join(appConf.source, appConf.dev.paths[i]))) {
            ignore = false
            break
        }
    }

    return ignore
}

// Generate dependency file key
var getDependentFileKey = file => {
    return file.replace(appConf.source, '').replace(/\./g, '-')
}


// Generates HTMLs from template
var appConf = {}
var jadeDependencies = {}
var makeHTML = (folderName, watch, callback) => {
    try {
        var outputFiles = []
        let locales = []
        let pageData = {}

        if (isFileIgnored(folderName)) { return callback(null, outputFiles) }

        // loop thru locales and generate pages
        for (let i = 0; i < appConf.locales.length; i++) {
            let locale = appConf.locales[i]

            let jadeFile = getFilePath(folderName, 'index.jade', locale)
            if (!jadeFile) { continue }

            let jadeFileContent = fm(fs.readFileSync(jadeFile, 'utf8'))
            let yamlFileContent = getYamlFile(folderName, 'data.yaml', locale, {})

            let data = {
                page: {},
                D: Object.assign(yamlFileContent, jadeFileContent.attributes),
                G: {},
                F: {}
            }
            op.set(data, 'page', op.get(data, 'D.page'))
            op.del(data, 'D.page')


            if (op.get(data, 'page.disabled', false) === true) { continue }

            op.ensureExists(data, 'page', {})
            op.ensureExists(data, 'page.language', locale)
            op.ensureExists(data, 'page.path', path.dirname(jadeFile).replace(appConf.source, '').substr(1))
            op.ensureExists(data, 'page.otherLocales', {})

            op.ensureExists(data, 'filename', jadeFile)
            op.ensureExists(data, 'pretty', true)
            op.ensureExists(data, 'basedir', appConf.jade.basedir)

            // set custom data from Yaml files
            for (let i in op.get(data, 'page.data', {})) {
                if (!data.page.data.hasOwnProperty(i)) { continue }

                let customDataFile = data.page.data[i]

                if (customDataFile.substr(0, 1) === '.') {
                    customDataFile = path.resolve(path.join(appConf.source, customDataFile))
                } else {
                    customDataFile = path.resolve(path.join(folderName, customDataFile))
                }
                let customDataFolderName = path.dirname(customDataFile)
                let customDataFileName = path.basename(customDataFile)
                let customData = getYamlFile(customDataFolderName, customDataFileName, locale)

                op.set(data, ['F', i], customData)

                if (watch) {
                    if (op.get(jadeDependencies, getDependentFileKey(customDataFile), []).indexOf(folderName) === -1) {
                        op.push(jadeDependencies, getDependentFileKey(customDataFile), folderName)
                        dependenciesWatcher.add(customDataFile)
                    }
                }
            }

            // set global data
            data.G = appConf.data[locale]
            data.G.md = text => {
                if (text) {
                    return md({ breaks: appConf.markdown.breaks, html: appConf.markdown.html }).render(text).replace(/\r?\n|\r/g, '')
                } else {
                    return ''
                }
            }

            op.set(pageData, [locale, 'data'], data)
            op.set(pageData, [locale, 'template'], jadeFileContent.body)
        }


        async.eachOf(pageData, function (d, l, callback) {
            // set other locales data
            for (let i in pageData) {
                if (!pageData.hasOwnProperty(i)) { continue }

                if (i !== l) {
                    op.set(pageData, [l, 'data', 'page', 'otherLocales', i], pageData[i].data.page)
                }
            }

            let data = d.data
            let template = d.template
            let compiledJade = jade.compile(template || '', data)

            let htmlDirs = appConf.dev.aliases ? op.get(data, 'page.aliases', []) : []
            let defaultHtmlDir = path.join('/', l, data.page.path)
            htmlDirs.push(defaultHtmlDir)

            let html = compiledJade(data)
            let htmlAlias = ''

            if (watch) {
                for (var i = 0; i < compiledJade.dependencies.length; i++) {
                    if (op.get(jadeDependencies, getDependentFileKey(compiledJade.dependencies[i]), []).indexOf(folderName) === -1) {
                        op.push(jadeDependencies, getDependentFileKey(compiledJade.dependencies[i]), folderName)
                        dependenciesWatcher.add(compiledJade.dependencies[i])
                    }
                }
            }

            if (htmlDirs.length > 1) {
                op.set(data, 'page.originalPath', defaultHtmlDir)
                htmlAlias = compiledJade(data)
            }

            if (!appConf.jade.pretty) {
                html = minify(html, htmlMinifyConf)
                htmlAlias = minify(htmlAlias, htmlMinifyConf)
            }

            async.each(htmlDirs, function (dir, callback) {
                let htmlFile = path.join(appConf.build, dir, 'index.html')

                if (dir === defaultHtmlDir) {
                    fse.outputFile(htmlFile, html, {}, function (err) {
                        if (err) { return callback(err) }

                        outputFiles.push({ path: htmlFile })
                        callback(null)
                    })
                } else {
                    fse.outputFile(htmlFile, htmlAlias, {}, function (err) {
                        if (err) { return callback(err) }

                        outputFiles.push({ path: htmlFile, alias: true })
                        callback(null)
                    })
                }
            }, callback)
        }, function(err) {
            if (err) { return callback(err) }
            callback(null, outputFiles)
        })
    } catch (e) {
        callback(e)
    }
}
exports.makeHTML = makeHTML

// Generates CSS from separate .styl files
var stylesList = {}
var makeCSS = (filePath, callback) => {
    try {
        var folderName = path.dirname(filePath)
        var fileName = path.basename(filePath)
        var fileNameWithoutLocale
        var outputFiles = []
        var locales = []

        if (isFileIgnored(filePath)) { return callback(null, outputFiles) }

        if (fileName.split('.').length > 2) {
            locales = [fileName.split('.')[1]]
            fileNameWithoutLocale = [fileName.split('.')[0], fileName.split('.')[2]].join('.')
        } else {
            locales = appConf.locales
            fileNameWithoutLocale = fileName
        }

        async.each(locales, function(locale, callback) {
            if (!stylesList[locale]) { stylesList[locale] = {} }

            var styleFile = getFilePath(folderName, fileNameWithoutLocale, locale)
            if (styleFile) {
                stylesList[locale][styleFile] = fs.readFileSync(styleFile, 'utf8')
            } else {
                delete stylesList[locale][styleFile]
            }

            var css = []
            for (let i in stylesList[locale]) {
                if (!stylesList[locale].hasOwnProperty(i)) { continue }

                css.push(stylesList[locale][i])
            }

            var cssDir = path.join(appConf.build, locale)
            var cssFile = path.join(cssDir, 'style.css')

            if (appConf.stylus.pretty) {
                stylus(css.join('\n\n')).set('warn', false).render(function (err, css) {
                    if (err) { return callback(err) }

                    fse.outputFile(cssFile, css, {}, function (err) {
                        if (err) { return callback(err) }

                        outputFiles.push({ path: cssFile })
                        callback(null)
                    })
                })
            } else {
                let styl = stylus(css.join('\n\n')).set('warn', false).set('compress', true).set('sourcemap', {})

                styl.render(function (err, css) {
                    async.parallel([
                        function (callback) {
                            fse.outputFile(cssFile, css, {}, function (err) {
                                if (err) { return callback(err) }

                                outputFiles.push({ path: cssFile })
                                callback(null)
                            })
                        },
                        function (callback) {
                            fse.outputFile(cssFile + '.map', JSON.stringify(styl.sourcemap), {}, function (err) {
                                if (err) { return callback(err) }

                                outputFiles.push({ path: cssFile + '.map', alias: true })
                                callback(null)
                            })
                        }
                    ], callback)
                })

            }




        }, function (err) {
            if (err) { return callback(err) }

            callback(null, outputFiles)
        })
    } catch (e) {
        callback(e)
    }
}
exports.makeCSS = makeCSS

// Generates JS from separate .js files
var scriptsList = []
var makeJS = (filePath, callback) => {
    try {
        let folderName = path.dirname(filePath)
        let fileName = path.basename(filePath)
        let fileNameWithoutLocale
        let outputFiles = []
        let locales = []

        if (isFileIgnored(filePath)) { return callback(null, outputFiles) }

        if (fileName.split('.').length > 2) {
            locales = [fileName.split('.')[1]]
            fileNameWithoutLocale = [fileName.split('.')[0], fileName.split('.')[2]].join('.')
        } else {
            locales = appConf.locales
            fileNameWithoutLocale = fileName
        }

        async.each(locales, function(locale, callback) {
            if (!scriptsList[locale]) { scriptsList[locale] = {} }

            var scriptFile = getFilePath(folderName, fileNameWithoutLocale, locale)
            if (scriptFile) {
                scriptsList[locale][scriptFile] = fs.readFileSync(scriptFile, 'utf8')
            } else {
                delete scriptsList[locale][scriptFile]
            }

            var js = []
            for (let i in scriptsList[locale]) {
                if (!scriptsList[locale].hasOwnProperty(i)) { continue }

                js.push(scriptsList[locale][i])
            }

            let jsDir = path.join(appConf.build, locale)
            let jsFile = path.join(jsDir, 'script.js')

            if (appConf.javascript.pretty) {
                fse.outputFile(jsFile, js.join('\n\n'), {}, function (err) {
                    if (err) { return callback(err) }

                    outputFiles.push({ path: jsFile.replace(appConf.build, '') })
                    callback(null)
                })
            } else {
                let script = uglify.minify(js.join('\n\n'), jsMinifyConf)

                async.parallel([
                    function (callback) {
                        fse.outputFile(jsFile, script.code, {}, function (err) {
                            if (err) { return callback(err) }

                            outputFiles.push({ path: jsFile })
                            callback(null)
                        })
                    },
                    function (callback) {
                        fse.outputFile(jsFile + '.map', script.map, {}, function (err) {
                            if (err) { return callback(err) }

                            outputFiles.push({ path: jsFile + '.map', alias: true })
                            callback(null)
                        })
                    }
                ], callback)
            }
        }, function(err) {
            if (err) { return callback(err) }

            callback(null, outputFiles)
        })

    } catch (e) {
        callback(e)
    }
}
exports.makeJS = makeJS

// Open config.yaml and set config variables
exports.openConfFile = (appConfFile, callback) => {
    try {
        appConf = yaml.safeLoad(fs.readFileSync(appConfFile, 'utf8'))

        op.ensureExists(appConf, 'locales', [''])
        op.ensureExists(appConf, 'source', path.join(__dirname, 'source'))
        op.ensureExists(appConf, 'build', path.join(__dirname, 'build'))
        op.ensureExists(appConf, 'assets', path.join(__dirname, 'assets'))
        op.ensureExists(appConf, 'markdown.breaks', true)
        op.ensureExists(appConf, 'markdown.html', false)
        op.ensureExists(appConf, 'jade.basedir', path.join(__dirname, 'source'))
        op.ensureExists(appConf, 'jade.pretty', false)
        op.ensureExists(appConf, 'stylus.pretty', false)
        op.ensureExists(appConf, 'javascript.pretty', false)
        op.ensureExists(appConf, 'server.assets', '/assets')
        op.ensureExists(appConf, 'server.port', 0)
        op.ensureExists(appConf, 'dev.aliases', true)
        op.ensureExists(appConf, 'dev.paths', [])
        op.ensureExists(appConf, 'protectedFromCleanup', [])

        if (appConf.source.substr(0, 1) === '.') {
            appConf.source = path.resolve(path.join(path.dirname(appConfFile), appConf.source))
        }
        if (appConf.build.substr(0, 1) === '.') {
            appConf.build = path.resolve(path.join(path.dirname(appConfFile), appConf.build))
        }
        if (appConf.assets.substr(0, 1) === '.') {
            appConf.assets = path.resolve(path.join(path.dirname(appConfFile), appConf.assets))
        }
        if (appConf.jade.basedir.substr(0, 1) === '.') {
            appConf.jade.basedir = path.resolve(path.join(path.dirname(appConfFile), appConf.jade.basedir))
        }

        // Printout configuration
        // var c = {}
        // c[appConfFile] = appConf
        // console.log(yaml.safeDump(c))

        // Load global data
        for (let i in appConf.locales) {
            if (!appConf.locales.hasOwnProperty(i)) { continue }

            var locale = appConf.locales[i]
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
            if (filePath.substr(0, appConf.server.assets.length) === appConf.server.assets) {
                filePath = path.join(appConf.assets, filePath.substr(appConf.server.assets.length - 1))
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
                        source: filePath.replace(appConf.build, '').replace(appConf.assets, appConf.server.assets),
                        error: err.message.replace(`${err.code}: `, '')
                    })
                } else {
                    response.writeHead(200, { 'Content-Type': contentType })
                    response.end(content, 'utf-8')
                }
            })
        })
        server.listen(appConf.server.port)
        server.on('listening', () => {
            appConf.server.port = server.address().port

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
    let jadeFolders = []
    chokidar.watch(appConf.source + '/**/index*.jade').on('all', (fileEvent, filePath) => {
        if (fileEvent !== 'add' || jadeFolders.indexOf(path.dirname(filePath)) === -1) {
            if (jadeFolders.indexOf(path.dirname(filePath)) === -1) {
                jadeFolders.push(path.dirname(filePath))
            }
            makeHTML(path.dirname(filePath), true, (err, file) => {
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
        }
    })

    // Start to watch Yaml files
    chokidar.watch(appConf.source + '/**/data*.yaml', { ignored: '*/_*.yaml', ignoreInitial: true }).on('all', (fileEvent, filePath) => {
        makeHTML(path.dirname(filePath), true, (err, file) => {
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
    chokidar.watch(appConf.source + '/**/*.styl', { ignored: '*/_*.styl' }).on('all', (fileEvent, filePath) => {
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

    // Start to watch javascript files changes
    chokidar.watch(appConf.source + '/**/*.js', { ignored: '*/_*.js' }).on('all', (fileEvent, filePath) => {
        makeJS(filePath, (err, file) => {
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

    // Start to watch all dependencies
    dependenciesWatcher = chokidar.watch([], { ignoreInitial: true }).on('all', (fileEvent, filePath) => {
        var files = op.get(jadeDependencies, getDependentFileKey(filePath))
        for (let i in files) {
            if (!files.hasOwnProperty(i)) { continue }

            makeHTML(files[i], true, (err, file) => {
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
        }
    })
}
