# What I added to Fatebook, in more detail

The [README](../README.md#what-fatebook-already-did-and-what-i-added) has one line per feature. This page says a little more about each.

## A standard for what I said

Each item keeps the text in my own words, the date I said it (separate from the date I logged it), and an outcome stored as one of five shapes with the parts that shape needs: a number by a date, an event by a date, one thing beating another, a rank or award, or free text. Code: `lib/claims/types.ts`.

## A headline over my words

Claude, or the app's own AI step, rewrites what I said into one clear, sharp sentence. I approve or steer it, and the approved headline is what shows everywhere: the list, the detail page, the Due tab and the public track record. My raw words are saved underneath, unchanged, and shown as "Originally said" (on the public track record too, behind a toggle under each headline). An entry with no headline shows my words. Code: `lib/claims/service.ts`, `components/claims/PreviewCard.tsx`.

## Honest provenance

Every outcome part is marked _stated_ (I said it), _extracted_ (the AI read it from my text) or _working_ (a default I accepted), and I can confirm each one. Code: `components/claims/ClaimPanel.tsx`.

## A grade from 1 to 5

Plain code, no AI: the same words always get the same grade. Everything I log is a prediction; the grade says how checkable it is. Grades 4 and 5 are checkable: one outcome, a deadline and a way to tell. Grades 1 to 3 are not yet. An outcome that is really two predictions ("if … then", "and/or"), or an event with no stated way to tell, stays below grade 4. Sharper terms than mine in the outcome are fine: that is the point. Code: `lib/claims/grade.ts`.

## Sharpening a prediction

On the web, the card of a prediction that is not checkable yet has a "Sharpen" button. It runs the same step a preview uses on my original words and shows a proposed headline and parts, each marked "suggested". Nothing changes until I approve; I can edit anything first, or discard it. Approving is one recorded version of the same item, and the date I first said it stays as it was. Code: `components/claims/card/ClaimCard.tsx`, `proposeSharpening` in `lib/claims/service.ts`.

The API and the Claude connector also still offer the older way: the app names the most important gap as one question, with a default where one makes sense, never more than three. Code: `lib/claims/next_question.ts`.

## Confidence words

"Likely", "toss-up", "almost no chance" and so on are each mapped to a range. A rule decides when a percentage is my confidence and when it is just a number in the text. Code: `lib/claims/confidence.ts`.

## Deadlines from the date said

"This year" in a prediction voiced in July 2025 means December 31, 2025, whenever I log it. Code: `lib/claims/dates.ts`.

## My time zone

"Today", the date I said something, due lines and the daily job all use the time zone saved on my account (default America/Chicago), so an entry logged at 8:30pm is dated that day, not the next. API and connector calls can pass their own. Code: `lib/claims/timezone.ts`.

## Close calls

"About 6%" that lands at 5.8% is scored wrong, and marked as a near miss. Code: `lib/claims/tolerance.ts`.

## Publish and unpublish

Every prediction is private until I publish it. Only a checkable one (grade 4 or 5) with every part confirmed can be published, at any time, including after it is resolved. The card asks once before publishing; unpublishing takes one press and removes it from the public feed and the embed page at once. Each publish and unpublish is a recorded version in my private history; nothing about unpublishing shows publicly. A withdrawn prediction cannot be published. An edit that would leave a published prediction no longer checkable is blocked, never silently fixed. Claude can publish or unpublish through the connector, only when I ask in so many words. Code: `setPublic` in `lib/claims/service.ts`, `components/claims/card/ClaimCard.tsx`.

## Stories

A story is a named group of predictions, such as "The labor market". A prediction belongs to at most one. The card shows it in one row; the Edit form has a picker that lists my stories and takes a new name. Renaming a story applies to every prediction in it, each as a recorded version. The home list shows the story quietly on each row and can be filtered by one. Claude suggests a story in every preview, preferring ones I already have, and it is saved only with my approval. Code: `storyIdFor` and `renameStory` in `lib/claims/service.ts`.

## Notes, private or public

Notes sit in one list under the card, newest first: a date, the text, an optional link to a source. A reason given with a change in how sure I am is a note too, shown with the change ("70% to 35%"). Every note is private unless I switch it to public, and nothing is ever made public for me. A public note is locked as written; I can set it back to private at any time, and then edit it. A public note leaves the app only while its prediction is published. Making a note public or private is a recorded version. Code: `addNote` and `setNotePublic` in `lib/claims/service.ts`, `components/claims/card/Notes.tsx`.

## Append-only history

Every change writes a full snapshot, chained to the one before by a hash, with a button that re-checks the chain. The database itself rejects edits and deletes on the history table. See [what the history does and does not prove](../README.md#what-the-history-does-and-does-not-prove). Code: `lib/claims/history.ts`.

## Where it came from

A prediction links back to the earlier, looser one it grew out of. Code: `lib/claims/service.ts`.

## Preview before saving

With Claude, and on the web when the AI step is on, the proposed sharpening is shown first with the grade it would get. Nothing is saved until I approve it; what I approve is saved as mine, dated when I first said it. Code: `previewClaim` in `lib/claims/service.ts`, `components/claims/PreviewCard.tsx`.

## Daily backups

A read-only export of everything (withdrawn items, every version with its hash chain, confidence history, account settings; never keys or tokens), behind its own token. A private repo fetches it daily, runs the app's hash-chain check on it and keeps it as one readable file per item, so changes show as clean diffs. The restore script has been tested end to end into a fresh database. Code: `lib/backup/export.ts`, `pages/api/backup/export.ts`.

## Logging from anywhere

API endpoints, a hosted MCP server for Claude, and an iPhone Shortcut. Each item records how it came in: web, API, phone or agent. Code: `lib/web/claims_api_router.ts`, `lib/mcp/server.ts`. Guides: [Claude](connect-claude.md), [iPhone](iphone-shortcut.md).

## A public track record

A JSON feed and an embeddable page showing only the predictions I have published, each with its grade, dates, result and latest history hash. Each one carries the name of its story and the notes I have made public; the feed also lists the stories that hold at least one published prediction. Private notes, notes on unpublished predictions, and stories with nothing published never appear. Code: `lib/claims/public_record.ts`.
