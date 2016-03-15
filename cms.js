#!/usr/bin/env node

var fs   = require('fs')
var fse  = require('fs-extra')
var jade = require('jade')
var md   = require('marked')
var path = require('path')
var yaml = require('js-yaml')



APP_LOCALES = ['et', 'en', 'ru']
APP_DIR = process.argv[2] || __dirname
APP_SOURCE_DIR = path.join(APP_DIR, 'source')
APP_BUILD_DIR = path.join(APP_DIR, 'build')
APP_TEMPLATES_DIR = path.join(APP_SOURCE_DIR, '_templates')



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



var worker = function() {
    htmlFiles = []
    fse.walk(APP_SOURCE_DIR)
        .on('data', function (item) {
            if(item.path.indexOf('/_') > -1) { return }

            for (var l in APP_LOCALES) {
                try {
                    if (!APP_LOCALES.hasOwnProperty(l)) { continue }

                    var jadeFile = getFilePath(item.path, 'index.jade', APP_LOCALES[l])
                    if (!jadeFile) { continue }

                    var configFile = getFilePath(item.path, 'config.yaml', APP_LOCALES[l])
                    var config = {}
                    if (configFile) {
                        config = yaml.safeLoad(fs.readFileSync(configFile))
                    }

                    var dataFile = getFilePath(item.path, 'data.yaml', APP_LOCALES[l])
                    var data = {}
                    if (dataFile) {
                        data = yaml.safeLoad(fs.readFileSync(dataFile))
                    }

                    // data.pretty = true
                    data.basedir = APP_TEMPLATES_DIR
                    data.md = md

                    var html = jade.renderFile(jadeFile, data)
                    var htmlDir = path.dirname(jadeFile.replace(APP_SOURCE_DIR, path.join(APP_BUILD_DIR,  APP_LOCALES[l])))
                    var htmlFile = path.join(htmlDir, 'index.html')

                    htmlFiles.push(htmlFile)
                    fse.outputFile(htmlFile, html, function(err, a) {
                        if(err) { console.log(err) }
                    })
                } catch (e) {
                    console.error(e.message)
                }
            }
        })
        .on('end', function () {
            // console.log(htmlFiles.join('\n'))
            setTimeout(worker, 20000)
        })
}
worker()
