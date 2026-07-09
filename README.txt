PMS10 Layout desktopSidebarCollapsed reference fix

This fixes:

src/components/Layout.tsx:
Cannot find name 'desktopSidebarCollapsed'

Cause:
The sidebar artifact cleanup removed the state, but two old useEffect blocks still referenced desktopSidebarCollapsed.

Apply:

cd ~/Downloads
unzip -o pms10_layout_desktopsidebar_reference_fix.zip

cd ~/project-monitoring-pwa
rsync -av "$HOME/Downloads/pms10_layout_desktopsidebar_reference_fix/" ./

node scripts/fix-layout-desktopsidebar-reference.cjs

npm run build
npm run dev -- --host 0.0.0.0

Then hard refresh Chrome:
Command + Shift + R
