PMS10 SubayBAYAN Import Feature Package

This package adds:

1. Admin-only SubayBAYAN Import page
2. XLS/XLSX parser using the existing xlsx dependency
3. Preview before import
4. Duplicate prevention using SubayBAYAN PROJECT CODE
5. Update/overwrite existing project master data by PROJECT CODE
6. Link matching manual projects using Funding Year + Program + Province + Municipality + Project Title
7. Create new projects when no match exists
8. Preserve existing PMS10 inspection updates, photos, Google Drive photos, and update history
9. Project title case normalization
10. Subay Code + copy button in Project Details only

IMPORTANT DATABASE STEP FIRST

Before building the app, apply the database migration so the projects table has the internal SubayBAYAN code field.

Option A - Supabase CLI:

cd ~/project-monitoring-pwa
npx supabase db push

Option B - Supabase SQL Editor:

Run this SQL:

alter table public.projects
  add column if not exists subaybayan_project_code text;

create unique index if not exists projects_subaybayan_project_code_unique
  on public.projects (subaybayan_project_code)
  where subaybayan_project_code is not null
    and btrim(subaybayan_project_code) <> '';

APPLY FILES

cd ~/Downloads
unzip -o pms10_subaybayan_import_feature.zip

cd ~/project-monitoring-pwa
rsync -av "$HOME/Downloads/pms10_subaybayan_import_feature/" ./

npm run build
npm run dev -- --host 0.0.0.0

HOW TO TEST

1. Log in as Admin.
2. Go to Project Registry.
3. Tap/click the green import floating button.
4. Upload one SubayBAYAN XLS/XLSX file.
5. Review preview:
   - Create New
   - Update Existing
   - Link Manual Record
   - Invalid Row
6. Click Confirm Import.
7. Open Project Details and check the Subay Code + copy icon.

NOTES

- Engineers and Viewers cannot access the import page.
- The Subay Code is shown only in Project Details, not on project cards.
- Existing field inspection updates and photos are not deleted.
- The importer reads PROJECT CODE as the primary matching key.
- If PROJECT CODE is not yet found in PMS10, it checks manual projects using a fingerprint:
  Funding Year + Funding Source/Program + Province + Municipality + Project Title.
