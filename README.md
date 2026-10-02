# NCR Follow-up Control

Internal QA tool for following up open NCRs with Purchasing and Suppliers. QA is the only user; Purchasing needs no login.

Static web app (plain HTML/CSS/JS, no build) + Google Sheets backend via a small Apps Script.

## Run
Open `index.html` in a browser (or host the folder on any static host / GitHub Pages).
With no backend configured the app starts empty and keeps data in the browser only; import your Excel file to begin. There is no sample data.

## Connect Google Sheets (auto load/save, no Sync button)
1. Create a Google Sheet. **Extensions → Apps Script**, paste `apps-script/Code.gs`.
2. **Deploy → New deployment → Web app**: Execute as *Me*, access *Anyone* (optionally set `API_KEY` in the script).
3. Copy the `/exec` URL into the app: **Settings → Apps Script Web App URL → Save & connect**.

Sheets `NCR_Master`, `Followup_History` and `Settings` are created automatically with the specified columns.

## Weekly / monthly Excel import
**Import Excel** page: upload the raw-data export (.xlsx/.xls/.csv). Columns are auto-detected (and remembered); check the mapping, review the preview, import.
- New NCR No. → added as *Not Started*.
- Existing NCR No. → only raw fields (item, batch, supplier, buyer, date, defect, quantity) are refreshed; Next Action, Owner, Due Date, Status and history are never overwritten.
- Expected columns: Created date, NCR Number, Item number, Batch number, Closed, Sub nonconformance category id (→ Defect), Remarks, Buyer. Quantity and Supplier are optional.
- NCRs already **Closed** (Yes) in the file are imported straight into the Closed page; NCRs still open here but Closed in the file are marked *Ready to Close* (QA verifies and closes).
- **Remarks = buyer's progress.** It is stored as *Buyer Remark* (separate from QA's own Remark) and refreshed on every import; each change — including the buyer clearing Remarks (old text kept in the history entry) — is logged in history as a "Buyer update". A buyer update unchanged for N days (Settings, default 7) is flagged **⏳ stale**. Open NCRs whose Remarks are empty are the first priority tab on **Open NCRs** ("No remark") so QA knows to chase the buyer first.
- Optional: mark open NCRs missing from the file as *Ready to Close* (QA still verifies and closes).

## The weekly loop
1. **First import**: the full history. Every open NCR starts in **To follow up** (badge = how many).
2. **Chase**: tick rows (or *Select all*, or *Message [buyer]*) → **Follow-up** → copy the message → pick the next check date → record. The NCR moves to **Followed up** (badge = how many) and **stays there until it is closed**.
3. **Every week**: import the new export. Nothing is lost: buyer remark changes are added to each NCR's timeline, new NCRs land in To follow up, NCRs closed in the export become *Ready to close*.
4. **In Followed up**, NCRs that need you rise to the top: *Buyer updated*, *Closed in Jira: verify*, *Ready to close*, *Check due*. Press ▸ on a row to see its latest timeline; **Follow up again** records another round.
5. When done: **Verify & close** (QA always closes explicitly). Closed NCRs go to the Closed page.

## Pages
Home (by buyer) · To follow up (no remark first) · Followed up (waiting for the next check date) · Closed archive (search/filter/sort) · NCR Detail (follow-up control, history timeline, quick Follow-up message) · Add/Edit NCR · Import Excel · Settings (dropdowns, due-soon window, escalation threshold, aging bands).

## Notes
- Excel parsing uses SheetJS from cdnjs, so the Import page needs internet access.
- Dates are day-first (`01/10/2026` = 1 Oct); Thai Buddhist years are converted automatically.
