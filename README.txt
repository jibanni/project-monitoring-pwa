PMS10 Revert Before Disable Zoom

This rollback returns the app to the state before the request:
"make sure that the app cannot be zoomed except for the map leaflet"

It reverts:
- Disable app zoom patch
- Wrong/cleanup import changes related to disableAppZoomExceptMap
- Later GIS banner/card-order patches that happened after that request

It restores from existing local backups created by the previous patch scripts:
- index.html.disable-app-zoom-except-map.bak
- src/main.tsx.disable-app-zoom-except-map.bak
- src/styles/layout.css.disable-app-zoom-except-map.bak
- src/pages/ProjectMap.tsx.map-banner-marker-visibility-fix.bak
- src/styles/projectMap.css.map-banner-marker-visibility-fix.bak

It also removes:
- src/utils/disableAppZoomExceptMap.ts

Apply:

cd ~/Downloads
unzip -o pms10_revert_before_disable_zoom.zip

cd ~/project-monitoring-pwa
rsync -av "$HOME/Downloads/pms10_revert_before_disable_zoom/" ./

node scripts/revert-before-disable-zoom.cjs

npm run build
npm run dev -- --host 0.0.0.0

Test:
1. App banner/header should return to the state before the zoom-lock request.
2. GIS banner/cards should return to the previously working layout.
3. Map popup/marker behavior should retain the state before the zoom request.

After testing, push only if okay:

git status
git add .
git commit -m "Revert zoom lock and restore GIS layout"
git push origin main
