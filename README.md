# NCR Follow-up Control

Internal QA tool for following up open NCRs with Purchasing and Suppliers. QA is the only user; Purchasing needs no login.

Plain HTML/CSS/JS web app (no framework). It runs in two modes:

- **This browser only** (default): open `index.html`; data stays in the browser. Good for trying it out. Use Settings → Backup (Excel) to keep a copy.
- **Team mode (Google Sheet as the database):** a few teammates open one link, see the same data and every change is saved to a Google Sheet automatically. The app is served by a Google Apps Script web app, so no hosting is needed. Setup (about 10 minutes, no coding): see **`apps-script/SETUP.md`** (Thai).

## Team mode files
- `apps-script/Code.gs`: the script that serves the app and reads/writes the Sheet (tabs `NCR_Master`, `Followup_History`, `Settings`, `_Data`). Optional `ACCESS_CODE` passcode inside.
- `apps-script/Index.html`: the whole app in one file. **Generated**: run `python3 tools/build_apps_script.py` after changing anything under `js/`, `css/` or `index.html`, then paste the new file into the Apps Script project and deploy a new version.
- Not yet tested against a real Google account. It was tested against an in-memory simulation of the Apps Script services (load, save, two users, undo, clear, restore, passcode).

## Uploaded the wrong file?
**Settings → Your data**: *Undo last import* (removes what it added, restores what it changed) or *Clear all NCR data* (type DELETE). The Import page also shows *Undo this import* right after an import. In Google Sheets mode, paste the latest `apps-script/Code.gs` and redeploy so undo and clear can reach the sheet.

## Weekly / monthly Excel import
**Import Excel** page: upload the raw-data export (.xlsx/.xls/.csv). Columns are auto-detected (and remembered); check the mapping, review the preview, import.
- New NCR No. → added as *Not Started*.
- Existing NCR No. → only raw fields (item, batch, supplier, buyer, date, defect, quantity) are refreshed; Next Action, Owner, Due Date, Status and history are never overwritten.
- Expected columns: Created date, NCR Number, Item number, Batch number, Closed, Sub nonconformance category id (→ Defect), Remarks, Buyer. Quantity and Supplier are optional.
- NCRs with **Closed = yes** (any letter case), or Remarks containing **jira** (any letter case), are closed automatically at import, new or existing. They go to the Closed page with today as the closed date.
- **Remarks = buyer's progress.** It is stored as *Buyer Remark* (separate from QA's own Remark) and refreshed on every import; each change — including the buyer clearing Remarks (old text kept in the history entry) — is logged in history as a "Buyer update". A buyer update unchanged for N days (Settings, default 7) is flagged **⏳ stale**. Open NCRs whose Remarks are empty are the first priority tab on **Open NCRs** ("No remark") so QA knows to chase the buyer first.
- Optional: also close open NCRs that are missing from the file (off by default; only for exports that list every NCR).

## The weekly loop
1. **First import**: the full history. Every open NCR starts in **To follow up** (badge = how many).
2. **Chase**: tick rows (or *Select all*, or *Message [buyer]*) → **Follow-up** → copy the message → pick the next check date → record. The NCR moves to **Followed up** (badge = how many) and **stays there until it is closed**.
3. **Every week**: import the new export. Nothing is lost: buyer remark changes are added to each NCR's timeline, new NCRs land in To follow up, NCRs the file marks as closed are closed automatically.
4. **In Followed up**, NCRs that need you rise to the top: *Buyer updated*, *Check due*. Press ▸ on a row to see its latest timeline; **Follow up again** records another round.
5. **Closing happens from the file, not by hand**: at import an NCR is closed when its *Closed* column says yes (any letter case) or its Remarks contain a close keyword such as *Jira* (any letter case, editable in Settings). Closed NCRs go to the Closed page. There is no manual close or reopen button.
6. **Not forgotten**: a Followed up NCR with 3+ follow-ups and no buyer reply since the first one gets a red **No reply after N follow-ups** badge and sorts to the top.
7. **Export to Excel** (To follow up and Followed up pages): one sheet per buyer, ready to attach to an email. Pick a buyer pill to export just that buyer.

