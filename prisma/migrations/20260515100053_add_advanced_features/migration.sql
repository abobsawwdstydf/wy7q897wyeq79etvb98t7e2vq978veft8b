/*
  Warnings:

  - You are about to drop the column `addedAt` on the `PlaylistTrack` table. All the data in the column will be lost.
  - You are about to drop the column `messageId` on the `PollVote` table. All the data in the column will be lost.
  - You are about to drop the column `optionIndex` on the `PollVote` table. All the data in the column will be lost.
  - You are about to drop the column `votedAt` on the `PollVote` table. All the data in the column will be lost.
  - Added the required column `optionId` to the `PollVote` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ReactionAnimation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emoji" TEXT NOT NULL,
    "animationUrl" TEXT NOT NULL,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "emoji" TEXT,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Poll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pollId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NFTCollection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "reward" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CollectionProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    CONSTRAINT "CollectionProgress_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "NFTCollection" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NFTAuction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "instanceId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "startPrice" INTEGER NOT NULL,
    "currentPrice" INTEGER NOT NULL,
    "buyoutPrice" INTEGER,
    "endsAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "winnerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "NFTBid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NFTBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "NFTAuction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NFTTrade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "initiatorId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "initiatorItems" TEXT NOT NULL DEFAULT '[]',
    "recipientItems" TEXT NOT NULL DEFAULT '[]',
    "initiatorBeavers" INTEGER NOT NULL DEFAULT 0,
    "recipientBeavers" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "reward" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL,
    "requirement" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VoiceRoom" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "chatId" TEXT,
    "maxUsers" INTEGER NOT NULL DEFAULT 50,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "VoiceRoomParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roomId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "isSpeaker" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoiceRoomParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VoiceRoom" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborativeDoc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DocVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocVersion_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CollaborativeDoc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "docId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "blockId" TEXT,
    "selection" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocComment_docId_fkey" FOREIGN KEY ("docId") REFERENCES "CollaborativeDoc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ChatNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DisappearingMessageSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "timer" INTEGER NOT NULL,
    "enabledBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DisappearingMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "deleteAt" DATETIME NOT NULL,
    "readBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "message" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DonationGoal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetAmount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "MarketplaceService" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "deliveryTime" INTEGER NOT NULL DEFAULT 1,
    "images" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "requirements" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "ServiceOrder_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serviceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceReview_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "MarketplaceService" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServiceReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CollaborativePlaylist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlaylistVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistVote_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "CollaborativePlaylist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlaylistVote_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "PlaylistTrack" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LiveStream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "streamerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "streamUrl" TEXT NOT NULL,
    "isLive" BOOLEAN NOT NULL DEFAULT true,
    "viewerCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "recordingUrl" TEXT
);

-- CreateTable
CREATE TABLE "StreamMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StreamMessage_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StreamDonation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "streamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "message" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StreamDonation_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "LiveStream" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Community" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "coverUrl" TEXT,
    "creatorId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CommunityMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reputation" INTEGER NOT NULL DEFAULT 0,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityModerator" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" TEXT NOT NULL DEFAULT '[]',
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityModerator_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "communityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrls" TEXT NOT NULL DEFAULT '[]',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommunityPost_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunityComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommunityComment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunityVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityVote_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "collectionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NFTCard_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "NFTCollection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NFTCard" ("backgroundColor", "borderColor", "borderWidth", "createdAt", "currentPrice", "currentSupply", "description", "effectSettings", "effectUrls", "gradientColors", "id", "isStockEnabled", "lastPriceUpdate", "name", "photoUrl", "priceFromНексо", "rarity", "stockVolatility", "totalSupply", "updatedAt") SELECT "backgroundColor", "borderColor", "borderWidth", "createdAt", "currentPrice", "currentSupply", "description", "effectSettings", "effectUrls", "gradientColors", "id", "isStockEnabled", "lastPriceUpdate", "name", "photoUrl", "priceFromНексо", "rarity", "stockVolatility", "totalSupply", "updatedAt" FROM "NFTCard";
DROP TABLE "NFTCard";
ALTER TABLE "new_NFTCard" RENAME TO "NFTCard";
CREATE INDEX "NFTCard_rarity_idx" ON "NFTCard"("rarity");
CREATE INDEX "NFTCard_currentSupply_idx" ON "NFTCard"("currentSupply");
CREATE INDEX "NFTCard_isStockEnabled_idx" ON "NFTCard"("isStockEnabled");
CREATE INDEX "NFTCard_collectionId_idx" ON "NFTCard"("collectionId");
CREATE TABLE "new_PlaylistTrack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playlistId" TEXT NOT NULL,
    "addedBy" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "url" TEXT NOT NULL,
    "duration" INTEGER,
    "coverUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "CollaborativePlaylist" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlaylistTrack" ("addedBy", "artist", "coverUrl", "duration", "id", "order", "playlistId", "title", "url") SELECT "addedBy", "artist", "coverUrl", "duration", "id", "order", "playlistId", "title", "url" FROM "PlaylistTrack";
DROP TABLE "PlaylistTrack";
ALTER TABLE "new_PlaylistTrack" RENAME TO "PlaylistTrack";
CREATE INDEX "PlaylistTrack_playlistId_idx" ON "PlaylistTrack"("playlistId");
CREATE INDEX "PlaylistTrack_addedBy_idx" ON "PlaylistTrack"("addedBy");
CREATE TABLE "new_PollVote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PollVote" ("id", "userId") SELECT "id", "userId" FROM "PollVote";
DROP TABLE "PollVote";
ALTER TABLE "new_PollVote" RENAME TO "PollVote";
CREATE INDEX "PollVote_optionId_idx" ON "PollVote"("optionId");
CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");
CREATE UNIQUE INDEX "PollVote_optionId_userId_key" ON "PollVote"("optionId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MessageReaction_messageId_idx" ON "MessageReaction"("messageId");

-- CreateIndex
CREATE INDEX "MessageReaction_userId_idx" ON "MessageReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_emoji_key" ON "MessageReaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "ReactionAnimation_emoji_key" ON "ReactionAnimation"("emoji");

-- CreateIndex
CREATE INDEX "ReactionAnimation_emoji_idx" ON "ReactionAnimation"("emoji");

-- CreateIndex
CREATE UNIQUE INDEX "UserStatus_userId_key" ON "UserStatus"("userId");

-- CreateIndex
CREATE INDEX "UserStatus_userId_idx" ON "UserStatus"("userId");

-- CreateIndex
CREATE INDEX "UserStatus_expiresAt_idx" ON "UserStatus"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Poll_messageId_key" ON "Poll"("messageId");

-- CreateIndex
CREATE INDEX "Poll_messageId_idx" ON "Poll"("messageId");

-- CreateIndex
CREATE INDEX "Poll_endsAt_idx" ON "Poll"("endsAt");

-- CreateIndex
CREATE INDEX "PollOption_pollId_idx" ON "PollOption"("pollId");

-- CreateIndex
CREATE INDEX "NFTCollection_name_idx" ON "NFTCollection"("name");

-- CreateIndex
CREATE INDEX "CollectionProgress_userId_idx" ON "CollectionProgress"("userId");

-- CreateIndex
CREATE INDEX "CollectionProgress_collectionId_idx" ON "CollectionProgress"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionProgress_userId_collectionId_key" ON "CollectionProgress"("userId", "collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "NFTAuction_instanceId_key" ON "NFTAuction"("instanceId");

-- CreateIndex
CREATE INDEX "NFTAuction_sellerId_idx" ON "NFTAuction"("sellerId");

-- CreateIndex
CREATE INDEX "NFTAuction_status_idx" ON "NFTAuction"("status");

-- CreateIndex
CREATE INDEX "NFTAuction_endsAt_idx" ON "NFTAuction"("endsAt");

-- CreateIndex
CREATE INDEX "NFTBid_auctionId_idx" ON "NFTBid"("auctionId");

-- CreateIndex
CREATE INDEX "NFTBid_bidderId_idx" ON "NFTBid"("bidderId");

-- CreateIndex
CREATE INDEX "NFTBid_createdAt_idx" ON "NFTBid"("createdAt");

-- CreateIndex
CREATE INDEX "NFTTrade_initiatorId_idx" ON "NFTTrade"("initiatorId");

-- CreateIndex
CREATE INDEX "NFTTrade_recipientId_idx" ON "NFTTrade"("recipientId");

-- CreateIndex
CREATE INDEX "NFTTrade_status_idx" ON "NFTTrade"("status");

-- CreateIndex
CREATE INDEX "NFTTrade_createdAt_idx" ON "NFTTrade"("createdAt");

-- CreateIndex
CREATE INDEX "Achievement_type_idx" ON "Achievement"("type");

-- CreateIndex
CREATE INDEX "UserAchievement_userId_idx" ON "UserAchievement"("userId");

-- CreateIndex
CREATE INDEX "UserAchievement_achievementId_idx" ON "UserAchievement"("achievementId");

-- CreateIndex
CREATE INDEX "UserAchievement_completed_idx" ON "UserAchievement"("completed");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_userId_achievementId_key" ON "UserAchievement"("userId", "achievementId");

-- CreateIndex
CREATE INDEX "VoiceRoom_ownerId_idx" ON "VoiceRoom"("ownerId");

-- CreateIndex
CREATE INDEX "VoiceRoom_chatId_idx" ON "VoiceRoom"("chatId");

-- CreateIndex
CREATE INDEX "VoiceRoom_isPublic_idx" ON "VoiceRoom"("isPublic");

-- CreateIndex
CREATE INDEX "VoiceRoomParticipant_roomId_idx" ON "VoiceRoomParticipant"("roomId");

-- CreateIndex
CREATE INDEX "VoiceRoomParticipant_userId_idx" ON "VoiceRoomParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VoiceRoomParticipant_roomId_userId_key" ON "VoiceRoomParticipant"("roomId", "userId");

-- CreateIndex
CREATE INDEX "CollaborativeDoc_chatId_idx" ON "CollaborativeDoc"("chatId");

-- CreateIndex
CREATE INDEX "CollaborativeDoc_creatorId_idx" ON "CollaborativeDoc"("creatorId");

-- CreateIndex
CREATE INDEX "DocVersion_docId_idx" ON "DocVersion"("docId");

-- CreateIndex
CREATE UNIQUE INDEX "DocVersion_docId_version_key" ON "DocVersion"("docId", "version");

-- CreateIndex
CREATE INDEX "DocComment_docId_idx" ON "DocComment"("docId");

-- CreateIndex
CREATE INDEX "DocComment_authorId_idx" ON "DocComment"("authorId");

-- CreateIndex
CREATE INDEX "ChatNote_userId_idx" ON "ChatNote"("userId");

-- CreateIndex
CREATE INDEX "ChatNote_chatId_idx" ON "ChatNote"("chatId");

-- CreateIndex
CREATE INDEX "ChatNote_userId_chatId_idx" ON "ChatNote"("userId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "DisappearingMessageSettings_chatId_key" ON "DisappearingMessageSettings"("chatId");

-- CreateIndex
CREATE INDEX "DisappearingMessageSettings_chatId_idx" ON "DisappearingMessageSettings"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "DisappearingMessage_messageId_key" ON "DisappearingMessage"("messageId");

-- CreateIndex
CREATE INDEX "DisappearingMessage_deleteAt_idx" ON "DisappearingMessage"("deleteAt");

-- CreateIndex
CREATE INDEX "DisappearingMessage_messageId_idx" ON "DisappearingMessage"("messageId");

-- CreateIndex
CREATE INDEX "Donation_senderId_idx" ON "Donation"("senderId");

-- CreateIndex
CREATE INDEX "Donation_recipientId_idx" ON "Donation"("recipientId");

-- CreateIndex
CREATE INDEX "Donation_createdAt_idx" ON "Donation"("createdAt");

-- CreateIndex
CREATE INDEX "DonationGoal_userId_idx" ON "DonationGoal"("userId");

-- CreateIndex
CREATE INDEX "DonationGoal_isActive_idx" ON "DonationGoal"("isActive");

-- CreateIndex
CREATE INDEX "MarketplaceService_sellerId_idx" ON "MarketplaceService"("sellerId");

-- CreateIndex
CREATE INDEX "MarketplaceService_category_idx" ON "MarketplaceService"("category");

-- CreateIndex
CREATE INDEX "MarketplaceService_isActive_idx" ON "MarketplaceService"("isActive");

-- CreateIndex
CREATE INDEX "ServiceOrder_serviceId_idx" ON "ServiceOrder"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceOrder_buyerId_idx" ON "ServiceOrder"("buyerId");

-- CreateIndex
CREATE INDEX "ServiceOrder_sellerId_idx" ON "ServiceOrder"("sellerId");

-- CreateIndex
CREATE INDEX "ServiceOrder_status_idx" ON "ServiceOrder"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceReview_orderId_key" ON "ServiceReview"("orderId");

-- CreateIndex
CREATE INDEX "ServiceReview_serviceId_idx" ON "ServiceReview"("serviceId");

-- CreateIndex
CREATE INDEX "ServiceReview_buyerId_idx" ON "ServiceReview"("buyerId");

-- CreateIndex
CREATE INDEX "CollaborativePlaylist_chatId_idx" ON "CollaborativePlaylist"("chatId");

-- CreateIndex
CREATE INDEX "CollaborativePlaylist_creatorId_idx" ON "CollaborativePlaylist"("creatorId");

-- CreateIndex
CREATE INDEX "PlaylistVote_playlistId_idx" ON "PlaylistVote"("playlistId");

-- CreateIndex
CREATE INDEX "PlaylistVote_trackId_idx" ON "PlaylistVote"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistVote_trackId_userId_key" ON "PlaylistVote"("trackId", "userId");

-- CreateIndex
CREATE INDEX "LiveStream_channelId_idx" ON "LiveStream"("channelId");

-- CreateIndex
CREATE INDEX "LiveStream_streamerId_idx" ON "LiveStream"("streamerId");

-- CreateIndex
CREATE INDEX "LiveStream_isLive_idx" ON "LiveStream"("isLive");

-- CreateIndex
CREATE INDEX "StreamMessage_streamId_idx" ON "StreamMessage"("streamId");

-- CreateIndex
CREATE INDEX "StreamMessage_createdAt_idx" ON "StreamMessage"("createdAt");

-- CreateIndex
CREATE INDEX "StreamDonation_streamId_idx" ON "StreamDonation"("streamId");

-- CreateIndex
CREATE INDEX "StreamDonation_createdAt_idx" ON "StreamDonation"("createdAt");

-- CreateIndex
CREATE INDEX "Community_creatorId_idx" ON "Community"("creatorId");

-- CreateIndex
CREATE INDEX "Community_category_idx" ON "Community"("category");

-- CreateIndex
CREATE INDEX "Community_isPublic_idx" ON "Community"("isPublic");

-- CreateIndex
CREATE INDEX "CommunityMember_communityId_idx" ON "CommunityMember"("communityId");

-- CreateIndex
CREATE INDEX "CommunityMember_userId_idx" ON "CommunityMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMember_communityId_userId_key" ON "CommunityMember"("communityId", "userId");

-- CreateIndex
CREATE INDEX "CommunityModerator_communityId_idx" ON "CommunityModerator"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityModerator_communityId_userId_key" ON "CommunityModerator"("communityId", "userId");

-- CreateIndex
CREATE INDEX "CommunityPost_communityId_idx" ON "CommunityPost"("communityId");

-- CreateIndex
CREATE INDEX "CommunityPost_authorId_idx" ON "CommunityPost"("authorId");

-- CreateIndex
CREATE INDEX "CommunityPost_createdAt_idx" ON "CommunityPost"("createdAt");

-- CreateIndex
CREATE INDEX "CommunityComment_postId_idx" ON "CommunityComment"("postId");

-- CreateIndex
CREATE INDEX "CommunityComment_authorId_idx" ON "CommunityComment"("authorId");

-- CreateIndex
CREATE INDEX "CommunityComment_parentId_idx" ON "CommunityComment"("parentId");

-- CreateIndex
CREATE INDEX "CommunityVote_postId_idx" ON "CommunityVote"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityVote_postId_userId_key" ON "CommunityVote"("postId", "userId");
