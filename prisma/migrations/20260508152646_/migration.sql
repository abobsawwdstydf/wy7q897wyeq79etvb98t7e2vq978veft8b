/*
  Warnings:

  - You are about to drop the column `priceFromNexo` on the `NFTCard` table. All the data in the column will be lost.
  - You are about to drop the column `isFromNexo` on the `NFTMarketListing` table. All the data in the column will be lost.
  - You are about to drop the column `priceFromNexo` on the `NFTTag` table. All the data in the column will be lost.
  - You are about to drop the column `isFromNexo` on the `NFTTagMarketListing` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NFTCard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rarity" TEXT NOT NULL,
    "totalSupply" INTEGER NOT NULL,
    "currentSupply" INTEGER NOT NULL DEFAULT 0,
    "photoUrl" TEXT NOT NULL,
    "effectUrls" TEXT NOT NULL DEFAULT '[]',
    "effectSettings" TEXT NOT NULL DEFAULT '{}',
    "backgroundColor" TEXT,
    "gradientColors" TEXT,
    "borderColor" TEXT,
    "borderWidth" INTEGER NOT NULL DEFAULT 0,
    "priceFromНексо" INTEGER NOT NULL DEFAULT 0,
    "isStockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stockVolatility" REAL NOT NULL DEFAULT 5.0,
    "currentPrice" INTEGER NOT NULL DEFAULT 0,
    "lastPriceUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NFTCard" ("backgroundColor", "borderColor", "borderWidth", "createdAt", "currentPrice", "currentSupply", "description", "effectSettings", "effectUrls", "gradientColors", "id", "isStockEnabled", "lastPriceUpdate", "name", "photoUrl", "rarity", "stockVolatility", "totalSupply", "updatedAt") SELECT "backgroundColor", "borderColor", "borderWidth", "createdAt", "currentPrice", "currentSupply", "description", "effectSettings", "effectUrls", "gradientColors", "id", "isStockEnabled", "lastPriceUpdate", "name", "photoUrl", "rarity", "stockVolatility", "totalSupply", "updatedAt" FROM "NFTCard";
DROP TABLE "NFTCard";
ALTER TABLE "new_NFTCard" RENAME TO "NFTCard";
CREATE INDEX "NFTCard_rarity_idx" ON "NFTCard"("rarity");
CREATE INDEX "NFTCard_currentSupply_idx" ON "NFTCard"("currentSupply");
CREATE INDEX "NFTCard_isStockEnabled_idx" ON "NFTCard"("isStockEnabled");
CREATE TABLE "new_NFTMarketListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardId" TEXT NOT NULL,
    "instanceId" TEXT,
    "sellerId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "isFromНексо" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NFTMarketListing_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "NFTCard" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NFTMarketListing" ("cardId", "createdAt", "id", "instanceId", "price", "sellerId", "updatedAt") SELECT "cardId", "createdAt", "id", "instanceId", "price", "sellerId", "updatedAt" FROM "NFTMarketListing";
DROP TABLE "NFTMarketListing";
ALTER TABLE "new_NFTMarketListing" RENAME TO "NFTMarketListing";
CREATE UNIQUE INDEX "NFTMarketListing_instanceId_key" ON "NFTMarketListing"("instanceId");
CREATE INDEX "NFTMarketListing_cardId_idx" ON "NFTMarketListing"("cardId");
CREATE INDEX "NFTMarketListing_sellerId_idx" ON "NFTMarketListing"("sellerId");
CREATE INDEX "NFTMarketListing_price_idx" ON "NFTMarketListing"("price");
CREATE INDEX "NFTMarketListing_isFromНексо_idx" ON "NFTMarketListing"("isFromНексо");
CREATE INDEX "NFTMarketListing_createdAt_idx" ON "NFTMarketListing"("createdAt");
CREATE TABLE "new_NFTTag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT NOT NULL,
    "backgroundColor" TEXT,
    "glowColor" TEXT,
    "rarity" TEXT NOT NULL,
    "totalSupply" INTEGER NOT NULL,
    "currentSupply" INTEGER NOT NULL DEFAULT 0,
    "priceFromНексо" INTEGER NOT NULL DEFAULT 0,
    "isStockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stockVolatility" REAL NOT NULL DEFAULT 5.0,
    "currentPrice" INTEGER NOT NULL DEFAULT 0,
    "lastPriceUpdate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_NFTTag" ("backgroundColor", "createdAt", "currentPrice", "currentSupply", "description", "glowColor", "iconUrl", "id", "isStockEnabled", "lastPriceUpdate", "name", "rarity", "stockVolatility", "totalSupply", "updatedAt") SELECT "backgroundColor", "createdAt", "currentPrice", "currentSupply", "description", "glowColor", "iconUrl", "id", "isStockEnabled", "lastPriceUpdate", "name", "rarity", "stockVolatility", "totalSupply", "updatedAt" FROM "NFTTag";
DROP TABLE "NFTTag";
ALTER TABLE "new_NFTTag" RENAME TO "NFTTag";
CREATE INDEX "NFTTag_rarity_idx" ON "NFTTag"("rarity");
CREATE INDEX "NFTTag_currentSupply_idx" ON "NFTTag"("currentSupply");
CREATE TABLE "new_NFTTagMarketListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "instanceId" TEXT,
    "sellerId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "isFromНексо" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NFTTagMarketListing_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "NFTTag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NFTTagMarketListing" ("createdAt", "id", "instanceId", "price", "sellerId", "tagId", "updatedAt") SELECT "createdAt", "id", "instanceId", "price", "sellerId", "tagId", "updatedAt" FROM "NFTTagMarketListing";
DROP TABLE "NFTTagMarketListing";
ALTER TABLE "new_NFTTagMarketListing" RENAME TO "NFTTagMarketListing";
CREATE UNIQUE INDEX "NFTTagMarketListing_instanceId_key" ON "NFTTagMarketListing"("instanceId");
CREATE INDEX "NFTTagMarketListing_tagId_idx" ON "NFTTagMarketListing"("tagId");
CREATE INDEX "NFTTagMarketListing_sellerId_idx" ON "NFTTagMarketListing"("sellerId");
CREATE INDEX "NFTTagMarketListing_price_idx" ON "NFTTagMarketListing"("price");
CREATE INDEX "NFTTagMarketListing_isFromНексо_idx" ON "NFTTagMarketListing"("isFromНексо");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
