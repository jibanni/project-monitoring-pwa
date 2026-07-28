PMS10 PROJECT MASTERLIST IMPORT

Supported XLS/XLSX layouts:

1. SubayBAYAN FY 2024 and below
2. SubayBAYAN FY 2025 and above
3. SGLGIF Portal Projects Extraction

The two existing SubayBAYAN formats remain supported. The SGLGIF layout is an additional third parser profile.

SGLGIF FIELD MAPPING

- LGU Reference Code: used with year, LGU, and title to create a stable import code
- Year: funding_year
- Region: detection/source reference
- Province: province
- LGU: municipality
- Title: project_name
- Amount: budget
- Type: project_type
- Category: description
- Status: project status
- Program/Funding Source: always SGLGIF

SGLGIF STATUS RULES

- Completed: status Completed, physical accomplishment 100, financial accomplishment 100, risk None
- Ongoing/non-completed: portal status is retained; physical and financial accomplishment remain blank until an actual PMS10 update is encoded

MANUAL PROJECT CREATION

SGLGIF is available in both Create Project and Edit Project funding-source dropdowns. Program aliases such as SGLG-IF and Seal of Good Local Governance Incentive Fund normalize to SGLGIF.

DATABASE NOTE

The existing subaybayan_project_code text column is also used internally as the stable import-code field. No new database column is required when the SubayBAYAN importer migration has already been applied.
