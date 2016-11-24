#!/bin/bash

rm -rf releases
electron-packager ./ --platform=mas,win32,linux --arch=x64 --out=releases --overwrite --prune --asar

cd releases/Entu\ CMS-mas-x64
electron-installer-dmg --overwrite --out=./ Entu\ CMS.app Entu\ CMS
mv Entu\ CMS.dmg ../Entu-CMS-osx.dmg
cd ../..

cd releases/Entu\ CMS-win32-x64
zip -q -r ../Entu-CMS-win.zip ./ -x .DS_Store
cd ../..

cd releases/Entu\ CMS-linux-x64
zip -q -r ../Entu-CMS-linux.zip ./ -x .DS_Store
cd ../..

open releases/
