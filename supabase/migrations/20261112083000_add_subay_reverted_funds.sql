-- PMS10: preserve officially reported reverted funds separately from disbursements.
-- Non-destructive schema addition. Does NOT touch engineer inspection history.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS reverted_funds numeric(18,2);

COMMENT ON COLUMN public.projects.reverted_funds IS
  'Official SubayBAYAN amount reverted to the National Treasury. This is NOT a disbursement. A NULL value indicates the source extract did not report it.';

-- Existing imports are not reclassified automatically. Reimport the latest
-- SubayBAYAN masterlist after applying this migration to populate the field.
