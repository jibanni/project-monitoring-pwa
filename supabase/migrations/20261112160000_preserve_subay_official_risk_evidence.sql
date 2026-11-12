-- PMS10: preserve risk evidence from the official SubayBAYAN extraction.
-- Source-only fields, independent from engineer project_updates.
-- This migration is non-destructive and does NOT change project risk levels,
-- accomplishments, existing slippage values, or inspection histories.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS subay_source_slippage_raw text,
  ADD COLUMN IF NOT EXISTS subay_source_risk_details_raw text,
  ADD COLUMN IF NOT EXISTS subay_source_remarks_raw text;

COMMENT ON COLUMN public.projects.subay_source_slippage_raw IS
  'Official imported SubayBAYAN CL SLIPPAGE text (FY 2025+). May contain multiple numbered project-component slippages; do not interpret as a single engineering variance.';
COMMENT ON COLUMN public.projects.subay_source_risk_details_raw IS
  'Official imported SubayBAYAN CM RISK LEVEL text (FY 2025+), retaining component-level entries.';
COMMENT ON COLUMN public.projects.subay_source_remarks_raw IS
  'Official imported SubayBAYAN CP REMARKS (FY 2025+) or S REMARKS (FY 2024 and below), kept separate from engineer inspection remarks.';

-- Restore official source fields from preserved Admin-only import snapshots,
-- so there is NO need to upload or import the same masterlist again.
-- Save only limited risk-evidence strings into the existing authorized projects
-- table. Raw source_data remains protected by its original Admin-only RLS.
WITH latest_source AS (
  SELECT DISTINCT ON (project_code)
    project_code, source_format, source_data
  FROM public.subay_import_source_rows
  WHERE project_code IS NOT NULL AND project_code <> ''
    AND source_format IN ('fy2025_above', 'fy2024_below')
  ORDER BY project_code, created_at DESC, id DESC
)
UPDATE public.projects AS project
SET
  subay_source_slippage_raw =
    CASE WHEN source.source_format = 'fy2025_above'
      THEN NULLIF(BTRIM(source.source_data -> 'values' ->> 89), '')
      ELSE NULL
    END,
  subay_source_risk_details_raw =
    CASE WHEN source.source_format = 'fy2025_above'
      THEN NULLIF(BTRIM(source.source_data -> 'values' ->> 90), '')
      ELSE NULL
    END,
  subay_source_remarks_raw =
    CASE WHEN source.source_format = 'fy2025_above'
      THEN NULLIF(BTRIM(source.source_data -> 'values' ->> 93), '')
      ELSE NULLIF(BTRIM(source.source_data -> 'values' ->> 18), '')
    END
FROM latest_source AS source
WHERE project.subaybayan_project_code = source.project_code;

-- No changes to RLS policies: approved dashboard viewers continue to read
-- only the projects they are authorized to see.
