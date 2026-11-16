# PMS10 FY 2025 SBDP RPMES status comparison

Apply this full-file patch on top of PMS10 main at `7f56d18` or review the
diff against any newer main before applying it there. The feature is under
**Reports → RPMES vs SubayBAYAN Project Status** on desktop. Mobile is unchanged.
It does not need a database migration.

## Data and matching

- The three pilot workbooks are read on demand from Google Sheets, using the
  named `RPMES Form 2` tab. The feature reads the calculated status in AB and
  uses the project code in A, province in C, LGU in D, and project title in F.
- PMS10 uses authorized official project rows and their stored SubayBAYAN
  code, status, and physical accomplishment. It does not use Actual On-Site
  snapshots or write to the official or RPMES records. Offline/cached PMS10
  values are labeled. Failed Google Sheets requests do not create false
  missing-project flags for those provinces.
- Project codes are matched by province after trimming whitespace and
  normalizing case. Different codes and duplicates are not paired by name.
  The exception filter includes unresolved pre-implementation stage differences,
  exact status mismatches, progress-band mismatches, and missing/duplicate codes.
- SubayBAYAN's imported status may be more general than the RPMES status.
  Different pre-implementation stages are flagged for review. Ongoing ranges
  are compared to the numeric accomplishment when available, using 30%, 60%,
  etc. as upper bounds for their integer-labeled bands.
- The exported Excel file contains the currently selected results and a
  Sources worksheet. Its read timestamps are not the official reporting cutoff.

## Apply and verify

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-SBDP-2025-RPMES-Status-Comparison.zip" -d .
node --test tests/rpmes-status-comparison.test.mjs
npm run build
```

In an authorized desktop session, open Reports, select a province or All,
and click **Compare statuses**. Check **Exceptions only** and **Export Excel**.
If a workbook is no longer viewable by link, the comparison reports a read
error for that province. It does not request broader sharing permissions.
