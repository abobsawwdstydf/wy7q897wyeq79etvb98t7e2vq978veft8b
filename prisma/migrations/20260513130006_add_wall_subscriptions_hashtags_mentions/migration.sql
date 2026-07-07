-- CreateTable
CREATE TABLE "WallSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subscriberId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WallHashtag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tag" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "ownerUseCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WallPostHashtag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "hashtagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WallPostHashtag_postId_fkey" FOREIGN KEY ("postId") REFERENCES "WallPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WallPostHashtag_hashtagId_fkey" FOREIGN KEY ("hashtagId") REFERENCES "WallHashtag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WallMention" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WallMention_postId_fkey" FOREIGN KEY ("postId") REFERENCES "WallPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "phone" TEXT,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "bio" TEXT,
    "birthday" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "hideStoryViews" BOOLEAN NOT NULL DEFAULT false,
    "registrationIp" TEXT,
    "pushSubscription" TEXT,
    "pinnedChannelId" TEXT,
    "notifyAll" BOOLEAN NOT NULL DEFAULT true,
    "notifyMessages" BOOLEAN NOT NULL DEFAULT true,
    "notifyCalls" BOOLEAN NOT NULL DEFAULT true,
    "notifyFriends" BOOLEAN NOT NULL DEFAULT true,
    "twoFASecret" TEXT,
    "twoFAEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFAMethod" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedBadgeUrl" TEXT,
    "verifiedBadgeType" TEXT,
    "verifiedAt" DATETIME,
    "tagText" TEXT,
    "tagColor" TEXT,
    "tagStyle" TEXT,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "premiumUntil" DATETIME,
    "premiumType" TEXT,
    "beavers" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "subscribersCount" INTEGER NOT NULL DEFAULT 0,
    "isBanned" BOOLEAN NOT NULL DEFAULT false,
    "banReason" TEXT,
    "banExpiresAt" DATETIME,
    "bannedAt" DATETIME,
    "bannedBy" TEXT,
    "identityKey" TEXT,
    "signedPreKey" TEXT,
    "signedPreKeyId" INTEGER,
    "signedPreKeySig" TEXT,
    "oneTimePreKeys" TEXT,
    "syncKey" TEXT,
    "profileMusic" TEXT DEFAULT '[]',
    "nameAnimation" TEXT,
    "nameColor" TEXT,
    "nameGradient" TEXT,
    "pinnedChats" TEXT,
    "defaultChatBackground" TEXT,
    "settingsSyncEnabled" BOOLEAN NOT NULL DEFAULT true,
    "fakePassword" TEXT,
    "fakeChats" TEXT DEFAULT '[]',
    CONSTRAINT "User_pinnedChannelId_fkey" FOREIGN KEY ("pinnedChannelId") REFERENCES "Chat" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatar", "banExpiresAt", "banReason", "bannedAt", "bannedBy", "beavers", "bio", "birthday", "createdAt", "defaultChatBackground", "displayName", "email", "emailVerified", "fakeChats", "fakePassword", "hideStoryViews", "id", "identityKey", "isBanned", "isOnline", "isPremium", "isVerified", "lastSeen", "nameAnimation", "nameColor", "nameGradient", "notifyAll", "notifyCalls", "notifyFriends", "notifyMessages", "oneTimePreKeys", "password", "phone", "phoneVerified", "pinnedChannelId", "pinnedChats", "premiumType", "premiumUntil", "profileMusic", "pushSubscription", "registrationIp", "settingsSyncEnabled", "signedPreKey", "signedPreKeyId", "signedPreKeySig", "syncKey", "tagColor", "tagStyle", "tagText", "totalEarned", "totalSpent", "twoFAEnabled", "twoFAMethod", "twoFASecret", "username", "verifiedAt", "verifiedBadgeType", "verifiedBadgeUrl") SELECT "avatar", "banExpiresAt", "banReason", "bannedAt", "bannedBy", "beavers", "bio", "birthday", "createdAt", "defaultChatBackground", "displayName", "email", "emailVerified", "fakeChats", "fakePassword", "hideStoryViews", "id", "identityKey", "isBanned", "isOnline", "isPremium", "isVerified", "lastSeen", "nameAnimation", "nameColor", "nameGradient", "notifyAll", "notifyCalls", "notifyFriends", "notifyMessages", "oneTimePreKeys", "password", "phone", "phoneVerified", "pinnedChannelId", "pinnedChats", "premiumType", "premiumUntil", "profileMusic", "pushSubscription", "registrationIp", "settingsSyncEnabled", "signedPreKey", "signedPreKeyId", "signedPreKeySig", "syncKey", "tagColor", "tagStyle", "tagText", "totalEarned", "totalSpent", "twoFAEnabled", "twoFAMethod", "twoFASecret", "username", "verifiedAt", "verifiedBadgeType", "verifiedBadgeUrl" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WallSubscription_subscriberId_idx" ON "WallSubscription"("subscriberId");

-- CreateIndex
CREATE INDEX "WallSubscription_targetId_idx" ON "WallSubscription"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "WallSubscription_subscriberId_targetId_key" ON "WallSubscription"("subscriberId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "WallHashtag_tag_key" ON "WallHashtag"("tag");

-- CreateIndex
CREATE INDEX "WallHashtag_tag_idx" ON "WallHashtag"("tag");

-- CreateIndex
CREATE INDEX "WallHashtag_ownerId_idx" ON "WallHashtag"("ownerId");

-- CreateIndex
CREATE INDEX "WallHashtag_useCount_idx" ON "WallHashtag"("useCount");

-- CreateIndex
CREATE INDEX "WallPostHashtag_postId_idx" ON "WallPostHashtag"("postId");

-- CreateIndex
CREATE INDEX "WallPostHashtag_hashtagId_idx" ON "WallPostHashtag"("hashtagId");

-- CreateIndex
CREATE UNIQUE INDEX "WallPostHashtag_postId_hashtagId_key" ON "WallPostHashtag"("postId", "hashtagId");

-- CreateIndex
CREATE INDEX "WallMention_postId_idx" ON "WallMention"("postId");

-- CreateIndex
CREATE INDEX "WallMention_userId_idx" ON "WallMention"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WallMention_postId_userId_key" ON "WallMention"("postId", "userId");
