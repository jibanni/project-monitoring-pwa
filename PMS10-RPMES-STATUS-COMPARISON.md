# PMS10 RPMES Comparison tab

The desktop sidebar opens **RPMES Comparison** just after **GIS Map**.
The old comparison panel is removed from **Reports**. The mobile navigation
and Reports page are unchanged. This update requires no database migration.

Open the tab, select a province or All, and click **Compare statuses**. The
FY 2025 SBDP pilot covers Misamis Oriental, Misamis Occidental and Bukidnon.
Each LGU has one row with side-by-side values from PMS SubayBAYAN and
RPMES Form 2 for projects, unique barangays, not yet started, ongoing, completed,
and percent completion. Highlighted cells disagree across the two sources.

Completion is completed projects divided by the total for that LGU and
source. Preparation, procurement and pre-implementation review count as not yet
started. Other and unknown statuses are kept in the total but not reassigned.
Blank barangays do not increase the unique count. Excel mirrors the LGU summary.

## Import a replacement RPMES link

Select **Import RPMES Link**, choose a province and paste a direct Google Sheets
workbook URL. PMS10 reads the named RPMES Form 2 tab rather than the URL's active
tab. It checks that project codes and province fit the FY 2025 SBDP pilot and
rejects duplicate codes. The worksheet must already be readable using its link.
A validated link replaces the default only for that province in the signed-in
user's current browser. No project records, sheet cells or sharing settings change.

## Apply

This full-file patch is based on main at `243a32f`. Check for local edits before
unpacking. If the project has no installed dependencies, run `npm ci` first.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-RPMES-Comparison-Tab.zip" -d .
node --test tests/rpmes-status-comparison.test.mjs
npm run build
```
