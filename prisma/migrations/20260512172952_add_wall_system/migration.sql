-- DropIndex
DROP INDEX "NFTInstance_receivedAt_idx";

-- DropIndex
DROP INDEX "NFTInstance_isEquipped_idx";

-- CreateTable
CREATE TABLE "WallPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "content" TEXT,
    "fontStyle" TEXT,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WallPostMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "duration" REAL,
    "size" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WallPostMedia_postId_fkey" FOREIGN KEY ("postId") REFERENCES "WallPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WallPostReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WallPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "WallPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WallPostComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "parentId" TEXT,
    "content" TEXT,
    "photoUrl" TEXT,
    "voiceUrl" TEXT,
    "voiceDuration" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WallPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "WallPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WallPostComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WallPostComment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WallPostView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "WallPost_authorId_idx" ON "WallPost"("authorId");

-- CreateIndex
CREATE INDEX "WallPost_createdAt_idx" ON "WallPost"("createdAt");

-- CreateIndex
CREATE INDEX "WallPost_viewsCount_idx" ON "WallPost"("viewsCount");

-- CreateIndex
CREATE INDEX "WallPostMedia_postId_idx" ON "WallPostMedia"("postId");

-- CreateIndex
CREATE INDEX "WallPostMedia_type_idx" ON "WallPostMedia"("type");

-- CreateIndex
CREATE INDEX "WallPostReaction_postId_idx" ON "WallPostReaction"("postId");

-- CreateIndex
CREATE INDEX "WallPostReaction_userId_idx" ON "WallPostReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WallPostReaction_postId_userId_emoji_key" ON "WallPostReaction"("postId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "WallPostComment_postId_idx" ON "WallPostComment"("postId");

-- CreateIndex
CREATE INDEX "WallPostComment_authorId_idx" ON "WallPostComment"("authorId");

-- CreateIndex
CREATE INDEX "WallPostComment_parentId_idx" ON "WallPostComment"("parentId");

-- CreateIndex
CREATE INDEX "WallPostComment_createdAt_idx" ON "WallPostComment"("createdAt");

-- CreateIndex
CREATE INDEX "WallPostView_postId_idx" ON "WallPostView"("postId");

-- CreateIndex
CREATE INDEX "WallPostView_userId_idx" ON "WallPostView"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WallPostView_postId_userId_key" ON "WallPostView"("postId", "userId");
