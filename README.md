# Entu Static Site Generator

## Benefits

- Simple Pug (former Jade), Markdown, Yaml static site generator.
- Generate static HTML files from [Pug](https://pugjs.org) templates or [Markdown](https://en.wikipedia.org/wiki/Markdown).
- Pass data to templates with [Yaml](http://yaml.org) files.
- Use locale identificator in filenames to generate locale specific content and paths.
- Generate site CSS from [Stylus](http://stylus-lang.com) files.
- Use Your favorite tools/editors.
- Host it on Your own server, on [Netlify](https://www.netlify.com), on [S3](https://aws.amazon.com/s3/), on ...


## Installation and usage

Download [latest build](https://github.com/entu/entu-ssg/releases/latest) and run:
```shell
$ npm run build /path-to-my-page/entu-ssg-config.yaml
```

If source folder is Git repository Entu SSG runs incremental build (based on Git changes since last commit). To run full build use **full** as second parameter:
```shell
$ npm run build /path-to-my-page/entu-ssg-config.yaml full
```

### Local development

MacOS and Windows GUI for local development are downloadable from [github.com/entu/ssg-app](https://github.com/entu/ssg-app/releases/latest). Or run (for full build use **full** as second parameter):
```shell
$ npm run serve /path-to-my-page/entu-ssg-config.yaml
```

## Configuration

Sites build process is configurable by Yaml file and its path must be first argument for entu-ssg.js. Required parameters are:

- __locales__ - List of locale folders to generate. You can put locale identificator to filename (like index.en.pug or data.et.yaml) for locale specific content.
- __defaultLocale__ - If set, page paths in this locale will not get locale prefix (_/en/about_ will be just _/about_).
- __source__ - Folder with source files (realtive to build config.yaml).
- __js__ - Folder with source JavaScript files (realtive to build config.yaml). Files will be combined to _script.js_ file in build folder.
- __styl__ - Folder with Stylus files (realtive to build config.yaml). Files will be converted and combined to _style.css_ file in build folder.
- __build__ - Folder to put generated HTML (realtive to build config.yaml).
- __assets__ - Folder with static assets (JS, images, ...).
- __protectedFromCleanup__ - List of paths what is not deleted if _build.sh_ is ran with _cleanup_ parameter. Relative to _build_ path.
- __server.port__ - What port to use for serving on localhost.
- __server.assets__ - Serving page in localhost will map this url to folder specified in _assets_ parameter.
- __dev.aliases__ - Build pages aliases.
- __dev.paths__ - List of (source) paths to build. Relative to _source_ path.
- __dev.ignorePaths__ - List of (source) paths to ignore on build. Relative to _source_ path.

### Example build configuration file:

```yaml
locales:
  - en
  - et
source: ./source
js: ./source/_scripts
styl: ./source/_styles
build: ./build
assets: ./assets
protectedFromCleanup:
  - assets
  - index.html
server:
  port: 4000
  assets: /assets/
dev:
  aliases: true
  paths:
    - test/page1
    - test/page2
  ignorePaths:
    - test/page3
```


## Page template and content

### Page template - index.pug

Page is generated from __index.pug__ file. All other .pug files are ignored, but You can use those files for [include](https://pugjs.org/language/includes.html)/[extends](https://pugjs.org/language/inheritance.html). You can put locale identificator to filename (like index.en.pug) for locale specific content.

### Page content - data.yaml

To pass content and configuration to index.pug use __data.yaml__ file. This data is passed to index.pug in object named _self_ (To get property _text_ from data.yaml use _self.text_ in index.pug).

You can put locale identificator to filename (like data.en.yaml) for locale specific content. This way You can use index.pug as a template and pass all locale specific texts from "data" files.

Some page parameters will change how HTML is generated. Those are:
- __disabled__ - If true, page will not be generated nor loaded to _self.otherLocalePaths_ object.
- __path__ - If set, it will override folder based path.
- __aliases__ - List of path aliases. Will make redirekt urls to original path.
- __data__ - Files to load data from. This data is passed to index.pug in object named _self.data_. You can use relative path (./ or ../). If used, it's relative to _data.yaml_ file. Root (/) path is Your source folder (set in _config.yaml_).

Some additional parameters are passed to template in _self_ object. Those are:
- __locale__ - Page's locale.
- __defaultLocale__ - Default locale from config Yaml file.
- __path__ - Page's path. If alias is generated, then this is page's path and not alias.
- __alias__ - Returns true if page is alias.
- __otherLocalePaths__ - Object of links to same page in other locales.
- __md__ - Function to render [Markdown](https://en.wikipedia.org/wiki/Markdown). Expects string as input.
- __env__ - Object of environment parameters.

### Example page data.yaml:

```yaml
path: /testpage1
aliases:
  - /test
  - /test123
data:
  news: ./datafiles/news.yaml
someOtherData:
  - A
  - B
```

### Global content - global.yaml

To pass same content to all index.pug files use __global.yaml__ file. This data is passed to index.pug in object named _self_ (To get property _footer_ from global.yaml use _self.footer_ in index.pug). Data what is set in pages's own data.yaml will expand/overwrite global.yaml.

You can put locale identificator to filename (like global.en.yaml) for locale specific content.

## Page CSS and JS

### Page inline style - style.styl

For inserting inline CSS to individual pages use __style.styl__ file in page's folder. Generated style is inserted just before `</head>` tag.

You can put locale identificator to filename (like __style.en.styl__) for locale specific style.

### Page inline scripts - script.js

For inserting inline JS to individual pages use __.js__ file in page's folder. Generated script is inserted just before `</body>` tag.

You can put locale identificator to filename (like script.en.js) for locale specific script.

## On build ...

### ... source folder like this ...

```
- source
    |- _scripts
    |   |- somescript.js
    |   +- somescript2.js
    |
    |- _styles
    |   +- style.styl
    |
    |- _templates
    |   |- layout.pug
    |   +- mixins.pug
    |
    |- testpage1
    |   |- data.en.yaml
    |   |- data.et.yaml
    |   +- index.pug
    |
    |- testpage2
    |   |- data.yaml
    |   |- index.en.pug
    |   |- index.et.pug
    |   |- style.styl
    |   |
    |   +- testpage2en
    |       |- data.en.yaml
    |       |- index.en.pug
    |       +- script.en.js
    |
    |- data.yaml
    |- global.yaml
    +- index.pug
```

### ... will be converted to build folder like this

```
- build
    |- en
    |   |- index.html
    |   |- testpage1
    |   |   +- index.html
    |   |
    |   +- testpage2
    |       |- index.html
    |       +- testpage2en
    |           +- index.html
    |
    |- et
    |   |- index.html
    |   |- testpage1
    |   |   +- index.html
    |   |
    |   +- testpage2
    |       +- index.html
    |
    |- script.js
    |- script.js.map
    |- style.css
    +- style.css.map
```
