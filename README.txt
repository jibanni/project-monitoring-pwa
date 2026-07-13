PMS10 Runtime Hero Logic Final Patch

This all-in-one patch applies the requested UI and display logic fixes.

Fixes included:
1. Project Update hero bubbles
- Smaller bubbles.
- No duplicated outer bubble.
- Uses Project Details-style bubble behavior, but with Project Update hero height.

2. Project Details hero
- Auto-fits long project titles so the full title can show with smaller font.
- Keeps the Project Details hero readable.

3. Completed project risk logic display
- If a card/hero shows Completed or 100%, visible High/Medium/Low/Critical risk is changed to None.

4. Risk / percent colors
- Risk values and percentage/variance values receive tone colors.

5. Province / LGU / Barangay title case
- Visible all-caps location text such as BUKIDNON and CABANGLASAN becomes Bukidnon and Cabanglasan.
- Does not change database values.

Apply:

cd ~/Downloads
unzip -o pms10_runtime_hero_logic_final_patch.zip

cd ~/project-monitoring-pwa
rsync -av "$HOME/Downloads/pms10_runtime_hero_logic_final_patch/" ./

node scripts/apply-pms10-runtime-hero-logic-final-patch.cjs

npm run build
npm run dev -- --host 0.0.0.0

Test:
- Project Update page: bubbles should be smaller and no duplicated outer bubble.
- Project Details page: long title should auto-fit smaller.
- Completed projects should not show High risk; they should show None.
- Edit Project page risk/percent values should have color.
- Locations should show Title Case instead of ALL CAPS.

Push live if okay:

git status
git add .
git commit -m "Fix hero bubbles titles risk and location display"
git push origin main

Rollback:
cp src/styles/layout.css.runtime-hero-logic-final.bak src/styles/layout.css
cp src/main.tsx.runtime-hero-logic-final.bak src/main.tsx

If src/utils/pms10RuntimeHeroLogicFix.ts did not exist before:
rm src/utils/pms10RuntimeHeroLogicFix.ts

npm run build
