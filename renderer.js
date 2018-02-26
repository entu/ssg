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

        this.locales = conf.locales || ['']
        this.defaultLocale = conf.defaultLocale || null
        this.sourceDir = conf.source || './'
        this.buildDir = conf.build || './'
        this.aliases = conf.dev.aliases || true
        this.paths = conf.dev.paths || []
        this.globalData = {}

        // Paths are relative to config file path
        if (this.sourceDir.substr(0, 1) === '.') {
            this.sourceDir = path.resolve(path.join(path.dirname(confFile), this.sourceDir))
        }
        if (this.buildDir.substr(0, 1) === '.') {
            this.buildDir = path.resolve(path.join(path.dirname(confFile), this.buildDir))
        }

        // Load global data
        this.locales.forEach(locale => {
            this.globalData[locale] = {}

            try {
                this.globalData[locale] = yaml.safeLoad(fs.readFileSync(path.join(this.sourceDir, `global.${locale}.yaml`), 'utf8'))
            } catch (e) {
                this.globalData[locale] = yaml.safeLoad(fs.readFileSync(path.join(this.sourceDir, `global.yaml`), 'utf8'))
            } finally {
                // No global data
            }
        })
    }



    makeHTML (sourcePath, callback) {
        var outputFiles = []

        async.parallel({
            template: callback => {
                this.loadTemplate(sourcePath, callback)
            },
            data: callback => {
                this.loadData(sourcePath, callback)
            }
        }, (err, page) => {
            if (err) { return callback(err) }

            async.eachOf(page.template, (template, locale, callback) => {
                async.eachOf(page.data[locale], (data, idx, callback) => {
                    if (data.disabled) { return callback(null) }

                    data.filename = template.filename

                    let otherLocalePaths = {}
                    Object.keys(page.template).forEach(otherLocale => {
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

                            fs.outputFile(buildFile, minify(html, htmlMinifyConf), err => {
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
            }, err => {

                callback(null, outputFiles)
            })
        })
    }



    makeCSS (sourceFiles, callback) {
        var styleComponents = []
        var outputFiles = []

        async.each(sourceFiles, (stylusFile, callback) => {
            fs.readFile(stylusFile, 'utf8', (err, data) => {
                if (err) { return callback(err) }

                styleComponents.push(data)
                callback(null)
            })
        }, err => {
            if (err) { return callback(err) }

            const cssFile = path.join(this.buildDir, 'style.css')
            const styl = stylus(styleComponents.join('\n\n')).set('warn', false).set('compress', true).set('sourcemap', {})

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
                ], err => {
                    if (err) { return callback(err) }
                    callback(null, outputFiles)
                })
            })
        })
    }



    makeJS (sourceFiles, callback) {
        var jsComponents = []
        var outputFiles = []

        async.each(sourceFiles, (scriptFile, callback) => {
            fs.readFile(scriptFile, 'utf8', (err, data) => {
                if (err) { return callback(err) }

                jsComponents.push(data)
                callback(null)
            })
        }, err => {
            if (err) { return callback(err) }

            const jsFile = path.join(this.buildDir, 'script.js')
            const script = uglify.minify(jsComponents.join('\n\n'), { fromString: true, outSourceMap: true })

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
            ], err => {
                if (err) { return callback(err) }
                callback(null, outputFiles)
            })
        })
    }



    loadTemplate (folder, callback) {
        var result = {}

        async.each(this.locales, (locale, callback) => {
            var fileName = `index.${locale}.pug`

            fs.access(path.join(folder, fileName), fs.constants.R_OK, err => {
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
        }, err => {
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
            path: folder.replace(this.sourceDir, '').substr(1).replace(/\\/, '/'),
            otherLocalePaths: {},
            data: {},
            md: text => {
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

            result[locale] = [{}]

            fs.access(path.join(folder, fileName), fs.constants.R_OK, err => {
                if (err) {
                    fileName = 'data.yaml'
                }

                fs.readFile(path.join(folder, fileName), 'utf8', (err, data) => {
                    if (!err) {
                        try {
                            let yamlData = yaml.safeLoad(data)

                            // Move old .page to root
                            yamlData = Object.assign({}, yamlData, yamlData.page)
                            delete yamlData.page

                            if (Array.isArray(yamlData)) {
                                result[locale] = Object.assign({}, defaultContent, this.globalData[locale], yamlData)
                            } else {
                                result[locale] = [Object.assign({}, defaultContent, this.globalData[locale], yamlData)]
                            }
                        } catch (e) {
                            console.log(e)
                        }
                    } else {
                        result[locale] = [Object.assign({}, defaultContent, this.globalData[locale])]
                    }

                    async.each(result[locale], (data, callback) => {
                        if (!data.data) { return callback(null) }

                        data.locale = locale
                        data.path = data.path ? `/${data.locale}/${data.path}` : `/${data.locale}`

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
                        }, callback)
                    }, callback)
                })
            })
        }, err => {
            if (err) { return callback(err) }

            callback(null, result)
        })
    }
}
