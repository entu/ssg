#!/bin/bash

electron-packager ./ --platform=darwin,win32 --arch=x64 --out=releases --overwrite --prune --asar

cd releases/Entu\ CMS-darwin-x64
rm ../Entu-CMS-osx.zip
zip -q -r ../Entu-CMS-osx.zip Entu\ CMS.app -x .DS_Store
cd ../..

cd releases/Entu\ CMS-win32-x64
rm ../Entu-CMS-win.zip
zip -q -r ../Entu-CMS-win.zip ./ -x .DS_Store
cd ../..
