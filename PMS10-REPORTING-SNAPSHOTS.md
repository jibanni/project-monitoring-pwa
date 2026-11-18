# Reporting Snapshots and Variance Analysis

Open **Reports** on desktop as an approved, active admin and expand **Reporting Snapshots and Variance Analysis**. Choose a reporting month and, optionally, a program, funding year and province or city. **Save reporting snapshot** freezes the current SubayBAYAN Official records for that scope. The capture timestamp records when the data was saved, independently of the selected reporting month.

Select a saved snapshot and choose **Compare with latest**. PMS10 uses the same program, year and province or city as the snapshot. **Export variance to Excel** includes the full summary and all project-level variances, even if the on-screen list is filtered. **Not found in latest data** refers to the selected scope and does not mean cancelled.

Saved snapshots are immutable in the app and available across devices to approved, active admins. The database applies the existing Admin Security verification policy to snapshot creation. Actual On-Site, RPMES and mobile behavior are unchanged.

## Apply locally

This full-file patch is based on main commit `16cc8cd`. Production was deployed separately. Use the included migration for a compatible development database, not to reapply it to an already migrated production database.

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-Reporting-Snapshots.zip" -d .
node --test tests/*.test.mjs
npm run build
```
