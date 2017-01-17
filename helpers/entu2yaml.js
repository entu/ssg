#!/usr/bin/env node

const entulib = require('entulib')
const fs = require('fs-extra')
const klaw = require('klaw')
const path = require('path')
const yaml = require('js-yaml')

// Entities fetched from Entu must have 'path' property or they will get discarded.

const ENTU_OPTIONS = {
    entuUrl: process.env.ENTU_URL,
    user: process.env.ENTU_USER || '',
    key: process.env.ENTU_KEY || ''
}


const PARENT_EID = process.env.PARENT_EID
const E_DEF = process.env.E_DEF


const ITEM_DIR = process.env.ITEM_DIR
    ? ( path.isAbsolute(process.env.ITEM_DIR)
            ? process.env.ITEM_DIR
            : path.join(process.cwd(), process.env.ITEM_DIR)
      )
    : false

const ITEM_YAML = process.env.ITEM_YAML ? process.env.ITEM_YAML : 'data.yaml'

// const ITEM_YAML = process.env.ITEM_YAML
//     ? ( process.env.ITEM_YAML.split(',').map(function(filepath) {
//             return path.isAbsolute(filepath)
//                 ? filepath
//                 : path.join(process.cwd(), filepath)
//         })
//       )
//     : false
//
const LIST_YAML = process.env.LIST_YAML
    ? ( path.isAbsolute(process.env.LIST_YAML)
            ? process.env.LIST_YAML
            : path.join(process.cwd(), process.env.LIST_YAML)
      )
    : false

const OUT_DIR = process.env.OUT_DIR
    ? ( path.isAbsolute(process.env.OUT_DIR)
            ? process.env.OUT_DIR
            : path.join(process.cwd(), process.env.OUT_DIR)
        )
    : false


const saveEntity = function(opEntity) {
    let out_dir = path.join(OUT_DIR, opEntity.get(['properties','path','values',0,'value']))

    if (ITEM_DIR) {
        klaw(ITEM_DIR)
            .on('data', function (item) {
                if (item.stats.isDirectory()) {
                    return
                }
                fs.copy(item.path, path.join(out_dir, path.basename(item.path)))
            })
            .on('end', function (err) {
                if (err) {
                    console.log('whoa, ERR:',err)
                    throw err
                }
            })
    }

    let out_file = path.join(out_dir, ITEM_YAML)
    console.log('save ' + opEntity.get(['id']) + ' | ' + opEntity.get(['displayname']) + out_file)
    let data_y = yaml.safeDump(opEntity.get(), { indent: 4, lineWidth: 999999999 })
    fs.outputFileSync(out_file, data_y)
}


const saveEntities = function(opEntities) {
    let entities = []
    opEntities.forEach(function(opEntity) {
        entities.push(opEntity.get())
        if (!opEntity.get(['properties','path','values',0])) {
            // console.log('skipping ' + opEntity.get(['id']) + ' | ' + opEntity.get(['displayname']))
            return
        }
        saveEntity(opEntity)
        return
    })
    if (LIST_YAML) {
        let data_y = yaml.safeDump(entities, { indent: 4, lineWidth: 999999999 })
        fs.outputFileSync(LIST_YAML, data_y)
    }
}


var errored = false


if (!ITEM_DIR && !LIST_YAML) {
    console.error('ITEM_DIR or LIST_YAML is required')
    errored = true
}


if (!ENTU_OPTIONS.entuUrl) {
    console.error('Missing mandatory ENTU_URL')
    errored = true
}

if (!OUT_DIR) {
    console.error('Missing mandatory OUT_DIR')
    errored = true
} else if (!fs.existsSync(OUT_DIR)) {
    fs.ensureDirSync(OUT_DIR)
}

if (errored) { process.exit(1) }

if (PARENT_EID) {
    console.log('get childs')
    entulib.getChilds(PARENT_EID, E_DEF, ENTU_OPTIONS)
    .then(function(opEntities) {
        saveEntities(opEntities.entities)
    })
    .catch(function(reason) {
        console.log('Caching childs of ' + PARENT_EID + ' failed: ', reason)
        return
    })
} else if (E_DEF) {
    console.log('get entities')
    entulib.getEntities(E_DEF, null, null, ENTU_OPTIONS)
    .then(function(opEntities) {
        saveEntities(opEntities.entities)
    })
    .catch(function(reason) {
        console.log('Caching ' + E_DEF + ' entities failed: ', reason)
        return
    })
} else {
    console.error('Please set E_DEF and/or PARENT_EID')
    process.exit(1)
}
