[![npm version](https://badge.fury.io/js/entu-cms.svg)](https://badge.fury.io/js/entu-cms)
[![Dependency Status](https://david-dm.org/argoroots/entu-cms.svg)](https://david-dm.org/argoroots/entu-cms)
[![Codacy Badge](https://api.codacy.com/project/badge/grade/66531026074a471897b076fb91a74601)](https://www.codacy.com/app/argoroots/entu-cms)



# Entu CMS

- Simple file based CMS.
- Generate static HTML files from [Jade](http://jade-lang.com) templates.
- Pass data to templates with [Yaml](http://yaml.org) files.
- Use locale identificator in filenames to generate locale specific content.
- ...



## Installation

    npm install -g entu-cms



## Usage

    node entu-cms.js ./config.yaml


### Configuration

Sites build process is configurable by Yaml file and its path must be first argument for entu-cms.js. Required parameters are:

- __locales__  
  List of locale folders to generate. You can put locale identificator to filename (like index.en.jade or data.et.yaml) for locale speciffic content.
- __source__  
  Folder with source files (realtive to build config.yaml). Folders beginning with underscore are ignored.
- __build__  
  Folder to put generated HTML (realtive to build config.yaml).
- __timeout__  
  Seconds to sleep after each run.
- __jade.basedir__  
  Jade basedir for simpler include/extend.
- __jade.pretty__  
  Boolean to set if output HTML is pretty formatted or not.

##### Example build configuration file:
    locales:
      - en
      - et
    source: ./source
    build: ./build
    timeout: 10
    jade:
      basedir: ./source/_templates
      pretty: false



## Content

### Page content - index.jade

Page content is generated from __index.jade__ file. All other files are ignored, but You can use those files for Jade [include](http://jade-lang.com/reference/includes)/[extends](http://jade-lang.com/reference/inheritance). You can put locale identificator to filename (like index.en.jade) for locale speciffic content.


### Page data - data.yaml

To pass data to index.jade use __data.yaml__ file. You can put locale identificator to filename (like data.en.yaml) for locale speciffic content.


### Page configuration - config.yaml

Each folder can contain page configuration file __config.yaml__. Parameters are:

- __path__  
  If set, it will override folder based path.
- __aliases__  
  List of path aliases
- __redirect__  
  Path or url to redirect (if user visits this page)

##### Example page configuration file:

    path: /testpage1
    aliases:
      - /test
      - /test123
    redirect: https://github.com



## On build ...

##### ... source folder like this ...

    - source
        |- _templates
        |   |- layout.jade
        |   +- mixins.jade

        |- testpage1
        |   |- data.en.yaml
        |   |- data.et.yaml
        |   +- index.jade
        |
        |- testpage2
        |   |- index.en.jade
        |   |- index.et.jade
        |   |- data.yaml
        |   +- testpage2en
        |       |- index.en.jade
        |       +- data.en.yaml
        |
        +- index.jade

##### ... will be converted to buld folder like this

    - build
        |- en
        |   |- index.html
        |   |- testpage1
        |   |   |- index.html
        |   |
        |   +- testpage2
        |       |- index.html
        |       +- testpage2en
        |           +- index.html
        |
        +- et
            |- index.html
            |- testpage1
            |   +- index.html
            |
            +- testpage2
                +- index.html
