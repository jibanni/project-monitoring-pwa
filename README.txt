PMS10 Compact Modern Hero Trial

This package tries the safer version of the modern hero improvement.

It does NOT touch:
- src/components/Layout.tsx
- src/styles/layout.css
- header merge logic
- mobile navbar
- dashboard/project logic

It only adjusts:
- src/styles/dashboard.css
- src/styles/projects.css

Changes:
- Makes Dashboard hero more compact.
- Makes Project Registry hero more compact.
- Keeps the blue official identity.
- Keeps the original merge/sticky behavior.
- Makes mobile hero shorter so dashboard data appears sooner.
- Keeps desktop professional but less poster-like.

Apply:

cd ~/Downloads
unzip -o pms10_compact_modern_hero_trial.zip

cd ~/project-monitoring-pwa
rsync -av "$HOME/Downloads/pms10_compact_modern_hero_trial/" ./

node scripts/apply-compact-modern-hero-trial.cjs

npm run build
npm run dev -- --host 0.0.0.0

Then refresh phone/browser.

Rollback if needed:

cp src/styles/dashboard.css.compact-modern-hero.bak src/styles/dashboard.css
cp src/styles/projects.css.compact-modern-hero.bak src/styles/projects.css

npm run build
npm run dev -- --host 0.0.0.0

No Edge Function redeploy is needed.
