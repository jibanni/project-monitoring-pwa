# PMS10 SubayBAYAN / Actual source separation

Base commit: `7c9cb53`. This patch is not a deployment.

- Desktop SubayBAYAN and RPMES use the same source-linked official project
  masterlist. RPMES does not query field observations, regardless of which
  dashboard source was selected most recently. Existing area-of-responsibility
  restrictions still apply.
- New field observations, status, accomplishments, risk, dates and inspection
  GPS stay in Project Updates and the offline queue until synced. The Actual
  dashboard reads synced updates. It does not substitute official progress or
  GPS when an inspection value is missing.
- GIS Map uses recorded inspection GPS for SubayBAYAN-linked projects whenever
  available and otherwise falls back to the saved project coordinates. The
  Project Details inspection history retains update dates and GPS. No changes
  to the phone navigation or RPMES desktop-only guard.
- The database migration removes the old inspection-insert trigger that
  copied the inspection date into the masterlist. It also preserves masterlist
  dates and coordinates when older signed-in clients still send the former
  metadata patch on linked projects. Previous project values are not erased or
  reconstructed. No reimport is required to enable the change.

## Apply and verify

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-SubayBAYAN-Actual-Isolation.zip" -d .
node --test tests/*.test.mjs
npm run build
```

Apply `supabase/migrations/20261116094429_pms10_isolate_field_observations.sql`
to the corresponding PMS10 database before deploying the frontend. Use the
normal Supabase migration process and check `supabase db push --dry-run` first
so no unrelated pending migrations are included.

On a test project, submit a field update with GPS and different progress from
the official extract. Check the new observation in Actual, Project Details and
GIS Map. Switch to SubayBAYAN and run RPMES with Actual last selected. Both
should continue to reflect the imported masterlist. Repeat with a queued offline
update, then sync. No production project records were changed when preparing
this patch.
