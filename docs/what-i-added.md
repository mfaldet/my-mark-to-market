# What I added to Fatebook, in more detail

The [README](../README.md#what-fatebook-already-did-and-what-i-added) has one line per feature. This page says a little more about each.

## A standard for what I said

Each item keeps the text in my own words, the date I said it (separate from the date I logged it), and an outcome stored as one of five shapes with the parts that shape needs: a number by a date, an event by a date, one thing beating another, a rank or award, or free text. Code: `lib/claims/types.ts`.

## A headline over my words

Claude, or the app's own AI step, rewrites what I said into one clear, sharp sentence. I approve or steer it, and the approved headline is what shows everywhere: the list, the detail page, the Due tab and the public track record. My raw words are saved underneath, unchanged, and shown as "Originally said" (on the public track record too, behind a toggle under each headline). An entry with no headline shows my words. Code: `lib/claims/service.ts`, `components/claims/PreviewCard.tsx`.

## Honest provenance

Every outcome part is marked _stated_ (I said it), _extracted_ (the AI read it from my text) or _working_ (a default I accepted), and I can confirm each one. Code: `components/claims/ClaimPanel.tsx`.

## A grade from 1 to 5

Plain code, no AI: the same words always get the same grade. Grades 1 to 3 are hunches; 4 and 5 are predictions. An outcome that is really two predictions ("if … then", "and/or"), or an event with no stated way to tell, stays below grade 4. Sharper terms than mine in the outcome are fine: that is the point. Code: `lib/claims/grade.ts`.

## Sharpening a hunch

On the web, a hunch's card has a "Sharpen this hunch" button. It runs the same step a preview uses on my original words and shows a proposed headline and parts, each marked "suggested". Nothing changes until I approve; I can edit anything first, or discard it. Approving is one recorded version of the same item, and the date I first said it stays as it was. Code: `components/claims/card/ClaimCard.tsx`, `proposeSharpening` in `lib/claims/service.ts`.

The API and the Claude connector also still offer the older way: the app names the most important gap as one question, with a default where one makes sense, never more than three. Code: `lib/claims/next_question.ts`.

## Confidence words

"Likely", "toss-up", "almost no chance" and so on are each mapped to a range. A rule decides when a percentage is my confidence and when it is just a number in the text. Code: `lib/claims/confidence.ts`.

## Deadlines from the date said

"This year" in a hunch voiced in July 2025 means December 31, 2025, whenever I log it. Code: `lib/claims/dates.ts`.

## My time zone

"Today", the date I said something, due lines and the daily job all use the time zone saved on my account (default America/Chicago), so an entry logged at 8:30pm is dated that day, not the next. API and connector calls can pass their own. Code: `lib/claims/timezone.ts`.

## Close calls

"About 6%" that lands at 5.8% is scored wrong, and marked as a near miss. Code: `lib/claims/tolerance.ts`.

## A publish gate

Everything is private by default. An item can be made public only at grade 4 or 5 with every part confirmed. An edit that would break that is blocked, never silently fixed. Code: `lib/claims/service.ts`.

## Append-only history

Every change writes a full snapshot, chained to the one before by a hash, with a button that re-checks the chain. The database itself rejects edits and deletes on the history table. See [what the history does and does not prove](../README.md#what-the-history-does-and-does-not-prove). Code: `lib/claims/history.ts`.

## Where it came from

A prediction links back to the hunch it grew out of. Code: `lib/claims/service.ts`.

## Preview before saving

With Claude, and on the web when the AI step is on, the proposed sharpening is shown first with the grade it would get. Nothing is saved until I approve it; what I approve is saved as mine, dated when I first said it. Code: `previewClaim` in `lib/claims/service.ts`, `components/claims/PreviewCard.tsx`.

## Daily backups

A read-only export of everything (withdrawn items, every version with its hash chain, confidence history, account settings; never keys or tokens), behind its own token. A private repo fetches it daily, runs the app's hash-chain check on it and keeps it as one readable file per item, so changes show as clean diffs. The restore script has been tested end to end into a fresh database. Code: `lib/backup/export.ts`, `pages/api/backup/export.ts`.

## Logging from anywhere

API endpoints, a hosted MCP server for Claude, and an iPhone Shortcut. Each item records how it came in: web, API, phone or agent. Code: `lib/web/claims_api_router.ts`, `lib/mcp/server.ts`. Guides: [Claude](connect-claude.md), [iPhone](iphone-shortcut.md).

## A public track record

A JSON feed and an embeddable page showing only the predictions I have made public, each with its grade, dates, result and latest history hash. Code: `lib/claims/public_record.ts`.
