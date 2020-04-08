'use strict'

const _ = require('lodash')
const { minify } = require('html-minifier')
const async = require('async')
const chokidar = require('chokidar')
const fs = require('fs-extra')
const http = require('http')
const klaw = require('klaw')
const md = require('markdown-it')
const mdAttrs = require('markdown-it-attrs')
const mdSup = require('markdown-it-sup')
const mdTable = require('markdown-it-multimd-table')
const mime = require('mime-types')
const path = require('path')
const pug = require('pug')
const stylus = require('stylus')
const stylusAutoprefixer = require('autoprefixer-stylus')
const uglify = require('uglify-js')
const yaml = require('js-yaml')



module.exports = class {
    constructor (confFile) {
        try {
            var conf = yaml.safeLoad(fs.readFileSync(confFile, 'utf8'))
        } catch (e) {
            console.error(e)
            return
        }

        this.locales = _.get(conf, 'locales') || ['']
        this.defaultLocale = _.get(conf, 'defaultLocale') || null
        this.sourceDir = _.get(conf, 'source') || './'
        this.sourceDirJs = _.get(conf, 'js')
        this.sourceDirStyl = _.get(conf, 'styl')
        this.buildDir = _.get(conf, 'build') || './'
        this.assetsDir = _.get(conf, 'assets') || './'
        this.aliases = _.get(conf, 'dev.aliases', true)
        this.paths = _.get(conf, 'dev.paths') || []
        this.ignorePaths = _.get(conf, 'dev.ignorePaths') || []
        this.serverPort = _.get(conf, 'server.port') || null
        this.serverAssets = _.get(conf, 'server.assets') || '/'
        this.state = {}
        this.globalData = {}
        this.globalDataFile = {}
        this.watcher

        // Paths are relative to config file path
        if (this.sourceDir.substr(0, 1) === '.') {
            this.sourceDir = path.resolve(path.join(path.dirname(confFile), this.sourceDir))
        }
        if (this.sourceDirJs && this.sourceDirJs.substr(0, 1) === '.') {
            this.sourceDirJs = path.resolve(path.join(path.dirname(confFile), this.sourceDirJs))
        }
        if (this.sourceDirStyl && this.sourceDirStyl.substr(0, 1) === '.') {
            this.sourceDirStyl = path.resolve(path.join(path.dirname(confFile), this.sourceDirStyl))
        }
        if (this.buildDir.substr(0, 1) === '.') {
            this.buildDir = path.resolve(path.join(path.dirname(confFile), this.buildDir))
        }
        if (this.assetsDir.substr(0, 1) === '.') {
            this.assetsDir = path.resolve(path.join(path.dirname(confFile), this.assetsDir))
        }

        this.paths = this.paths.map(p => path.resolve(path.join(this.sourceDir, p)))
        this.ignorePaths = this.ignorePaths.map(p => path.resolve(path.join(this.sourceDir, p)))

        try {
            this.state = JSON.parse(fs.readFileSync(path.join(this.buildDir, 'build.json'), 'utf8'))
        } catch (err) {
            // No build.json
        }

        // Load global data
        this.locales.forEach((locale) => {
            this.globalData[locale] = {}
            this.globalDataFile[locale] = null

            try {
                this.globalDataFile[locale] = path.join(this.sourceDir, `global.${locale}.yaml`)
                this.globalData[locale] = yaml.safeLoad(fs.readFileSync(this.globalDataFile[locale], 'utf8'))
            } catch (err) {
                try {
                    this.globalDataFile[locale] = path.join(this.sourceDir, `global.yaml`)
                    this.globalData[locale] = yaml.safeLoad(fs.readFileSync(this.globalDataFile[locale], 'utf8'))
                } catch (err) {
                    this.globalDataFile[locale] = null
                }
            }
        })
    }



    build (fullRun, callback) {
        const startDate = new Date()
        var sourceFiles
        var buildFiles = []

        async.parallel({
            changed: (callback) => {
                this.getChangedSourceFiles(callback)
            },
            all: (callback) => {
                this.getAllSourceFiles(callback)
            }
        }, (err, files) => {
            if (err) {
                console.error(err)
                return
            }

            if (fullRun || !files.changed) {
                sourceFiles = files.all
            } else {
                sourceFiles = files.changed

                if (sourceFiles.js.length > 0) {
                    sourceFiles.js = files.all.js
                }
                if (sourceFiles.styl.length > 0) {
                    sourceFiles.styl = files.all.styl
                }
            }

            console.log(`${(new Date()).toISOString()} - ${sourceFiles.pug.length} .pug folders to render`)
            console.log(`${(new Date()).toISOString()} - ${sourceFiles.js.length} .js files to render`)
            console.log(`${(new Date()).toISOString()} - ${sourceFiles.styl.length} .styl files to render`)

            async.parallel({
                html: (callback) => {
                    let buildFiles = []
                    let filesCount = sourceFiles.pug.length
                    let filesBuilt = 0
                    const startDt = new Date()

                    async.eachSeries(sourceFiles.pug, (source, callback) => {
                        filesBuilt = filesBuilt + 1

                        this.makeHTML(source, (err, files) => {
                            if (err) { return callback(err) }

                            if (files && files.length) { buildFiles = buildFiles.concat(files) }

                            const duration = (new Date()) - startDt
                            const ms = Math.round(duration / filesBuilt)
                            const msToGo = (filesCount - filesBuilt) * ms
                            const toGo = (new Date(msToGo)).toISOString().substr(11, 8)

                            console.log(`${(new Date()).toISOString()} - ${toGo} - ${filesCount - filesBuilt} - ${(Math.round(ms/10)/100).toFixed(2)}s - ${source.replace(this.sourceDir, '')}`)

                            callback(null)
                        })
                    }, (err) => {
                        if (err) { return callback(err) }

                        const duration = (new Date()) - startDate
                        console.log(`${(new Date()).toISOString()} - ${(new Date(duration)).toISOString().substr(11, 8)} - ${buildFiles.length} .html files created - ${(buildFiles.length / (duration / 1000)).toFixed(2)}fps`)

                        callback(null, buildFiles || [])
                    })
                },
                js: (callback) => {
                    this.makeJS(sourceFiles.js, (err, files) => {
                        if (err) { return callback(err) }

                        const duration = (new Date()) - startDate
                        console.log(`${(new Date()).toISOString()} - ${(new Date(duration)).toISOString().substr(11, 8)} - ${files.length} .js files created - ${(files.length / (duration / 1000)).toFixed(2)}fps`)

                        callback(null, files || [])
                    })
                },
                css: (callback) => {
                    this.makeCSS(sourceFiles.styl, (err, files) => {
                        if (err) { return callback(err) }

                        const duration = (new Date()) - startDate
                        console.log(`${(new Date()).toISOString()} - ${(new Date(duration)).toISOString().substr(11, 8)} - ${files.length} .css files created - ${(files.length / (duration / 1000)).toFixed(2)}fps`)

                        callback(null, files || [])
                    })
                }
            }, (err, build) => {
                if (err) { return callback(err) }

                if (fullRun) {
                    this.state = {}
                }

                this.updateState(build, () => callback)
            })
        })
    }



    watch (callback) {
        try {
            this.watcher.close()
        } catch (e) {
            // No active watchers
        }

        this.watcher = chokidar.watch(this.sourceDir, { ignoreInitial: true, usePolling: false, awaitWriteFinish: true }).on('all', (et, changedFile) => {
            const dirName = path.dirname(changedFile)
            const fileName = path.basename(changedFile)
            const eventType = et

            this.getSourceFromDependenct(changedFile).forEach((source) => {
                this.makeHTML(source, (err, files) => {
                    if (err) {
                        if (Array.isArray(err)) {
                            var error = `${err[1]}\n${err[0].message || err[0].stack || err[0]}`
                        } else {
                            var error = `${err.message || err.stack || err}`
                        }

                        callback({
                            event: eventType.toUpperCase(),
                            filename: changedFile,
                            error: error.trim()
                        })
                    } else if (files && files.length) {
                        this.updateState({ html: files }, () => {
                            callback(null, {
                                event: eventType.toUpperCase(),
                                filename: changedFile,
                                files: files
                            })
                        })
                    }
                })
            })

            if (!fileName.startsWith('_') && fileName.endsWith('.js')) {
                this.getAllSourceFiles((err, sourceFiles) => {
                    this.makeJS(sourceFiles.js, (err, files) => {
                        if (err) {
                            if (Array.isArray(err)) {
                                var error = `${err[1]}\n${err[0].message || err[0].stack || err[0]}`
                            } else {
                                var error = `${err.message || err.stack || err}`
                            }

                            callback({
                                event: eventType.toUpperCase(),
                                filename: changedFile,
                                error: error.trim()
                            })
                        } else if (files && files.length) {
                            this.updateState({ js: files }, () => {
                                callback(null, {
                                    event: eventType.toUpperCase(),
                                    filename: changedFile,
                                    files: files
                                })
                            })
                        }
                    })
                })
            }

            if (!fileName.startsWith('_') && fileName.endsWith('.styl')) {
                this.getAllSourceFiles((err, sourceFiles) => {
                    this.makeCSS(sourceFiles.styl, (err, files) => {
                        if (err) {
                            if (Array.isArray(err)) {
                                var error = `${err[1]}\n${err[0].message || err[0].stack || err[0]}`
                            } else {
                                var error = `${err.message || err.stack || err}`
                            }

                            callback({
                                event: eventType.toUpperCase(),
                                filename: changedFile,
                                error: error.trim()
                            })
                        } else if (files && files.length) {
                            this.updateState({ css: files }, () => {
                                callback(null, {
                                    event: eventType.toUpperCase(),
                                    filename: changedFile,
                                    files: files
                                })
                            })
                        }
                    })
                })
            }
        })
    }



    serve (callback) {
        try {
            var server = http.createServer((request, response) => {
                var filePath = request.url.split('?')[0]
                if (filePath.startsWith(this.serverAssets)) {
                    filePath = path.join(this.assetsDir, filePath.substr(this.serverAssets.length - 1))
                } else {
                    filePath = path.join(this.buildDir, filePath)
                }

                if (!path.basename(filePath).includes('.')) {
                    filePath = path.join(filePath, 'index.html')
                }

                var contentType = mime.lookup(path.extname(filePath)) || 'application/octet-stream'

                fs.readFile(filePath, (err, content) => {
                    if (err) {
                        response.writeHead(404, { 'Content-Type': 'text/plain' })
                        response.end('404\n')
                        callback({
                            event: err.code,
                            source: filePath.replace(this.buildDir, '').replace(this.assetsDir, this.serverAssets),
                            error: err.message.replace(`${err.code}: `, '')
                        })
                    } else {
                        response.writeHead(200, { 'Content-Type': contentType })
                        response.end(content, 'utf-8')
                    }
                })
            })

            server.listen(this.serverPort)
            server.on('listening', () => {
                this.serverPort = server.address().port

                callback(null)
            })
        } catch (err) {
            callback(err)
        }
    }



    makeHTML (sourcePath, callback) {
        var outputFiles = []

        async.parallel({
            template: (callback) => {
                this.getTemplate(sourcePath, callback)
            },
            data: (callback) => {
                this.getData(sourcePath, callback)
            },
            js: (callback) => {
                this.getJs(sourcePath, callback)
            },
            styl: (callback) => {
                this.getStyl(sourcePath, callback)
            }
        }, (err, page) => {
            if (err) { return callback(err) }

            async.eachOfSeries(page.template, (template, locale, callback) => {
                async.eachOfSeries(page.data[locale], (data, idx, callback) => {
                    if (data.disabled) { return callback(null) }

                    data.filename = template.filename

                    let otherLocalePaths = {}
                    this.locales.forEach((otherLocale) => {
                        if (!page.template[otherLocale]) { return }
                        if (otherLocale === data.locale) { return }
                        if (!page.data[otherLocale]) { return }
                        if (!page.data[otherLocale][idx]) { return }
                        if (page.data[otherLocale][idx].disabled) { return }

                        otherLocalePaths[otherLocale] = page.data[otherLocale][idx].path
                    })
                    data.otherLocalePaths = otherLocalePaths

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
                    const paths = this.aliases ? [data.path].concat(data.aliases || []) : [data.path]

                    async.eachSeries(paths, (buildPath, callback) => {
                        data.alias = data.path !== buildPath ? buildPath : null

                        try {
                            let buildFile = path.join(this.buildDir, buildPath, 'index.html')
                            const dataToTemplate = Object.create(data)

                            const compiledPug = pug.compile(template.template, dataToTemplate)
                            const dependencies = compiledPug.dependencies.concat(dataToTemplate.dependencies)
                            let html = compiledPug(dataToTemplate)

                            if (_.has(page, ['js', locale, 'filename'])) {
                                html = html.replace('</body>', `<script>${_.get(page, ['js', locale, 'js'])}</script></body>`)
                                dependencies.push(_.get(page, ['js', locale, 'filename']))
                            }
                            if (_.has(page, ['styl', locale, 'filename'])) {
                                const styl = stylus(_.get(page, ['styl', locale, 'styl'])).use(stylusAutoprefixer()).render()
                                html = html.replace('</head>', `<style>${styl}</style></head>`)
                                dependencies.push(_.get(page, ['styl', locale, 'filename']))
                            }

                            const fileContent = minify(html, htmlMinifyConf)

                            fs.outputFile(buildFile, fileContent, (err) => {
                                if (err) { return callback(this.parseErr(err, dataToTemplate.filename)) }

                                let result = {
                                    source: template.filename.replace(this.sourceDir, ''),
                                    build: buildFile.replace(this.buildDir, ''),
                                }
                                if (dataToTemplate.path !== buildPath) {
                                    result.alias = true
                                }
                                if (dependencies.length > 0) {
                                    result.dependencies = dependencies.map(v => v.replace(this.sourceDir, ''))
                                }
                                outputFiles.push(result)

                                callback(null)
                            })
                        } catch (err) {
                            callback(this.parseErr(err, data.filename))
                        }
                    }, callback)
                }, callback)
            }, (err) => {
                if (err) { return callback(err) }

                callback(null, outputFiles)
            })
        })
    }



    makeCSS (sourceFiles, callback) {
        if (sourceFiles.length === 0) { return callback(null, []) }

        var styleComponents = []
        var outputFiles = []

        async.eachSeries(sourceFiles, (stylusFile, callback) => {
            fs.readFile(stylusFile, 'utf8', (err, data) => {
                if (err) { return callback([err, stylusFile]) }

                styleComponents.push(data)

                callback(null)
            })
        }, (err) => {
            if (err) { return callback(err) }

            const sourceDir = this.sourceDir
            const buildDir = this.buildDir
            const cssFile = path.join(this.buildDir, 'style.css')
            const styl = stylus(styleComponents.join('\n\n'))
                .use(stylusAutoprefixer())
                .set('compress', true)
                .set('paths', [this.sourceDir])
                .set('filename', 'style.css')
                .set('sourcemap', {})

            styl.render((err, css) => {
                if (err) { return callback(err) }

                async.parallel([
                    function (callback) {
                        fs.outputFile(cssFile, css, {}, function (err) {
                            if (err) { return callback([err, cssFile]) }

                            outputFiles.push({
                                build: cssFile.replace(buildDir, ''),
                                dependencies: sourceFiles.map(v => v.replace(sourceDir, ''))
                            })

                            callback(null)
                        })
                    },
                    function (callback) {
                        fs.outputFile(cssFile + '.map', JSON.stringify(styl.sourcemap), {}, function (err) {
                            if (err) { return callback([err, cssFile + '.map']) }

                            outputFiles.push({
                                build: cssFile.replace(buildDir, '') + '.map',
                                dependencies: sourceFiles.map(v => v.replace(sourceDir, '')),
                                alias: true
                            })

                            callback(null)
                        })
                    }
                ], (err) => {
                    if (err) { return callback(err) }

                    callback(null, outputFiles)
                })
            })
        })
    }



    makeJS (sourceFiles, callback) {
        if (sourceFiles.length === 0) { return callback(null, []) }

        var jsComponents = {}
        var outputFiles = []

        async.eachSeries(sourceFiles, (scriptFile, callback) => {
            fs.readFile(scriptFile, 'utf8', (err, data) => {
                if (err) { return callback([err, scriptFile]) }

                jsComponents[path.basename(scriptFile)] = data

                callback(null)
            })
        }, (err) => {
            if (err) { return callback(err) }

            const sourceDir = this.sourceDir
            const buildDir = this.buildDir
            const jsFile = path.join(buildDir, 'script.js')
            const script = uglify.minify(jsComponents, { sourceMap: { filename: 'script.js', url: 'script.js.map' } })

            async.parallel([
                function (callback) {
                    fs.outputFile(jsFile, script.code, {}, function (err) {
                        if (err) { return callback([err, jsFile]) }

                        outputFiles.push({
                            build: jsFile.replace(buildDir, ''),
                            dependencies: sourceFiles.map(v => v.replace(sourceDir, ''))
                        })

                        callback(null)
                    })
                },
                function (callback) {
                    fs.outputFile(jsFile + '.map', script.map, {}, function (err) {
                        if (err) { return callback([err, jsFile + '.map']) }

                        outputFiles.push({
                            build: jsFile.replace(buildDir, '') + '.map',
                            dependencies: sourceFiles.map(v => v.replace(sourceDir, '')),
                            alias: true
                        })

                        callback(null)
                    })
                }
            ], (err) => {
                if (err) { return callback(err) }

                callback(null, outputFiles)
            })
        })
    }



    getChangedSourceFiles (callback) {
        if (!this.state.commit || !this.state) { return callback(null) }

        var gitPath = null

        var deletedFiles = []
        var changedFiles = []

        var sourcePugFiles= []
        var sourceJsFiles= []
        var sourceStylusFiles= []

        // Get last commit and build log
        try {
            gitPath = require('child_process')
                .execSync(`git -C "${this.sourceDir}" rev-parse --show-toplevel`)
                .toString()
                .trim()

            const gitDiff = require('child_process')
                .execSync(`git -C "${this.sourceDir}" diff --no-renames --name-status ${this.state.commit}`)
                .toString()
                .trim()
                .split('\n')

            changedFiles = gitDiff
                .filter(f => f.startsWith('D\t') || f.startsWith('M\t') || f.startsWith('A\t'))
                .map(f => f.split('\t')[1])
                .filter(f => f)
                .map(f => path.join(gitPath, f))

            changedFiles = changedFiles.concat(
                require('child_process')
                    .execSync(`git -C "${this.sourceDir}" ls-files -o --exclude-standard --full-name`)
                    .toString()
                    .trim()
                    .split('\n')
                    .filter(f => f)
                    .map(f => path.join(gitPath, f))
            )
        } catch (err) {
            console.error(`\nERROR:\n${err.message || err.stack || err}\n`)
            return callback(null)
        }

        changedFiles.forEach(changedFile => {
            if (this.isIgnoredPath(changedFile)) { return }

            const dirName = path.dirname(changedFile)
            const fileName = path.basename(changedFile)

            if (!fileName.startsWith('_') && fileName.startsWith('index.') && fileName.endsWith('.pug')) {
                sourcePugFiles.push(dirName)
            }

            if (!fileName.startsWith('_') && fileName.endsWith('.js')) {
                sourceJsFiles.push(changedFile)
            }

            if (!fileName.startsWith('_') && fileName.endsWith('.styl')) {
                sourceStylusFiles.push(changedFile)
            }

            sourcePugFiles = sourcePugFiles.concat(this.getSourceFromDependenct(changedFile))
        })

        sourcePugFiles = _.uniq(sourcePugFiles)
        sourceJsFiles = _.uniq(sourceJsFiles)
        sourceStylusFiles = _.uniq(sourceStylusFiles)

        sourcePugFiles.sort()
        sourceJsFiles.sort()
        sourceStylusFiles.sort()

        callback(null, {
            pug: sourcePugFiles,
            js: sourceJsFiles,
            styl: sourceStylusFiles
        })
    }



    getAllSourceFiles (callback) {
        async.parallel({
            pug: (callback) => {
                var sourcePugFiles = []

                klaw(this.sourceDir).on('data', (item) => {
                    if (!fs.lstatSync(item.path).isFile()) { return }
                    if (this.isIgnoredPath(item.path)) { return }

                    const dirName = path.dirname(item.path)
                    const fileName = path.basename(item.path)

                    if (!fileName.startsWith('index.') || !fileName.endsWith('.pug')) { return }

                    sourcePugFiles.push(dirName)
                }).on('end', () => {
                    sourcePugFiles = _.uniq(sourcePugFiles)
                    sourcePugFiles.sort()

                    callback(null, sourcePugFiles)
                })
            },
            js: (callback) => {
                var sourceJsFiles = []

                if (!this.sourceDirJs) { return callback(null, sourceJsFiles) }

                klaw(this.sourceDirJs).on('data', (item) => {
                    if (!fs.lstatSync(item.path).isFile()) { return }
                    if (this.isIgnoredPath(item.path)) { return }

                    const dirName = path.dirname(item.path)
                    const fileName = path.basename(item.path)

                    if (fileName.startsWith('_') || !fileName.endsWith('.js')) { return }

                    sourceJsFiles.push(item.path)
                }).on('end', () => {
                    sourceJsFiles = _.uniq(sourceJsFiles)
                    sourceJsFiles.sort()

                    callback(null, sourceJsFiles)
                })
            },
            styl: (callback) => {
                var sourceStylusFiles = []

                if (!this.sourceDirStyl) { return callback(null, sourceStylusFiles) }

                klaw(this.sourceDirStyl).on('data', (item) => {
                    if (!fs.lstatSync(item.path).isFile()) { return }
                    if (this.isIgnoredPath(item.path)) { return }

                    const dirName = path.dirname(item.path)
                    const fileName = path.basename(item.path)

                    if (fileName.startsWith('_') || !fileName.endsWith('.styl')) { return }

                    sourceStylusFiles.push(item.path)
                }).on('end', () => {
                    sourceStylusFiles = _.uniq(sourceStylusFiles)
                    sourceStylusFiles.sort()

                    callback(null, sourceStylusFiles)
                })
            }
        }, callback)
    }



    getSourceFromDependenct (file) {
        const dependency = file.replace(this.sourceDir, '')
        const source = _.get(this, 'state.html', [])
            .filter(x => x.dependencies.includes(dependency) || x.source === dependency)
            .map(x => path.dirname(path.join(this.sourceDir, x.source)))

        return _.uniq(source)
    }



    getTemplate (folder, callback) {
        var result = {}

        async.eachSeries(this.locales, (locale, callback) => {
            var fileName = `index.${locale}.pug`

            fs.access(path.join(folder, fileName), fs.constants.R_OK, (err) => {
                if (err) {
                    fileName = 'index.pug'
                }

                fs.readFile(path.join(folder, fileName), 'utf8', (err, data) => {
                    if (!err) {
                        result[locale] = {
                            filename: path.join(folder, fileName),
                            template: data
                        }
                    }

                    callback(null)
                })
            })
        }, (err) => {
            if (err) { return callback(err) }

            callback(null, result)
        })
    }



    getData (folder, callback) {
        const defaultContent = {
            self: true,
            buildFile: null,
            cache: false,
            debug: false,
            compileDebug: false,
            pretty: false,
            inlineRuntimeFunctions: false,
            basedir: this.sourceDir,
            disabled: false,
            locale: null,
            defaultLocale: this.defaultLocale,
            path: folder.replace(this.sourceDir, '').substr(1).replace(/\\/, '/'),
            otherLocalePaths: {},
            data: {},
            dependencies: [],
            md: (text) => {
                if (text) {
                    return md({ breaks: true, html: true })
                        .use(mdTable, { multiline: true, rowspan: true, headerless: true })
                        .use(mdSup)
                        .use(mdAttrs)
                        .render(text)
                } else {
                    return ''
                }
            },
            env: process.env
        }
        var result = {}

        async.eachSeries(this.locales, (locale, callback) => {
            var fileName = `data.${locale}.yaml`

            result[locale] = []

            fs.access(path.join(folder, fileName), fs.constants.R_OK, (err) => {
                if (err) {
                    fileName = 'data.yaml'
                }

                fs.readFile(path.join(folder, fileName), 'utf8', (err, data) => {
                    var yamlData = [{}]

                    if (err) {
                        delete result[locale]
                        return callback(null)
                    }

                    try {
                        yamlData = yaml.safeLoad(data)

                        if (!Array.isArray(yamlData)) {
                            yamlData = [yamlData]
                        }
                    } catch (err) {
                        return callback(this.parseErr(err, path.join(folder, fileName)))
                    }

                    async.eachSeries(yamlData, (data, callback) => {
                        data = Object.assign({}, defaultContent, this.globalData[locale], data)

                        data.dependencies = [path.join(folder, fileName)]
                        if (this.globalDataFile[locale]) {
                            data.dependencies.push(this.globalDataFile[locale])
                        }

                        // Move old .page to root
                        data = Object.assign({}, data, data.page)
                        delete data.page

                        data.locale = locale
                        if (locale === this.defaultLocale) {
                            data.path = `/${data.path}`
                        } else {
                            data.path = data.path ? `/${data.locale}/${data.path}` : `/${data.locale}`
                        }

                        async.eachOfSeries(data.data, (file, key, callback) => {
                            if(file.substr(0, 1) === '/') {
                                file = path.join(this.sourceDir, file)
                            } else {
                                file = path.join(folder, file)
                            }

                            fs.readFile(file, 'utf8', (err, fileData) => {
                                if (err) { return callback(this.parseErr(err, path.join(folder, fileName))) }

                                try {
                                    data.data[key] = yaml.safeLoad(fileData)
                                    data.dependencies.push(file)
                                } catch (err) {
                                    return callback(this.parseErr(err, file))
                                }

                                callback(null)
                            })
                        }, (err) => {
                            if (err) { return callback(err) }

                            result[locale].push(data)
                            callback(null)
                        })
                    }, callback)
                })
            })
        }, (err) => {
            if (err) { return callback(err) }

            callback(null, result)
        })
    }



    getJs (folder, callback) {
        var result = {}

        async.eachSeries(this.locales, (locale, callback) => {
            var fileName = `script.${locale}.js`

            fs.access(path.join(folder, fileName), fs.constants.R_OK, (err) => {
                if (err) {
                    fileName = 'script.js'
                }

                fs.readFile(path.join(folder, fileName), 'utf8', (err, data) => {
                    if (!err) {
                        result[locale] = {
                            filename: path.join(folder, fileName),
                            js: data
                        }
                    }

                    callback(null)
                })
            })
        }, (err) => {
            if (err) { return callback(err) }

            callback(null, result)
        })
    }



    getStyl (folder, callback) {
        var result = {}

        async.eachSeries(this.locales, (locale, callback) => {
            var fileName = `style.${locale}.styl`

            fs.access(path.join(folder, fileName), fs.constants.R_OK, (err) => {
                if (err) {
                    fileName = 'style.styl'
                }

                fs.readFile(path.join(folder, fileName), 'utf8', (err, data) => {
                    if (!err) {
                        result[locale] = {
                            filename: path.join(folder, fileName),
                            styl: data
                        }
                    }

                    callback(null)
                })
            })
        }, (err) => {
            if (err) { return callback(err) }

            callback(null, result)
        })
    }



    updateState (updatedFiles, callback) {
        if (!updatedFiles) { return callback(null) }

        if (updatedFiles.css && updatedFiles.css.length > 0) {
            this.state.css = updatedFiles.css
        }

        if (updatedFiles.js && updatedFiles.js.length > 0) {
            this.state.js = updatedFiles.js
        }

        if (updatedFiles.html && updatedFiles.html.length > 0) {
            if (!this.state.html) {
                this.state.html = []
            }
            updatedFiles.html.forEach(newFile => {
                if (this.state.html.find(oldFile => oldFile.source === newFile.source && oldFile.build === newFile.build)) {
                    this.state.html = this.state.html.map(oldFile => (oldFile.source === newFile.source && oldFile.build === newFile.build) ? newFile : oldFile)
                } else {
                    this.state.html.push(newFile)
                }
            })
        }

        this.state.date = (new Date()).toISOString()

        try {
            this.state.commit = require('child_process').execSync(`git -C "${this.sourceDir}" rev-parse HEAD`).toString().trim()
        } catch (e) {
            console.error(`Can\'t get last commit.`)
        }

        fs.outputFile(path.join(this.buildDir, 'build.json'), JSON.stringify(this.state), callback)
    }



    parseErr (err, file) {
        let message = (err.message || err.stack || err.toString()).replace('ENOENT: ', '').replace('\n\n', '\n').trim()

        if (!message.includes(file)) {
            message = `${file}\n${message}`
        }

        return message
    }



    isIgnoredPath (path) {
        return this.paths.length > 0 && this.paths.filter(p => path.startsWith(p)).length === 0 || this.ignorePaths.length > 0 && this.ignorePaths.filter(p => path.startsWith(p)).length !== 0
    }
}
