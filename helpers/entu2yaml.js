#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const entulib = require('entulib')
const yaml = require('js-yaml')

// Entities fetched from Entu must have 'path' property or they will get discarded.

const ENTU_OPTIONS = {
  entuUrl: process.env.ENTU_URL,
  user: process.env.ENTU_USER || '',
  key: process.env.ENTU_KEY || ''
}


const PARENT_EID = process.env.PARENT_EID
const E_DEF = process.env.E_DEF


const TEMPLATE = process.env.TEMPLATE
  ? ( path.isAbsolute(process.env.TEMPLATE)
      ? process.env.TEMPLATE
      : path.join(process.cwd(), process.env.TEMPLATE)
    )
  : false

const OUT_DIR = process.env.OUT_DIR
  ? ( path.isAbsolute(process.env.OUT_DIR)
      ? process.env.OUT_DIR
      : path.join(process.cwd(), process.env.OUT_DIR)
    )
  : false


const saveEntity = function(opEntity) {
  let out_dir = path.join(OUT_DIR, opEntity.get(['properties','path',0,'value']))

  fs.createReadStream(TEMPLATE).pipe(fs.createWriteStream(path.join(out_dir, 'index.jade')))

  if (!fs.existsSync(out_dir)) { fs.mkdirSync(out_dir) }
  let out_file = path.join(out_dir, 'data.yaml')
  console.log('save ' + opEntity.get(['id']) + ' | ' + opEntity.get(['displayname']) + out_file)
  fs.writeFileSync(out_file, yaml.safeDump(opEntity.get(), { indent: 4, lineWidth: 999999999 }))
}


const saveEntities = function(opEntities) {
  console.log(opEntities);
  opEntities.entities.forEach(function(opEntity) {
    if (!opEntity.get(['properties','path',0])) {
      console.log('skipping ' + opEntity.get(['id']) + ' | ' + opEntity.get(['displayname']))
      return
    }
    saveEntity(opEntity)
    return
  })
}


var errored = false

if (!TEMPLATE) {
  console.error('Missing mandatory TEMPLATE')
  errored = true
} else if (!fs.existsSync(TEMPLATE)) {
  console.error('Missing ' + TEMPLATE)
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
  console.error('Missing ' + OUT_DIR)
  errored = true
}

if (errored) { process.exit(1) }

if (PARENT_EID) {
  console.log('get childs')
  entulib.getChilds(PARENT_EID, E_DEF, ENTU_OPTIONS)
  .then(function(opEntities) {
    saveEntities(opEntities)
  })
  .catch(function(reason) {
    console.log('Caching childs of ' + PARENT_EID + ' failed: ', reason)
    return
  })
} else if (E_DEF) {
  console.log('get entities')
  entulib.getEntities(E_DEF, null, null, ENTU_OPTIONS)
  .then(function(opEntities) {
    saveEntities(opEntities)
  })
  .catch(function(reason) {
    console.log('Caching ' + E_DEF + ' entities failed: ', reason)
    return
  })
} else {
  console.error('Please set E_DEF and/or PARENT_EID')
  process.exit(1)
}
