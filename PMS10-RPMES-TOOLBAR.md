# RPMES Comparison toolbar

The desktop comparison page keeps its filters and primary compare/refresh action on the first row. Import, link management and Excel export have matching icons and are grouped in a separate workbook row. Linked-province coverage is shown as a chip. Keyboard focus, the open state of each panel and disabled actions remain visible.

This is a UI-only patch based on main commit `f60edbe`. It does not change saved links, workbook imports, comparison results, or the mobile interface. No database migration is needed.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-RPMES-Toolbar.zip" -d .
npm run build
```
