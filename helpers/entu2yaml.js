#!/usr/bin/env node

'use strict'

const async = require('async')
const fs = require('fs-extra')
const _ = require('lodash')
const request = require('request')
const yaml = require('js-yaml')


const ENTU_DB = process.env.ENTU_DB
const ENTU_KEY = process.env.ENTU_KEY
const ENTU_PARENT = process.env.ENTU_PARENT
const ENTU_TYPE = process.env.ENTU_TYPE
const DATA_YAML = process.argv[2]


const getPropertyValue = property => {
    if (property.string) { return property.string }
    if (property.date) { return property.date }
    if (property.integer) { return property.integer }
    if (property.boolean) { return property.boolean }
    if (property.reference) { return property.reference }

    delete property._id

    return property
}


request({
    url: 'https://api.entu.ee/auth',
    method: 'GET',
    json: true,
    'auth': {
        'bearer': ENTU_KEY
    }
}, (error, response, body) => {
    if (error) { console.error(error) }
    if (response.statusCode !== 200) { console.error(body) }

    let token = _.get(body, [ENTU_DB, 'token'], '')
    let qs = {
        limit: 1000
    }

    if (ENTU_TYPE) {
        qs['_type.string'] = ENTU_TYPE
    }
    if (ENTU_PARENT) {
        qs['_parent.reference'] = ENTU_PARENT
    }

    request({
        url: 'https://api.entu.ee/entity',
        method: 'GET',
        json: true,
        'auth': {
            'bearer': token
        },
        qs: qs
    }, (error, response, body) => {
        if (error) { console.error(error) }
        if (response.statusCode !== 200) { console.error(body) }

        let data = []

        for (let i = 0; i < body.entities.length; i++) {
            let entity = {}

            for (var e in body.entities[i]) {
                if (!body.entities[i].hasOwnProperty(e)) { continue }

                if (e === '_id') {
                    entity[e] = body.entities[i][e]
                } else if (body.entities[i][e].length === 1) {
                    entity[e] = getPropertyValue(body.entities[i][e][0])
                } else {
                    entity[e] = _.map(body.entities[i][e], getPropertyValue)
                }
            }

            data.push(entity)
        }

        fs.writeFileSync(DATA_YAML, yaml.safeDump(data, { indent: 4, lineWidth: 999999999 }))
    })
})
