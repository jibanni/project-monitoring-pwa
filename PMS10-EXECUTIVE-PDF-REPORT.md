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

## Executive infographic and discrepancy-highlighting update (November 12)

- First-page KPIs are compressed into a short 24-mm strip. The two graph panels below consume the rest of the printable cover area: a larger, centered **Project Status pie** (with slice counts) and centered **NADAI Physical/Financial double-donuts**, with smaller legends like the desktop Executive Dashboard.
- The project annex no longer includes a Project Code column. It instead has **Province/HUC** and **LGU** as two independent columns, followed by Project Title, Barangay, Status, Physical %, Financial %, NADAI Download Date, and Reverted Funds.
- **Green-tinted project row** indicates a reported physical accomplishment of 100%. The physical percentage is bold green.
- **Financial percentage in red** is shown **only** when a project has reported 100% physical accomplishment and its reported financial percentage is below 100%. Unknown/blank financial data remains `-` and is never shown as an assumed zero.
- The annex header has a compact legend explaining the green row/red financial formatting.
- All changes concern the exported PDF only; no modifications to the dashboard UI, mobile layout, source records, or schema.

### Acceptance checks
1. For Region X > SBDP > FY 2025, confirm compact KPI cards and that pie/donuts are larger and centered, with legends unobstructed.
2. Confirm the table contains two separate geography columns, **Province/HUC** and **LGU**, and no Project Code.
3. Check three rows: physically 100% / financially 100% (green, no red); physically 100% / financially below 100% (green row and red financial text); physically below 100% / financially below 100% (neither the special green nor red treatment).
4. Confirm empty financial values display `-`, never a fabricated financial percentage.
5. Verify the report paginates on long project lists without clipping and that the header and table columns repeat.

**Validation:** Vercel TypeScript/Vite preview build passed. PDF download and print-render still need user-side verification in a signed-in browser.

## Official SubayBAYAN risk-cause recovery and chart legend fix (November 12, 2026)

**Why some projects showed "High risk: No negative slippage or contract-expiration basis recorded":**
The FY 2025+ SubayBAYAN Excel extraction has **CL SLIPPAGE** (column 89), **CM RISK LEVEL** (column 90), and **CP REMARKS** (column 93), each potentially containing multiple component-level values (`1). -50.00`, `2). -45.00`, etc.). PMS10 imported the combined CM risk classification but did **not** persist CL or CP in the `projects` table. Legacy `projects.slippage` was often 0 and contract dates absent. This caused an unsupported claim of "no negative slippage."

Read-only verification against production Supabase (November 12):
- **24** officially High Risk, incomplete project records checked;
- **19** have archived negative CL slippage; **5** do not;
- **1** includes substantive official CP remarks;
- **24 of 24** had previously retained High risk labels but no usable negative numeric `projects.slippage` or contract expiration date.
- **1,129** project records can be linked to archived original FY 2024- or FY 2025+ source rows for recovery (the archive is Admin-only).

**Fix:**
- Center the Status pie legend as a compact **2 × 2 grid directly below the chart**.
- Preserve three dedicated **official-only** project fields: `subay_source_slippage_raw`, `subay_source_risk_details_raw`, and `subay_source_remarks_raw`.
- On future imports, write the original CL/CM/CP texts to these dedicated fields; do not substitute engineer inspection values or flatten multiple component slippages into one project variance.
- Migration `20261112160000_preserve_subay_official_risk_evidence.sql` backfills these fields directly from the existing protected `subay_import_source_rows` archive, **without reimporting Excel or changing risk classifications and site updates**.
- The PDF describes negative component-level slippage and actual source remarks (plus official original/revised contract expiry if present). It explicitly reports **"Specific cause not stated in official source fields"** when SubayBAYAN marks High Risk with no available negative slippage, substantive CP remark, or contract basis.
- No queries to `project_updates` or engineer-entered issues/remarks. **Official** and **Actual On-Site** report modes both use the original official record for risk evidence.

**Release order:** Apply the database migration **before** promoting this GitHub branch to production. Until then, preview exports may report that detailed source evidence has not yet been synchronized. This migration modifies only the project metadata and leaves engineer inspection history, current risk labels, and physical/financial accomplishment unchanged.

### Report acceptance checks
1. For Region X / SBDP / FY 2026, inspect a PDF at full page width: status legend centered beneath the pie; pies and donuts readable.
2. For an archived official High Risk record with negative CL values, verify the PDF displays component slippages, such as `Component 1: -50.00 pp`.
3. For a High Risk record whose official CL slippage is 0 and whose CP remark is blank, verify a clearly qualified source classification without inventing a cause.
4. For a record with a substantive CP remark, verify that remark appears and **no engineer inspection notes** appear.
5. Confirm existing "Reverted Funds / Remarks" amounts, green 100% physical highlighting, and red financial mismatch highlighting remain unchanged.
6. Test both SubayBAYAN Official and Actual On-Site dashboard views; official risk context should match across views.
7. Confirm the existing mobile interface and navigation have not changed.

**Validation status:** Vercel TypeScript/Vite development build passed. Production migration and signed-in PDF visual QA are pending.
