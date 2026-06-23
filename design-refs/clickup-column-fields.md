# ClickUp column / custom-field palette — design reference
Captured 2026-06-23 from Tariq's screenshots. Target for SNR-PMO's list "+ add column" experience (parity goal).

## "+" add-column UX (target)
- Floating "+" button inline with the column-heading row, pinned at the FAR RIGHT end (stays after the last column) on EVERY list page.
- Click → "Fields" panel: tabs **Create new** | **Add existing**; search box ("Search for new or existing fields").
- Grouped sections: **Suggested** (context-aware), **AI fields**, **All**. Each row = icon + name; hover → "Create".

## Field types (parity target)
STANDARD: Dropdown (single-select) · Text · Date · Text area (Long Text) · Number · Labels (multi-select) · Checkbox · Money · Website · Email · Phone · Rating · Voting · Signature · Location · T-shirt Size · Button · Files · Progress (Manual) · Progress (Auto) · Progress Updates · Relationship (link records) · Rollup (aggregate from related) · Formula · People · Tasks · Action Items
AI FIELDS: Summary · Custom Text · Custom Dropdown · Categorize · Translation · Sentiment
SUGGESTED (context AI examples): Design Concept (Text) · Target Audience (Dropdown) · Design Deadline (Date) · Feedback Summary (AI)

## SNR-PMO mapping
- Already have: `custom_field_definitions` + `components/useCustomColumns.tsx` + `components/AddColumnForm.tsx` + "+ add column" in DataList/ListToolbar (limited types: text/number/date/dropdown/multiselect).
- GAP vs ClickUp: money, website, email, phone, rating, voting, signature, location, t-shirt size, button, files, progress(×3), formula, rollup, relationship, people, tasks, action-items, + AI fields (summary/categorize/sentiment/translation — wire to the agent/LLM layer).
- TODO: (1) extend field-type registry + AddColumnForm palette (grouped Standard/AI/Suggested + search + Add-existing); (2) reposition "+" to a floating end-of-header control; (3) enforce column width >= heading width (global DataList styling token).
