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
