[![npm version](https://badge.fury.io/js/entu-cms.svg)](https://badge.fury.io/js/entu-cms)
[![Dependency Status](https://david-dm.org/argoroots/entu-cms.svg)](https://david-dm.org/argoroots/entu-cms)
[![Codacy Badge](https://api.codacy.com/project/badge/grade/66531026074a471897b076fb91a74601)](https://www.codacy.com/app/argoroots/entu-cms)



![Screenshot](https://www.dropbox.com/s/6vlr5lei08s7isw/Entu-CMS.png?dl=1 "Screenshot")

- Simple file based CMS.
- Generate static HTML files from [Jade](http://jade-lang.com) templates.
- Generate site CSS from [Stylus](http://stylus-lang.com) files.
- Pass data to templates with [Yaml](http://yaml.org) files.
- Use locale identificator in filenames to generate locale specific content.
- ...



## Installation and usage

Download [latest build](https://github.com/argoroots/entu-cms/releases), unzip and run. Chose config.yaml file and it will:

1. generate HTML/CSS files
2. start server on localhost
3. monitor source folder for changes and (re)generate necessary HTML/CSS.



### Configuration

Sites build process is configurable by Yaml file and its path must be first argument for entu-cms.js. Required parameters are:

- __locales__  
  List of locale folders to generate. You can put locale identificator to filename (like index.en.jade or data.et.yaml) for locale speciffic content.
- __source__  
  Folder with source files (realtive to build config.yaml). Folders beginning with underscore are ignored.
- __build__  
  Folder to put generated HTML (realtive to build config.yaml).
- __assets__  
  Folder to put static files (JS, images, ...).
- __basePath__  
  ...
- __assetsPath__  
  Serving page in localhost will map this url to folder specified in _assets_ parameter.
- __jade.basedir__  
  Jade basedir for simpler include/extend.
- __jade.pretty__  
  Boolean to set if output HTML is pretty formatted or not.
- __stylus.pretty__  
  Boolean to set if output CSS is pretty formatted or not.
- __port__  
  What port to use for serving on localhost.

##### Example build configuration file:
    locales:
      - en
      - et
    source: ./source
    build: ./build
    assets: ./assets
    basePath: /
    assetsPath: /assets/
    jade:
      basedir: ./source/_templates
      pretty: false
    stylus:
      pretty: false
    port: 4000



## Content

### Page content - index.jade

Page content is generated from __index.jade__ file. All other files are ignored, but You can use those files for Jade [include](http://jade-lang.com/reference/includes)/[extends](http://jade-lang.com/reference/inheritance). You can put locale identificator to filename (like index.en.jade) for locale speciffic content.


### Page style - style.styl

To generate page CSS use __style.styl__ file. You can put locale identificator to filename (like style.en.styl) for locale speciffic style.

Global, location based, style.css is combined from all style.styl files and put to location root folder (like /en/style.css).


### Page data and configuration - data.yaml

To pass data to index.jade use __data.yaml__ file. This data is passed to index.jade in object named _D_ (To get property _text_ from data.yaml use _D.text_ in index.jade).

This file can also contain page configuration info. All page parameters must be inside _page_ property. This info is also passed to index.jade in _page_ object.

Some page parameters will change how HTML is generated. Those are:
- __page.path__  
  If set, it will override folder based path.
- __page.aliases__  
  List of path aliases. Will make redirekt urls to original path.
- __page.redirect__  
  Path or url to redirect (if user visits this page).

__NB!__ Parameters _page.aliases_, _page.redirect_ will not work yet.

You can put locale identificator to filename (like data.en.yaml) for locale speciffic content. Other locales _page_ object is accessible via _page.otherLocales_ object.

##### Example page data.yaml:
    page:
      title: Test page
      path: /testpage1
      aliases:
        - /test
        - /test123
      redirect: https://github.com
    someOtherData:
      - A
      - B


## On build ...

##### ... source folder like this ...

    - source
        |- _templates
        |   |- layout.jade
        |   +- mixins.jade
        |
        |- testpage1
        |   |- data.en.yaml
        |   |- data.et.yaml
        |   |- index.jade
        |   +- style.et.styl
        |
        |- testpage2
        |   |- index.en.jade
        |   |- index.et.jade
        |   |- data.yaml
        |   +- testpage2en
        |       |- index.en.jade
        |       +- data.en.yaml
        |
        |- index.jade
        +- style.styl

##### ... will be converted to build folder like this

    - build
        |- en
        |   |- index.html
        |   |- style.css
        |   |- testpage1
        |   |   +- index.html
        |   |
        |   +- testpage2
        |       |- index.html
        |       +- testpage2en
        |           +- index.html
        |
        +- et
            |- index.html
            |- style.css
            |- testpage1
            |   +- index.html
            |
            +- testpage2
                +- index.html
