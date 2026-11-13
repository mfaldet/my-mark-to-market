-- Stories, and notes that can be private or public.
-- This migration only ADDS things. No existing column or row is altered or dropped.

-- 1. A new table: a story is a named group of predictions.
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Story_userId_name_key" ON "Story"("userId", "name");
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. One new optional column on a prediction: the story it belongs to. Empty for everything today.
ALTER TABLE "Question" ADD COLUMN "storyId" TEXT;
CREATE INDEX "Question_storyId_idx" ON "Question"("storyId");
ALTER TABLE "Question" ADD CONSTRAINT "Question_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Three new columns on a note. Every existing note gets isPublic = false: it stays private.
ALTER TABLE "Comment" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "Comment" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Comment" ADD COLUMN "forecastId" INTEGER;
CREATE UNIQUE INDEX "Comment_forecastId_key" ON "Comment"("forecastId");
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_forecastId_fkey"
    FOREIGN KEY ("forecastId") REFERENCES "Forecast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. New rows only: the reason given with an earlier confidence change becomes a private note
--    beside the others, linked to that change. The original reason stays where it was, untouched.
INSERT INTO "Comment" ("createdAt", "comment", "questionId", "userId", "isPublic", "forecastId")
SELECT f."createdAt", f."comment", f."questionId", f."userId", false, f."id"
FROM "Forecast" f
WHERE f."comment" IS NOT NULL AND btrim(f."comment") <> '';