## Hold for scrap and Jira
Remarks containing **hold** or **scrap** (any letter case) are kept out of To follow up and Followed up and listed on **Hold & Jira → Hold for scrap**. Remarks containing **jira** (any letter case, “JIRA: unable to approve - Closed”) are closed at import and listed on **Hold & Jira → Jira closed** (not on the Closed page). Keywords are editable in Settings; Jira wins if a remark has both.

## Pages
Home (by buyer) · To follow up (no remark first) · Followed up (waiting for the next check date) · Closed archive (search/filter/sort) · NCR Detail (follow-up control, history timeline, quick Follow-up message) · Add/Edit NCR · Import Excel · Settings (dropdowns, due-soon window, escalation threshold, aging bands).

## Notes
- Excel parsing uses SheetJS from cdnjs, so the Import page needs internet access.
- Dates are day-first (`01/10/2026` = 1 Oct); Thai Buddhist years are converted automatically.

## Import history and file date
On the Import page, set the **File date** (default today) to the day the export was taken: every timeline entry and closed date from that import uses it, so a late upload still lands on the right day. **Import history** lists every upload (file date, new NCRs, remark changes, closed) with a month calendar and the weeks that have no upload. The log is kept in this browser.

## Buyer response
Uploads → **Buyers**: one card per buyer for the latest upload, quiet buyers first. Each card says in plain words what the buyer wrote, shows new / updated / still-waiting as a bar, and links to the buyer's NCRs.

In **Import history**, every upload has a Delete button. Uploads are removed newest first: deleting an older one also removes the ones built on top of it. The File date can be any date, including future ones, which is handy when you simulate weekly uploads with test files.

## What changed notification
After each upload a 🔔 banner appears on Home, To follow up and Followed up until you open **What changed** (or dismiss it). The page lists, for that upload: buyer remark updates (before → now), new NCRs, cleared remarks, buyer changes and NCRs closed by the file. Every row in Import history has a **Changes** button to reopen it.

## How to use page
The **How to use** menu explains the weekly routine step by step, what each word means (To follow up, Followed up, No remark, Hold for scrap, Rounds, Carried over…) and what the colours mean. Menu items also show a short tooltip.

The **What changed** menu item is always there. It opens the latest upload and lets you step back through older ones (Older / Newer or the dropdown). A badge on the menu shows how many NCRs the newest upload touched until you open it.

**Reviewed**: when a buyer changes a remark the NCR shows *Buyer updated*. After you read it, press ✓ Reviewed to clear the flag. Pressed by mistake? Open the NCR and press ↩ Undo next to the newest “Reviewed buyer update” entry in its history.

## Export all to Excel
Home → **Export all to Excel** downloads one workbook: Summary (per buyer), To follow up, Followed up, Hold for scrap, Jira closed, Closed, Timeline (every history entry) and Uploads. Each status sheet is in work order with a # column.

## Trends
Home → **Trends**. Every import saves a snapshot (open, no remark, followed up, hold, Jira closed, closed, open over 90 days). The page draws the backlog lines and new vs closed bars, with the numbers underneath. **Monthly summary (Excel)** gives start vs end of a month, uploads, a per-buyer sheet and the NCRs open over 90 days; **Chart (PNG)** saves the charts as an image. Trends start from the first import made after this feature was added.

## Menu
Home · To follow up · Followed up · Hold & Jira · Closed · **Uploads** (Import with its history and calendar, What changed, Buyers, Trends) · Help · Settings.

## Backup, reopen and missing NCRs
- **Settings → Backup**: *Save backup (Excel)* writes one workbook (READ ME, NCR_Master, Followup_History, Uploads, Upload_Changes, Settings) that opens in Excel or Google Sheets. *Restore from backup* reads that workbook (or an older .json backup) and replaces all current data after a confirmation. To use it in Google Sheets, upload it to Drive; to restore from Google Sheets, download it as .xlsx first. Do not rename sheets or column headings. Undo data of earlier uploads is not part of the backup. Home reminds you when there is no backup or the last one is over 14 days old, and the top bar warns when browser storage is 80% full.
- **Reopen**: if a closed NCR comes back in a later file without Closed = Yes (and without a close keyword in Remarks), it is reopened and listed in What changed. This needs the Closed and Remarks columns to be mapped.
- **Not in this file**: open NCRs that are missing from an upload stay open, get a ❓ chip and are listed in What changed.
- Manual editing is gone: no Edit/Add NCR, no bulk set of owner/status/next check, no add-entry. Follow-up only records that you chased a buyer.
