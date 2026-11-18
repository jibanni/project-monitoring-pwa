# Remember the desktop RPMES comparison view

The RPMES Comparison page opens with **Select year** in a fresh PMS10 workspace. The comparison and single-workbook import stay disabled until a reporting year is selected. Manage RPMES Links can still be opened independently.

When switching to another PMS10 section and back, the signed-in workspace remembers the reporting year, program, province, Differences only setting, and already loaded RPMES workbook results. Returning to the page does not fetch those workbooks again. Use Refresh to read their latest data. The view resets on a full reload or a new sign-in. Workbook URLs still have the existing browser-local storage behavior.

This patch is based on main commit `267fb56`. The page remains desktop-only, and mobile navigation and permissions are unchanged. No database migration is needed.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-RPMES-Remember-View.zip" -d .
node --test tests/*.test.mjs
npm run build
```
