'use strict'

const _ = require('lodash')
const {minify} = require('html-minifier')
const async = require('async')
const fs = require('fs-extra')
const http = require('http')
const klaw = require('klaw')
const md = require('markdown-it')
const mdAttrs = require('markdown-it-attrs')
const mdSup = require('markdown-it-sup')
const path = require('path')
const pug = require('pug')
const stylus = require('stylus')
const stylusAutoprefixer = require('autoprefixer-stylus')
const uglify = require('uglify-js')
const yaml = require('js-yaml')
const mime = require('mime-types')



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
        this.buildDir = _.get(conf, 'build') || './'
        this.assetsDir = _.get(conf, 'assets') || './'
        this.aliases = _.get(conf, 'dev.aliases') || true
        this.paths = _.get(conf, 'dev.paths') || []
        this.serverPort = _.get(conf, 'server.port') || null
        this.serverAssets = _.get(conf, 'server.assets') || '/'
        this.lastCommit = null
        this.lastBuild = {}
        this.globalData = {}

        // Paths are relative to config file path
        if (this.sourceDir.substr(0, 1) === '.') {
            this.sourceDir = path.resolve(path.join(path.dirname(confFile), this.sourceDir))
        }
        if (this.buildDir.substr(0, 1) === '.') {
            this.buildDir = path.resolve(path.join(path.dirname(confFile), this.buildDir))
        }
        if (this.assetsDir.substr(0, 1) === '.') {
            this.assetsDir = path.resolve(path.join(path.dirname(confFile), this.assetsDir))
        }

        try {
            const buildJson = JSON.parse(fs.readFileSync(path.join(this.buildDir, 'build.json'), 'utf8'))

            this.lastCommit = buildJson.commit
            this.lastBuild = buildJson.build
        } catch (err) {
            // No build.json
        }

        // Load global data
        this.locales.forEach((locale) => {
            this.globalData[locale] = {}

            try {
                this.globalData[locale] = yaml.safeLoad(fs.readFileSync(path.join(this.sourceDir, `global.${locale}.yaml`), 'utf8'))
            } catch (err) {
                try {
                    this.globalData[locale] = yaml.safeLoad(fs.readFileSync(path.join(this.sourceDir, `global.yaml`), 'utf8'))
                } catch (err) {
                    // No global data
                }
            }
        })
    }



    makeHTML (sourcePath, callback) {
        var outputFiles = []

        async.parallel({
            template: (callback) => {
                this.loadTemplate(sourcePath, callback)
            },
            data: (callback) => {
                this.loadData(sourcePath, callback)
            }
        }, (err, page) => {
            if (err) { return callback(err) }

            async.eachOf(page.template, (template, locale, callback) => {
                async.eachOf(page.data[locale], (data, idx, callback) => {
                    if (data.disabled) { return callback(null) }

                    data.filename = template.filename

                    let otherLocalePaths = {}
                    this.locales.forEach((otherLocale) => {
                        if (!page.template[locale]) { return }
                        if (otherLocale === data.locale) { return }
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

                    async.each([data.path].concat(data.aliases || []), (buildPath, callback) => {
                        data.alias = data.path !== buildPath ? buildPath : null

                        try {
                            let buildFile = path.join(this.buildDir, buildPath, 'index.html')

                            const compiledPug = pug.compile(template.template, data)
                            const dependencies = compiledPug.dependencies.concat(data.dependencies)
                            const html = compiledPug(data)

                            fs.outputFile(buildFile, minify(html, htmlMinifyConf), (err) => {
                                if (err) { return callback(this.parseErr(err, data.filename)) }

                                let result = {
                                    source: template.filename.replace(this.sourceDir, ''),
                                    build: buildFile.replace(this.buildDir, ''),
                                }
                                if (data.path !== buildPath) {
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

        async.each(sourceFiles, (stylusFile, callback) => {
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
                .set('warn', false)
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

        async.each(sourceFiles, (scriptFile, callback) => {
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



    loadTemplate (folder, callback) {
        var result = {}

        async.each(this.locales, (locale, callback) => {
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



    loadData (folder, callback) {
        const defaultContent = {
            self: true,
            buildFile: null,
            cache: true,
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
                    return md({ breaks: true, html: true }).use(mdSup).use(mdAttrs).render(text).replace(/\r?\n|\r/g, '')
                } else {
                    return ''
                }
            }
        }
        var result = {}

        async.each(this.locales, (locale, callback) => {
            var fileName = `data.${locale}.yaml`

            result[locale] = []

            fs.access(path.join(folder, fileName), fs.constants.R_OK, (err) => {
                if (err) {
                    fileName = 'data.yaml'
                }

                fs.readFile(path.join(folder, fileName), 'utf8', (err, data) => {
                    var yamlData = [{}]

                    if (!err) {
                        try {
                            yamlData = yaml.safeLoad(data)

                            if (!Array.isArray(yamlData)) {
                                yamlData = [yamlData]
                            }
                        } catch (err) {
                            return callback(this.parseErr(err, path.join(folder, fileName)))
                        }
                    }

                    async.each(yamlData, (data, callback) => {
                        data = Object.assign({}, defaultContent, this.globalData[locale], data)

                        data.dependencies = [path.join(folder, fileName)]

                        // Move old .page to root
                        data = Object.assign({}, data, data.page)
                        delete data.page

                        data.locale = locale
                        if (locale === this.defaultLocale) {
                            data.path = `/${data.path}`
                        } else {
                            data.path = data.path ? `/${data.locale}/${data.path}` : `/${data.locale}`
                        }

                        async.eachOf(data.data, (file, key, callback) => {
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



    getChangedSourceFiles (callback) {
        var gitPath = null


        var deletedFiles = []
        var changedFiles = []

        var sourcePugFiles= []
        var sourceJsFiles= []
        var sourceStylusFiles= []

        // Get last commit and build log
        try {
            if (!this.lastCommit) { return callback('No last commit') }
            if (!this.lastBuild) { return callback('No last build info') }

            gitPath = require('child_process')
                .execSync(`git -C "${this.sourceDir}" rev-parse --show-toplevel`)
                .toString()
                .trim()

            const gitDiff = require('child_process')
                .execSync(`git -C "${this.sourceDir}" diff --no-renames --name-status ${this.lastCommit}`)
                .toString()
                .trim()
                .split('\n')

            // deletedFiles = gitDiff
            //     .filter(f => f.startsWith('D\t'))
            //     .map(f => f.split('\t')[1])
            //     .filter(f => f)
            //     .map(f => path.join(gitPath, f))

            changedFiles = gitDiff
                .filter(f => f.startsWith('M\t') || f.startsWith('A\t'))
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
        } catch (e) {
            return callback(e)
        }

        changedFiles.forEach(changedFile => {
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

            this.lastBuild.html.forEach(buildFile => {
                if (buildFile.dependencies.includes(changedFile.replace(this.sourceDir, ''))) {
                    sourcePugFiles.push(path.dirname(path.join(this.sourceDir, buildFile.source)))
                }
            })
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
        var sourcePugFiles= []
        var sourceJsFiles= []
        var sourceStylusFiles= []

        klaw(this.sourceDir).on('data', (item) => {
            if (!fs.lstatSync(item.path).isFile()) { return }

            const dirName = path.dirname(item.path)
            const fileName = path.basename(item.path)

            if (fileName.startsWith('_')) { return }
            if (!fileName.endsWith('.pug') && !fileName.endsWith('.js') && !fileName.endsWith('.styl')) { return }

            if (fileName.startsWith('index.') && fileName.endsWith('.pug')) {
                sourcePugFiles.push(dirName)
            }
            if (fileName.endsWith('.js')) {
                sourceJsFiles.push(item.path)
            }
            if (fileName.endsWith('.styl')) {
                sourceStylusFiles.push(item.path)
            }
        }).on('end', () => {
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



    parseErr (err, file) {
        let message = (err.message || err.stack || err.toString()).replace('ENOENT: ', '').replace('\n\n', '\n').trim()

        if (!message.includes(file)) {
            message = `${file}\n${message}`
        }

        return message
    }
}
