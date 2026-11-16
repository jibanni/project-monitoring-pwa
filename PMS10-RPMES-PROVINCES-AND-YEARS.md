# PMS10 RPMES reporting years and provinces

- Desktop RPMES Comparison offers regular SBDP and SBDP-UA for 2024 through 2027.
- All five Region X provinces can be selected, even before they have projects.
  Existing project access restrictions still apply.
- The three default FY 2025 links remain available, and previously imported
  browser links are carried over into regular SBDP 2025.
- Each new RPMES workbook link is saved separately for the selected province,
  reporting year and funding type. An unlinked province is excluded from
  comparison counts, not shown as having zero projects. The imported workbook
  must have an RPMES Form 2 tab with matching province, year and SBDP project codes.
  UA workbooks must carry the UA designation in those codes.
- Only SubayBAYAN Official data is compared. Actual On-Site is excluded.
  The existing mobile UI and navigation remain unchanged.

Apply the ZIP on top of PMS10 main at `f3f2b08` or review its changes on a
newer checkout before overwriting files. No database migration is required.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-RPMES-Provinces-and-Years.zip" -d .
node --test tests/*.test.mjs
npm run build
```
