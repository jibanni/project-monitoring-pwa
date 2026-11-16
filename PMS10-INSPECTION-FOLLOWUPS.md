# PMS10 Inspection Follow-ups — Bukidnon pilot

The Actual Follow-up Bell ZIP updates the existing Bukidnon pilot on PMS10
main at `67979f4`. It replaces the affected files only and does not require
another database migration if the pilot is already installed.

## What changes
- On the desktop Dashboard, a bell beside the S/A and E/D switches opens the
  tracker in both Detailed and Executive views when Actual On-Site is selected.
  SubayBAYAN Official does not mount or fetch the tracker. The bell counts
  previously tracked, unresolved actions already overdue or due today through
  seven calendar days ahead (Philippine time).
- The in-app reminder updates on refresh, on return to a visible dashboard, and
  about once a minute while the dashboard stays visible and online. This does
  not send email, SMS, or background push. If offline, reminders are marked
  unavailable until refreshed. No tracker is mounted below 1024px.
- An authorized user chooses a synced Bukidnon inspection recommendation to
  track. Suggestions from older notes with ambiguous dates are left undated
  until confirmed. No old recommendations are enrolled automatically.
- Each action can have a named person or office and a due date. Resolution
  requires a short note or HTTPS evidence link. Project completion does not
  resolve an inspection follow-up.
- The project name opens the original inspection, including older inspections
  not initially in view. If the source inspection is removed, a tracked action
  retains its recommendation and is linked to the remaining inspection history.
- Existing area-of-responsibility rules scope access. Admin and field roles
  may act only where they have project update access. A responsible name is a
  tracking label, not a permission grant. No official SubayBAYAN data, source
  recommendations, or mobile workflow is rewritten.

## Apply the bell update and preview

From a clean checkout of main that already has the Bukidnon pilot:

```bash
cd ~/project-monitoring-pwa
git status --short
unzip -o "$HOME/Downloads/PMS10-Actual-Followup-Bell-v2.zip" -d .
npm ci
node --test tests/inspection-followups.test.mjs
npm run build
```

The bell update changes only the desktop UI and its regression test. It does
not deploy, apply migrations, or modify existing follow-up records.

## Original pilot setup (only if not yet installed)

From a clean repository on the current baseline:

```bash
cd ~/project-monitoring-pwa
git status --short
git switch -c pms10-inspection-followups
unzip -o "$HOME/Downloads/PMS10-Inspection-Followups-Bukidnon.zip" -d .
npm ci
node --test tests/inspection-followups.test.mjs
npm run build
```

The new table must exist in the database used by the web preview. First confirm
the linked Supabase target is your **development or pilot** database and that
the earlier geographic-read migration is applied. Run `npx supabase db push
--dry-run`, review the pending migration list, and apply the tracker migration
to that environment. Do not use these instructions to push an unrelated pending
migration. No production apply is needed for a local build.

## Verify the pilot
1. In a desktop window, go to Dashboard, select **A** (Actual On-Site), and
   click the Inspection Follow-ups bell by the switches. Select **S**
   (SubayBAYAN Official) and verify the panel and bell disappear, then return to
   **A** and open the bell again.
   Choose **Track an inspection recommendation** and select one Bukidnon item.
2. Assign a person or office and set a past due date. Verify it appears in
   Overdue and adds one to the bell. Change the deadline into the next seven
   days and verify the badge moves to Due within 7 days.
3. Set In Progress, then Resolved. Verify resolution requires a note or valid
   link. After resolving, the item should leave the active reminder count.
4. Click a project name tied to an older update. Confirm that the exact
   inspection opens and that progress/status values did not change.
5. Verify the same record is editable by a permitted engineer, read-only to
   a viewer for that LGU, and unavailable to users outside the assigned area.
   Open a phone-width window and check that the existing dashboard is unchanged.

The SQL regression fixture `tests/inspection-followups-policy.sql` must be
run inside a transaction that is rolled back, and expects representative
Admin, PEO and MLGOO profiles. The optional browser test uses a mock API. To run
it, install Python Playwright and Chromium, then launch Vite in a separate shell:

```bash
VITE_SUPABASE_URL=https://followup-fixture.supabase.co VITE_SUPABASE_ANON_KEY=fixture-publishable-key npm run dev -- --host 127.0.0.1 --port 4168 --strictPort
python3 tests/inspection-followups-browser.py
```

Set `PMS10_TEST_CHROMIUM` if using a system Chromium executable. No production
credentials are required. For production, use the affected-files ZIP only after
checking the preview against pilot roles and keep the Supabase/Vercel targets
aligned.
