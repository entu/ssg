'use strict'

const _ = require('lodash')
const {minify} = require('html-minifier')
const async = require('async')
const fs = require('fs-extra')
const md = require('markdown-it')
const mdAttrs = require('markdown-it-attrs')
const mdSup = require('markdown-it-sup')
const path = require('path')
const pug = require('pug')
const stylus = require('stylus')
const uglify = require('uglify-js')
const yaml = require('js-yaml')



module.exports = class {
    constructor (confFile) {
        const conf = yaml.safeLoad(fs.readFileSync(confFile, 'utf8'))

        this.locales = _.get(conf, 'locales') || ['']
        this.defaultLocale = _.get(conf, 'defaultLocale') || null
        this.sourceDir = _.get(conf, 'source') || './'
        this.buildDir = _.get(conf, 'build') || './'
        this.aliases = _.get(conf, 'dev.aliases') || true
        this.paths = _.get(conf, 'dev.paths') || []
        this.globalData = {}

        // Paths are relative to config file path
        if (this.sourceDir.substr(0, 1) === '.') {
            this.sourceDir = path.resolve(path.join(path.dirname(confFile), this.sourceDir))
        }
        if (this.buildDir.substr(0, 1) === '.') {
            this.buildDir = path.resolve(path.join(path.dirname(confFile), this.buildDir))
        }

        // Load global data
        this.locales.forEach((locale) => {
            this.globalData[locale] = {}

            try {
                this.globalData[locale] = yaml.safeLoad(fs.readFileSync(path.join(this.sourceDir, `global.${locale}.yaml`), 'utf8'))
            } catch (e) {
                try {
                    this.globalData[locale] = yaml.safeLoad(fs.readFileSync(path.join(this.sourceDir, `global.yaml`), 'utf8'))
                } catch (e) {
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
                            const dependencies = compiledPug.dependencies
                            const html = compiledPug(data)

                            fs.outputFile(buildFile, minify(html, htmlMinifyConf), (err) => {
                                if (err) {
                                    callback(err)
                                } else {
                                    outputFiles.push({
                                        source: template.filename,
                                        build: buildFile,
                                        alias: data.path !== buildPath,
                                        dependencies: dependencies
                                    })
                                    callback(null)
                                }
                            })
                        } catch (e) {
                            console.log(e)
                            callback(e)
                        }
                    }, callback)
                }, callback)
            }, (err) => {

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
                if (err) { return callback(err) }

                styleComponents.push(data)
                callback(null)
            })
        }, (err) => {
            if (err) { return callback(err) }

            const cssFile = path.join(this.buildDir, 'style.css')
            const styl = stylus(styleComponents.join('\n\n'))
                .set('warn', false)
                .set('compress', true)
                .set('filename', 'style.css')
                .set('sourcemap', {})

            styl.render((err, css) => {
                if (err) { return callback(err) }

                async.parallel([
                    function (callback) {
                        fs.outputFile(cssFile, css, {}, function (err) {
                            if (err) { return callback(err) }

                            outputFiles.push({ path: cssFile })
                            callback(null)
                        })
                    },
                    function (callback) {
                        fs.outputFile(cssFile + '.map', JSON.stringify(styl.sourcemap), {}, function (err) {
                            if (err) { return callback(err) }

                            outputFiles.push({ path: cssFile + '.map', alias: true })
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
                if (err) { return callback(err) }

                jsComponents[path.basename(scriptFile)] = data
                callback(null)
            })
        }, (err) => {
            if (err) { return callback(err) }

            const jsFile = path.join(this.buildDir, 'script.js')
            const script = uglify.minify(jsComponents, { sourceMap: { filename: 'script.js', url: 'script.js.map' } })

            async.parallel([
                function (callback) {
                    fs.outputFile(jsFile, script.code, {}, function (err) {
                        if (err) { return callback(err) }

                        outputFiles.push({ path: jsFile })
                        callback(null)
                    })
                },
                function (callback) {
                    fs.outputFile(jsFile + '.map', script.map, {}, function (err) {
                        if (err) { return callback(err) }

                        outputFiles.push({ path: jsFile + '.map', alias: true })
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
            if (err) {
                return callback(err)
            } else {
                return callback(null, result)
            }
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
                        } catch (e) {
                            console.log(e)
                        }
                    }

                    async.each(yamlData, (data, callback) => {
                        data = Object.assign({}, defaultContent, this.globalData[locale], data)

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
                                if (!err) {
                                    try {
                                        data.data[key] = yaml.safeLoad(fileData)
                                    } catch (e) {
                                        console.log(e)
                                    }
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
}
