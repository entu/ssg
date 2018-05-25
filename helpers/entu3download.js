#!/usr/bin/env node

'use strict'

const _ = require('lodash')
const fs = require('fs-extra')
const request = require('request')


const ENTU_DB = process.env.ENTU_DB
const ENTU_KEY = process.env.ENTU_KEY
const ENTU_FILE_ID = process.argv[3] || process.env.ENTU_FILE_ID || ''
const OUTFILE = process.argv[2]


request({
    url: 'https://api.entu.app/auth',
    method: 'GET',
    json: true,
    auth: {
        bearer: ENTU_KEY
    }
}, (error, res, body) => {
    if (error) { console.error(error) }
    if (res.statusCode !== 200) { console.error(body) }

    const token = _.get(body, [ENTU_DB, 'token'], '')

    const options = {
        url: `https://api.entu.app/property/${ENTU_FILE_ID}?download`,
        method: 'GET',
        auth: { bearer: token }
    }
    let r = request(options)
    r.on('response',  function (res) {
        res.pipe(
            fs.createWriteStream('./' + OUTFILE + '.jpg')
            // fs.createWriteStream('./' + OUTFILE + '.' + res.headers['content-type'].split('/')[1])
        )
    })
})
