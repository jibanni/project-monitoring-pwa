# PMS10 — SubayBAYAN official versus Actual On-Site separation (November 12, 2026)

## Scope
- SubayBAYAN masterlist imports are authoritative for official status, physical progress, disbursement, financial progress, official project cost, risk, and NADAI.
- Engineers' records remain separately in `project_updates`. Online saves, offline saves, and offline synchronization no longer overwrite official project status/progress/financial/risk values.
- Desktop dashboard has two sources: **SubayBAYAN Official** (default) and **Actual On-Site**. The latter uses only projects with saved inspection progress and the latest `project_updates` per project.
- Current live mobile layout and navigation are unchanged. The new data-source selector is desktop-only.
- The Project Details page no longer mixes on-site financial values into the official percentage.
- SubayBAYAN import project matching pages through all projects (not just the first 1,000).
- The designated NADAI column is authoritative; unrelated 'Yes' strings do not fabricate NADAI dates.
- Source-linked projects show imported status and risk rather than silently overriding them using local calculations.
- Editing source-controlled SubayBAYAN projects through manual Edit Project is blocked; submit on-site observations through Project Updates.

## Important assumptions and limitations
- **Nothing in this branch is live.** This branch is for review and testing before merging.
- The browser currently reads SubayBAYAN Excel extracts; it does NOT automatically synchronize the public website.
- The app must be reimported from an approved current SubayBAYAN masterlist after deployment to correct previously overwritten master fields. Reimport does not delete engineer inspection records.
- A blank official disbursement is stored as null (unknown), not replaced by an engineer figure.
- For on-site historical updates, status is inferred from their physical progress (0=not yet started, 1–99.99=ongoing, 100=completed), because the existing `project_updates` schema does not store an independently reported status. This cannot distinguish site-reported suspended/terminated/cancelled cases and will be corrected in a later schema phase.
- Actual on-site financial progress uses the percentage stored in `project_updates`, not a second live bank transaction ledger.
- Existing field-entered contract modifications in `projects` are not erased during import, to avoid losing potentially unarchived engineer records; the imported budget is used for official project cost. Official contract amendment comparisons require a dedicated subsequent schema migration.
- The dashboard does not automatically refresh already-open sessions when a different user saves an inspection; navigate/reload to refresh.
- No production schema migration is included in this first separation phase.
- No live Supabase dataset or source Excel was available here, so no numerical reconciliation or runnable build was performed. Validate with a real masterlist and staging database before deploying.

## Validation checklist
1. Back up Supabase `projects`, `project_updates`, and source archive tables before importing.
2. `npm ci && npm run build` locally on this branch.
3. Open dashboard on desktop: Official selected by default; inspect FY 2025 SBDP group with official source XLSX.
4. Select Actual On-Site: verify each card reflects the latest engineer inspection; projects without inspections are excluded, and counts are explained.
5. Save an online engineer inspection and refresh: official project master metrics must remain unchanged; on-site dashboard must change.
6. Save an offline inspection, then synchronize: official metrics remain unchanged; on-site dashboard updates after reload.
7. Reimport the same source extract twice: no new duplicates; Subay code keyed existing records and inspector history survives.
8. Import an updated official extract: official metrics reflect it; site values remain unchanged.
9. Check FY 2024 direct NADAI dates, FY 2025+ `HAS NADAI?` date, explicit No, and blank values.
10. Verify dashboard physical/financial cost weighting and completion/risk rules against source workbook using independently calculated control totals.
11. Check live mobile appearance and navigation have no layout changes.
12. Do not merge/deploy until validation succeeds.

## Next phase (not implemented here)
- Side-by-side official versus latest actual-on-site project details, explicit mismatches, source timestamps, inspection chronology, and a planning→procurement→implementation→completion chronological tree.
- A permanent source-audit schema and official import ordering, plus field status and contract variation persistence without any ambiguity.
