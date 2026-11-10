-- AlterTable
ALTER TABLE "User" ADD COLUMN     "apiKeyCreatedAt" TIMESTAMP(3),
ADD COLUMN     "apiKeyHash" TEXT,
ADD COLUMN     "apiKeyLastFour" TEXT;

-- Hand-written: move every existing plain-text key across to its SHA-256
-- hash, then empty the plain-text column. Existing keys keep working,
-- because lib/api_keys.ts looks keys up by the same hash.
UPDATE "User"
SET "apiKeyHash" = encode(sha256(convert_to("apiKey", 'UTF8')), 'hex'),
    "apiKeyLastFour" = right("apiKey", 4),
    "apiKeyCreatedAt" = CURRENT_TIMESTAMP
WHERE "apiKey" IS NOT NULL AND "apiKey" <> '';

UPDATE "User" SET "apiKey" = NULL WHERE "apiKey" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_apiKeyHash_key" ON "User"("apiKeyHash");
