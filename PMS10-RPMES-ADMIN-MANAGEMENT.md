# Admin-only RPMES link manager

Only approved, active PMS10 administrators can open the desktop **Manage RPMES Links** panel or save changes through it. Other signed-in users retain their existing access to comparisons, Excel export, and the separate **Import RPMES Link** action. That single-link import affects only their own browser. No database migration or mobile change is needed.

This full-file patch is based on main commit `7085331`.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-RPMES-Admin-Only.zip" -d .
npm run build
```
