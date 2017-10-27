# Entu SSG

![Screenshot](https://ssg.entu.eu/screenshot.png)

## Benefits

- Simple Pug (Jade), Markdown, Yaml static site generator.
- Use Your favorite tools/editors.
- Generate static HTML files from [Pug](https://pugjs.org) templates or [Markdown](https://en.wikipedia.org/wiki/Markdown).
- Generate site CSS from [Stylus](http://stylus-lang.com) files.
- Pass data to templates with [Yaml](http://yaml.org) files.
- Use locale identificator in filenames to generate locale specific content.
- ...


## Installation and usage

Download [latest build](https://github.com/argoroots/entu-ssg/releases/latest), unzip and run. Choose config.yaml file and it will:

1. generate HTML/CSS files
2. start server on localhost
3. monitor source folder for changes and (re)generate necessary HTML/CSS.


### Configuration

Sites build process is configurable by Yaml file and its path must be first argument for entu-ssg.js. Required parameters are:

- __locales__
  List of locale folders to generate. You can put locale identificator to filename (like index.en.pug or data.et.yaml) for locale speciffic content.
- __source__
  Folder with source files (realtive to build config.yaml). Folders beginning with underscore are ignored.
- __build__
  Folder to put generated HTML (realtive to build config.yaml).
- __assets__
  Folder with static assets (JS, images, ...).
- __protectedFromCleanup__
  List of paths what is not deleted if _build.sh_ is ran with _cleanup_ parameter. Relative to _build_ path.
- __pug.basedir__
  Pug basedir for simpler include/extend.
- __server.port__
  What port to use for serving on localhost.
- __server.assets__
  Serving page in localhost will map this url to folder specified in _assets_ parameter.
- __dev.aliases__
  Build pages aliases.
- __dev.paths__
  List of (source) paths to build. Relative to _source_ path.

### Example build configuration file:

```
locales:
  - en
  - et
source: ./source
build: ./build
assets: ./assets
protectedFromCleanup:
  - assets
  - index.html
pugBasedir: ./source/_templates
server:
  port: 4000
  assets: /assets/
dev:
  aliases: true
  paths:
    - test/page1
    - test/page2
```


## Content

### Page content - index.pug

Page content is generated from __index.pug__ file. All other files are ignored, but You can use those files for Pug [include](https://pugjs.org/language/includes.html)/[extends](https://pugjs.org/language/inheritance.html). You can put locale identificator to filename (like index.en.pug) for locale speciffic content.

### Page style - style.styl

To generate page CSS use __style.styl__ file. You can put locale identificator to filename (like style.en.styl) for locale speciffic style.

Global, location based, style.css is combined from all style.styl files and put to location root folder (like /en/style.css).

### Page data and configuration - data.yaml

To pass data to index.pug use front matter (Yaml formated data beginning of Jaml file between two \-\-\- lines) or __data.yaml__ file. This data is passed to index.pug in object named _self_ (To get property _text_ from data.yaml use _self.text_ in index.pug).

You can put locale identificator to filename (like data.en.yaml) for locale speciffic content. Other locales _self_ object is accessible via _self.otherLocales_ object.

Some page parameters will change how HTML is generated. Those are:
- _disabled__
  If true, page will not be generated nor loaded to _self.otherLocales_ object.
- _path__
  If set, it will override folder based path.
- _aliases__
  List of path aliases. Will make redirekt urls to original path.
- _originalPath__
  Original path (if this page is generated to differnt path using _aliases_ parameter). Use this to redirect or for canonocal link.
- _file__
  Files to load data from. This data is passed to index.pug in object named _self.file_. You can put locale identificator to filename (like my_custom_list.en.yaml). You can use relative path (./ or ../). If used it's relative to source folder (set in _config.yaml_) and not this _data.yaml_ file

### Example page data.yaml:

```
path: /testpage1
aliases:
  - /test
  - /test123
file:
  news: ./datafiles/news.yaml
someOtherData:
  - A
  - B
```

## On build ...

### ... source folder like this ...

```
- source
    |- _templates
    |   |- layout.pug
    |   +- mixins.pug
    |
    |- testpage1
    |   |- data.en.yaml
    |   |- data.et.yaml
    |   |- index.pug
    |   +- style.et.styl
    |
    |- testpage2
    |   |- index.en.pug
    |   |- index.et.pug
    |   |- data.yaml
    |   +- testpage2en
    |       |- index.en.pug
    |       +- data.en.yaml
    |
    |- index.pug
    +- style.styl
```

### ... will be converted to build folder like this

```
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
```

[![npm version](https://badge.fury.io/js/entu-ssg.svg)](https://badge.fury.io/js/entu-ssg) [![Dependency Status](https://david-dm.org/argoroots/entu-ssg/status.svg)](https://david-dm.org/argoroots/entu-ssg) [![Codacy Badge](https://api.codacy.com/project/badge/grade/66531026074a471897b076fb91a74601)](https://www.codacy.com/app/argoroots/entu-ssg)
