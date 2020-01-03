#!/usr/bin/env node

'use strict'

const _ = require('lodash')
const fs = require('fs-extra')
const request = require('request')
const yaml = require('js-yaml')


const ENTU_DB = process.env.ENTU_DB
const ENTU_KEY = process.env.ENTU_KEY
const ENTU_QUERY = process.env.ENTU_QUERY || ''
const DATA_YAML = process.argv[2]


const getPropertyValue = (property) => {
    if (property.reference) { return property.reference }
    if (property.string) { return property.string }
    if (property.date) { return property.date }
    if (property.integer) { return property.integer }
    if (property.boolean) { return property.boolean }

    return property
}


request({
    url: 'https://api.entu.app/auth',
    method: 'GET',
    json: true,
    auth: {
        bearer: ENTU_KEY
    }
}, (error, response, body) => {
    if (error) { console.error(error) }
    if (response.statusCode !== 200) { console.error(body) }

    let token = body.find(x => x.account === ENTU_DB).token
    let qs = {
        limit: 1000
    }

    request({
        url: 'https://api.entu.app/entity' + '?' + ENTU_QUERY,
        method: 'GET',
        json: true,
        auth: {
            bearer: token
        }
    }, (error, response, body) => {
        if (error) { console.error(error) }
        if (response.statusCode !== 200) { console.error(body) }

        if (body.entities) {
            let data = []

            for (let i = 0; i < body.entities.length; i++) {
                let entity = {}

                for (var e in body.entities[i]) {
                    if (!body.entities[i].hasOwnProperty(e)) { continue }

                    if (e === '_id' || e === '_thumbnail') {
                        entity[e] = body.entities[i][e]
                    } else if (body.entities[i][e].length === 1) {
                        entity[e] = getPropertyValue(body.entities[i][e][0])
                    } else {
                        entity[e] = _.map(body.entities[i][e], getPropertyValue)
                    }
                }

                data.push(entity)
            }

            fs.outputFileSync(DATA_YAML, yaml.safeDump(data, { indent: 4, lineWidth: 999999999 }))
        }
    })
})
