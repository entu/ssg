[![npm version](https://badge.fury.io/js/entu-cms.svg)](https://badge.fury.io/js/entu-cms)
[![Dependency Status](https://david-dm.org/argoroots/entu-cms.svg)](https://david-dm.org/argoroots/entu-cms)

## Entu CMS

- Simple file based CMS.
- Generate static HTML files from [Jade](http://jade-lang.com) templates.
- Pass data to templates with [Yaml](http://yaml.org) files.
- Use locale identificator in filenames to generate locale specific content.
- ...


### Installation

    npm install -g npm-cms


### Usage

    npm-cms ./config.yaml


##### config.yaml

    locales:
      - en
      - et
    source: ./source
    build: ./build
    timeout: 10
    jade:
      basedir: ./source/_templates
      pretty: false

- __locales__: List of locale folders to generate. You can put locale identificator to filename (like index__.en__.jade or index__.et__.yaml) for locale speciffic content.
- __source__: Folder with source files.
- __build__: Folder to put generated HTML.
- __timeout__: Seconds to sleep after each run.
- __jade.basedir__: Jade basedir for simpler include/extend
- __jade.pretty__: Boolean to set if output HTML is prettified or not.


##### Source folder like this ...

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
            |-- testpage2en
                |-- index.en.jade
                |-- index.en.yaml
        |-- index.jade


##### ... will be converted to buld folder like this

    |-- build
        |-- en
            |-- index.html
            |-- testpage1
                |-- index.html
            |-- testpage2
                |-- index.html
                |-- testpage2en
                    |-- index.html
        |-- et
            |-- index.html
            |-- testpage1
                |-- index.html
            |-- testpage2
                |-- index.html
