-- A time zone on each account: "today", claim dates and due dates use it.
ALTER TABLE "User" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'America/Chicago';

-- History rows written by the app itself (a date correction, or a re-grade
-- after the grading rules change) are marked SYSTEM rather than borrowing
-- the way the item was first entered.
ALTER TYPE "EntrySource" ADD VALUE 'SYSTEM';
