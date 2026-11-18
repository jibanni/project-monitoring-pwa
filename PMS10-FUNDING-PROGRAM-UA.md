# PMS10 regular and UA funding programs

- Dashboard, Executive Dashboard, Projects, Reports and GIS Map keep regular and UA separate. Combine the Program and Funding Year filters to review a specific set, such as FY 2026 GEF-UA. Existing general totals still include both variants when no program filter is applied.
- The create/edit forms offer UA for every named standard program. The project details and reports show the resulting program label. Older linked projects are classified from an explicit funding label or the UA token in their official project code. If neither identifies UA, PMS10 does not infer it.
- The SubayBAYAN importer preserves the funding type in the existing funding source field. Matching by existing official code is unchanged. The fallback title/location/funding fingerprint distinguishes regular from UA.
- Desktop RPMES Comparison uses the selected program, fiscal year, regular/UA and province. It still compares SubayBAYAN Official only. Standard RPMES Form 2 worksheets using the existing layout may contain both regular and UA rows for one program, year and province. Select each variant and link the same sheet for both if needed. The project codes must identify the program and year. UA RPMES rows must also carry a UA code marker.
- Existing SBDP links remain valid. New links are stored per program, year, funding type and province in the browser. A missing or invalid workbook is not counted as zero projects.
- No database migration, bulk record rewrite, GPS change or mobile layout change is required.

## Apply the patch

This full-file patch is based on main commit `7ea8a54`. If any of the affected files have changed since that commit, review and merge them before replacing them.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-Funding-Program-UA.zip" -d .
node --test tests/*.test.mjs
npm run build
```
