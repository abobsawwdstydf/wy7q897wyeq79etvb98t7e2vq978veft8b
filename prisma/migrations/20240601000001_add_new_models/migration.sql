-- Migration: Add new models (reports, notifications, recordings, transcripts)
-- This migration adds the new tables alongside existing ones

-- ContentReport table
CREATE TABLE IF NOT EXISTS "ContentReport" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "reporterId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reviewedBy" TEXT,
  "reviewedAt" DATETIME,
  "reviewNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "ContentReport_status_idx" ON "ContentReport"("status");
CREATE INDEX IF NOT EXISTS "ContentReport_targetType_targetId_idx" ON "ContentReport"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "ContentReport_reporterId_idx" ON "ContentReport"("reporterId");
CREATE INDEX IF NOT EXISTS "ContentReport_createdAt_idx" ON "ContentReport"("createdAt");

-- ChatNotificationSetting table
CREATE TABLE IF NOT EXISTS "ChatNotificationSetting" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "chatId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sound" BOOLEAN NOT NULL DEFAULT true,
  "vibration" BOOLEAN NOT NULL DEFAULT true,
  "preview" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatNotificationSetting_chatId_userId_unique" UNIQUE ("chatId", "userId")
);

CREATE INDEX IF NOT EXISTS "ChatNotificationSetting_chatId_idx" ON "ChatNotificationSetting"("chatId");
CREATE INDEX IF NOT EXISTS "ChatNotificationSetting_userId_idx" ON "ChatNotificationSetting"("userId");

-- CallRecording table
CREATE TABLE IF NOT EXISTS "CallRecording" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "callId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "recorderId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'audio',
  "fileUrl" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL DEFAULT 0,
  "duration" REAL NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'recording',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CallRecording_recorderId_fkey" FOREIGN KEY ("recorderId") REFERENCES "User" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "CallRecording_callId_idx" ON "CallRecording"("callId");
CREATE INDEX IF NOT EXISTS "CallRecording_chatId_idx" ON "CallRecording"("chatId");
CREATE INDEX IF NOT EXISTS "CallRecording_recorderId_idx" ON "CallRecording"("recorderId");
CREATE INDEX IF NOT EXISTS "CallRecording_status_idx" ON "CallRecording"("status");

-- VoiceTranscript table
CREATE TABLE IF NOT EXISTS "VoiceTranscript" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "messageId" TEXT NOT NULL UNIQUE,
  "text" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'ru',
  "confidence" REAL NOT NULL DEFAULT 0,
  "segments" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoiceTranscript_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "VoiceTranscript_messageId_idx" ON "VoiceTranscript"("messageId");
CREATE INDEX IF NOT EXISTS "VoiceTranscript_language_idx" ON "VoiceTranscript"("language");
