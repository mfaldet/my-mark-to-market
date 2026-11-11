-- An approved, clean statement of a hunch or prediction, shown everywhere
-- in place of my raw words. The raw words stay in "title", unchanged.
-- NULL means no headline yet: show the raw words, as before.
ALTER TABLE "Question" ADD COLUMN "headline" TEXT;
