[![npm version](https://badge.fury.io/js/entu-cms.svg)](https://badge.fury.io/js/entu-cms)
[![Dependency Status](https://david-dm.org/argoroots/entu-cms.svg)](https://david-dm.org/argoroots/entu-cms)

## Entu CMS

Simple ([Jade](http://jade-lang.com)) file based CMS with multilanguage support


### Installation

    npm install -g npm-cms


### Usage

    npm-cms ./config.yaml


#### Example config.yaml

    locales:
      - en
      - et
    source: ./source
    build: ./build
    timeout: 10
    jade:
      basedir: ./source/_templates
      pretty: false


#### Example file structure
    |-- config.yaml
    |-- build
        |-- en
            |-- index.html
            |-- testpage1
                |-- index.html
            |-- testpage2
                |-- index.html
            |-- testpage3
                |-- index.html
        |-- et
            |-- index.html
            |-- testpage
                |-- index.html
            |-- testpage2
                |-- index.html
    |-- source
        |-- _template
            |-- layout.jade
            |-- mixins.jade
        |-- testpage1
            |-- index.en.yaml
            |-- index.et.yaml
            |-- index.jade
        |-- testpage2
            |-- index.en.jade
            |-- index.et.jade
            |-- index.yaml
        |-- testpage3
            |-- index.en.jade
            |-- index.en.yaml
        |-- index.jade
