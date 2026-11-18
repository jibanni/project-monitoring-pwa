# Manage RPMES Links

In the desktop RPMES Comparison page, open **Manage RPMES Links**. Pick a reporting year and paste the Google Sheets workbook links into the SBDP or SBDP-UA column for each province. You can change years and continue entering links before selecting **Save links** once.

Saved links are specific to the signed-in account in the current browser. Existing links are available for editing. Clearing a field and saving removes that link. No link is preloaded by this update.

Saving checks the URL format but does not open the Google Sheet. PMS10 checks the workbook and the matching year, province, and funding variant on **Compare statuses**. The existing **Import RPMES Link** remains available for a single immediate import.

This is a full-file patch based on main commit `d357a0f`. No database migration is needed.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-RPMES-Link-Manager.zip" -d .
node --test tests/*.test.mjs
npm run build
```
