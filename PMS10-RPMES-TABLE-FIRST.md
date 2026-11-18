# Compact desktop RPMES Comparison

This desktop-only patch prioritizes the comparison table. It puts filters and smaller actions on one toolbar, replaces the KPI cards with inline totals, and removes the nested toolbar surfaces. The table uses compact rows, a scrolling column header, grouped province labels, and a small two-source highlight for each differing value. The status totals sit in a compact section below the comparison.

Admin access, saved workbook links, comparison calculations, Excel export, and the mobile interface are unchanged. No migration is needed. This full-file patch is based on main commit `92e51ae`.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-RPMES-Table-First.zip" -d .
npm run build
```
