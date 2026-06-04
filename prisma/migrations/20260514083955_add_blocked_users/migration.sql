-- CreateTable
CREATE TABLE "BlockedUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockedUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BlockedUser_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BlockedUser_userId_idx" ON "BlockedUser"("userId");

-- CreateIndex
CREATE INDEX "BlockedUser_blockedUserId_idx" ON "BlockedUser"("blockedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedUser_userId_blockedUserId_key" ON "BlockedUser"("userId", "blockedUserId");
