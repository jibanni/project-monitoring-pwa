# PMS10 Executive Dashboard - Landscape PDF Export

## Scope

This change adds **Export Report** to the desktop Executive Dashboard without modifying the live mobile interface. The PDF uses the **currently selected area, program, funding years, and dashboard data source (SubayBAYAN Official / Actual On-Site)**. There are no database schema changes.

## PDF content

- **Landscape folio (330.2 × 215.9 mm)**, with the exact existing DILG and Bagong Pilipinas logo assets already used by the PMS10 Aide Memoire.
- **Page 1: Executive infographic** - filters, total projects, completed/total project completion %, cost-weighted financial %, high-risk count, implementation status distribution and NADAI cohort progress.
- **Page 2 onward: Province/LGU summary matrix** - Province/HUC, LGU, Number of Projects, Number of Barangays (distinct populated barangay names), Not Yet Started/Procurement, Ongoing Implementation, Completed, Other, and % Completion.
- **Project annex pages** - official project code, province/LGU, project title, barangay, implementation status, physical %, financial %, NADAI/fund-download date, and funds reversion.
- AutoTable automatically paginates and repeats the table heading on each continuation page.
- The filename contains the selected area, program, funding year(s) and generated date.

### Data semantics

- **Completed/Total** on the PDF matches the dashboard's completion-rate rule. A source record is counted as completed when `getPmsProjectStatus` classifies it as Completed.
- Financial accomplishment is **project-cost-weighted** using the same source field as the Executive Dashboard. Stored reverted funds are already accounted for when the authoritative financial accomplishment was imported from SubayBAYAN; they are displayed separately in the project annex.
- Not Yet Started includes Under Procurement. Other includes cancelled, suspended, terminated or unclassified projects.
- Missing NADAI dates, empty barangay names and unknown financial percentages are retained as missing data, not fabricated.
- Actual On-Site exports the subset of projects that the on-site dashboard considers observable; it does not replace official source values in Supabase.

## Test before merging to production

1. Desktop Executive Dashboard: choose Region X > SBDP > FY 2025 > SubayBAYAN Official. Click **Export Report**.
2. Verify cover KPIs match the dashboard. For the user-supplied sample, 27 completed of 47 should show 57.45% if those are the current records.
3. Check DILG and Bagong Pilipinas logos on every page and the readable landscape orientation.
4. Verify per-LGU matrix totals sum to the dashboard scope and the correct FY and program appear on the report.
5. Check project register for title, official code, NADAI download date and project rows with blank NADAI values.
6. Change area, year and program: export again and verify the scope changes without relying on prior exports.
7. Switch to Actual On-Site: export again, verify data source changes and the project count follows the on-site dashboard.
8. Check desktop Chrome print preview for clipping/overlapping tables; check export with a large dataset (>100 projects) to verify automatic pagination.
9. Confirm mobile dashboard/navigation remains visually unchanged: Export Report control is hidden below 1024px.

**Deployment status:** Feature branch only. Production is not changed until an explicit release.

## November 12 PDF layout and Executive Director improvements

- Moved **Export Report** from the FY filter row to the desktop header beside the dashboard's title/date; hidden on mobile.
- Executive cover: project implementation status is a true vector pie with category counts; each NADAI cohort is a **double-donut** (physical completion outer green ring, financial cost-weighted inner blue ring).
- Immediately after the cover, add the **Province / Highly Urbanized City Performance Overview**. Up to eight areas per landscape page; each area shows its completed/total ratio, completion donut, financial accomplishment and High Risk count. Rank by completed/total so leaders and lagging areas are visible at a glance. A location scoped to only one province does not waste a page on a redundant comparison.
- LGU matrix merges the Province/HUC column vertically when a group has at most six LGUs. Larger groups use a single merged province section heading (spanning all columns) to keep long groups breakable across pages.
- Critical blank-page fix: switched AutoTable callbacks from `didDrawPage` (which repainted the page background over table rows) to `willDrawPage`. The new order renders background, logos and scope first, then the table content. Each page repeats column headers.
- Zero-project filter scopes export only the executive cover, not empty matrix and annex pages.

### Acceptance checks for PDF rendering

1. Compare the Executive Dashboard with PDF cover for Region X / SBDP / FY 2025: 47 projects, 27 Completed, 5 Ongoing, 15 Not Started, 57.45% completion, as long as live masterlist is unchanged.
2. Check status pie legend counts sum to the total; ensure NADAI 2025 (46 projects) and NADAI 2026 (1 project) double donuts match dashboard completion/financial numbers.
3. Verify Province Performance Overview is near the front and cards can be compared without flipping to the LGU matrix. Review allocations for Bukidnon, Misamis Occidental and Misamis Oriental.
4. Verify every matrix province label is shown only once within a small group, including 2-5 LGUs. Check no row or column disappears on page breaks.
5. Verify project annex rows and header appear together on every continuation page—no completely blank pages below a fully drawn DILG header.
6. Verify a zero-project filter selection yields one landscape cover page only.
7. Confirm the new compact export button fits left under the Executive Dashboard date on desktop, while mobile layout/navigation remains unchanged.

**Validation status:** TypeScript/Vite build confirmed on Vercel preview. Signed-in PDF browser render and printed pages require operator review before production promotion.
