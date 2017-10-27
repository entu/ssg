'use strict'

const _ = require('lodash')
const {minify} = require('html-minifier')
const async = require('async')
const chokidar = require('chokidar')
const fs = require('fs')
const fse = require('fs-extra')
const http = require('http')
const md = require('markdown-it')
const mdAttrs = require('markdown-it-attrs')
const mdSup = require('markdown-it-sup')
const mime = require('mime-types')
const path = require('path')
const pug = require('pug')
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
const getFilePath = (dirName, fileName, locale) => {
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
const getYamlFile = (dirName, fileName, locale, defaultResult) => {
    var dataFile = getFilePath(dirName, fileName, locale)

    if (!dataFile) return defaultResult

    return yaml.safeLoad(fs.readFileSync(dataFile, 'utf8'))
}


// Check if file is in dev.paths
const isFileIgnored = (file) => {
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
const getDependentFileKey = file => {
    return file.replace(appConf.source, '').replace(/\./g, '-')
}


// Load page Pug file
const getPageTemplate = (folder, locales, callback) => {
    var result = {}

    async.each(locales, (locale, callback) => {
        var fileName = `index.${locale}.pug`

        fs.access(path.join(folder, fileName), fs.constants.R_OK, err => {
            if (err) {
                fileName = 'index.pug'
            }

            fs.readFile(path.join(folder, fileName), 'utf8', (err, data) => {
                if (!err) {
                    result[locale] = data
                }

                callback(null)
            })
        })
    }, err => {
        if (err) {
            return callback(err)
        } else {
            return callback(null, result)
        }
    })
}


// Load page Yaml file(s)
const getPageData = (folder, file, locales, callback) => {
    var result = {}

    async.each(locales, (locale, callback) => {
        result[locale] = [{}]

        let localeFile = file.split('.')
        localeFile.splice(localeFile.length - 1, 0, locale)

        var fileName = localeFile.join('.')

        fs.access(path.join(folder, fileName), fs.constants.R_OK, err => {
            if (err) {
                fileName = file
            }

            fs.readFile(path.join(folder, fileName), 'utf8', (err, data) => {
                if (!err) {
                    let yamlData = yaml.safeLoad(data)

                    if (Array.isArray(yamlData)) {
                        result[locale] = yamlData
                    } else {
                        result[locale] = [yamlData]
                    }
                }

                callback(null)
            })
        })
    }, err => {
        if (err) {
            return callback(err)
        } else {
            return callback(null, result)
        }
    })
}


// Generates HTMLs from template
var appConf = {}
var pugDependencies = {}
const makeHTML = (folderName, watch, callback) => {

    const defaultContent = {
        self: true,
        filename: null,
        basedir: appConf.pug.basedir,
        disabled: false,
        language: null,
        path: folderName.replace(appConf.source, '').substr(1),
        otherLocales: {},
        file: {},
        toMarkdown: text => {
            if (text) {
                return md({ breaks: true, html: true }).use(mdSup).use(mdAttrs).render(text).replace(/\r?\n|\r/g, '')
            } else {
                return ''
            }
        },
        G: {}
    }

    async.parallel({
        template: callback => {
            getPageTemplate(folderName, appConf.locales, callback)
        },
        data: callback => {
            getPageData(folderName, 'data.yaml', appConf.locales, callback)
        }
    }, (err, page) => {
        if (err) { return callback(err) }

        async.eachOf(page.template, (template, locale, callback) => {
            async.each(page.data[locale], (data, callback) => {
                data = Object.assign(defaultContent, appConf.data[locale], data)

                let filePath = path.join(appConf.build, locale, data.path)
                let fileName = path.join(filePath, 'index.html')

                data.filename = fileName
                data.locale = locale

                async.eachOf(data.file, (file, name, callback) => {
                    file = path.join(appConf.source, file)
                    getPageData(path.dirname(file), path.basename(file), [locale], (err, fileData) => {
                        if (err) { return callback(err) }

                        data.file[name] = fileData[locale]
                    })
                }, err => {
                    let compiledPug = pug.compile(template, data)
                    let dependencies = compiledPug.dependencies
                    let html = compiledPug(data)
                    html = minify(html, htmlMinifyConf)

                    fs.mkdir(filePath, err => {
                        fs.writeFile(fileName, html, callback)
                    })
                })

            }, err => {
                callback(null)
            })
        }, callback)
    })


    return callback(null)
}
exports.makeHTML = makeHTML


// Generates CSS from separate .styl files
var stylesList = {}
const makeCSS = (filePath, callback) => {
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
const makeJS = (filePath, callback) => {
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
        appConf = Object.assign({
            locales: [''],
            defaultLocale: null,
            source: path.join(__dirname, 'source'),
            build: path.join(__dirname, 'build'),
            assets: path.join(__dirname, 'assets'),
            pug: {
                basedir: path.join(__dirname, 'source')
            },
            server: {
                assets: '/assets',
                port: 0
            },
            dev: {
                aliases: true,
                paths: []
            },
            protectedFromCleanup: []
        }, yaml.safeLoad(fs.readFileSync(appConfFile, 'utf8')))


        if (appConf.source.substr(0, 1) === '.') {
            appConf.source = path.resolve(path.join(path.dirname(appConfFile), appConf.source))
        }
        if (appConf.build.substr(0, 1) === '.') {
            appConf.build = path.resolve(path.join(path.dirname(appConfFile), appConf.build))
        }
        if (appConf.assets.substr(0, 1) === '.') {
            appConf.assets = path.resolve(path.join(path.dirname(appConfFile), appConf.assets))
        }
        if (appConf.pug.basedir.substr(0, 1) === '.') {
            appConf.pug.basedir = path.resolve(path.join(path.dirname(appConfFile), appConf.pug.basedir))
        }

        if (!appConf.dev.paths) { appConf.dev.paths = [] }

        // Printout configuration
        // var c = {}
        // c[appConfFile] = appConf
        // console.log(yaml.safeDump(c))

        // Load global data
        for (let i in appConf.locales) {
            if (!appConf.locales.hasOwnProperty(i)) { continue }

            var locale = appConf.locales[i]
            _.set(appConf, ['data', locale], getYamlFile(appConf.source, 'global.yaml', locale, {}))
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
    // Start to watch Pug files
    let pugFolders = []
    chokidar.watch(appConf.source + '/**/index*.pug').on('all', (fileEvent, filePath) => {
        if (fileEvent !== 'add' || pugFolders.indexOf(path.dirname(filePath)) === -1) {
            if (pugFolders.indexOf(path.dirname(filePath)) === -1) {
                pugFolders.push(path.dirname(filePath))
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
        var files = _.get(pugDependencies, getDependentFileKey(filePath))
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
