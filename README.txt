PMS10 Mobile Card Height + Remove Project Registry Summary Cards

This package does two things:

1. Mobile Dashboard:
   - Makes dashboard top cards shorter/cleaner.
   - Keeps the 2-column mobile card layout.
   - Keeps Low Risk and Medium Risk hidden on mobile if you already applied that previous fix.

2. Project Registry:
   - Removes/hides the top summary cards in Project Registry.
   - Keeps the project list.
   - Keeps search/filter/list records.

Files changed:
- src/styles/dashboard.css
- src/styles/projects.css

Apply:

cd ~/Downloads
unzip -o pms10_mobile_card_height_registry_summary_fix.zip

cd ~/project-monitoring-pwa
rsync -av "$HOME/Downloads/pms10_mobile_card_height_registry_summary_fix/" ./

node scripts/apply-mobile-card-height-registry-summary-fix.cjs

npm run build
npm run dev -- --host 0.0.0.0

Then refresh your phone browser.

Rollback if needed:

cp src/styles/dashboard.css.mobile-card-compact.bak src/styles/dashboard.css
cp src/styles/projects.css.registry-summary-removed.bak src/styles/projects.css

npm run build
npm run dev -- --host 0.0.0.0

No Edge Function redeploy is needed.
