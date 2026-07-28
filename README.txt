PMS10 SGLGIF Minimal Needed Fields Import Fix

This is a correction to the SGLGIF Portal import support.

Your clarification:
The app should NOT adjust itself to all columns in the SGLGIF extracted file.
It should only get the data PMS10 needs.

This fix makes SGLGIF import use only:

- LGU Reference Code
  Used only to generate a stable import/update key. It is not treated as a project field.
- Year
  PMS10 funding_year
- Region
  PMS10 region/reference only
- Province
  PMS10 province
- LGU
  PMS10 municipality/LGU
- Title
  PMS10 project_name
- Amount
  PMS10 budget/project cost
- Type
  PMS10 project_type
- Category
  PMS10 description/category
- Status
  PMS10 status

Ignored columns:
- Beneficiaries
- Level
- Subsidy
- Action

Accomplishment rule:
- Completed = physical_accomplishment 100 and financial_accomplishment 100
- Ongoing = physical_accomplishment blank/null and financial_accomplishment blank/null
- Completed/100% projects = Risk None

Apply:

cd ~/Downloads
unzip -o pms10_sglgif_minimal_needed_fields_import_fix.zip

cd ~/project-monitoring-pwa
rsync -av "$HOME/Downloads/pms10_sglgif_minimal_needed_fields_import_fix/" ./

node scripts/apply-sglgif-minimal-needed-fields-import-fix.cjs

npm run build
npm run dev -- --host 0.0.0.0

Test:
1. Go to the import page.
2. Upload Projects SGLGIF.xlsx.
3. Preview should show SGLGIF Portal Projects Extraction.
4. Completed rows should import as 100% physical/financial and Risk None.
5. Ongoing rows should import with blank physical/financial.
6. Beneficiaries, Level, Subsidy, and Action should not be imported into PMS10 fields.

Push live if okay:

git status
git add .
git commit -m "Refine SGLGIF import to needed fields only"
git push origin main

Rollback:
cp src/services/subayImportService.ts.sglgif-minimal-needed-fields.bak src/services/subayImportService.ts

npm run build
