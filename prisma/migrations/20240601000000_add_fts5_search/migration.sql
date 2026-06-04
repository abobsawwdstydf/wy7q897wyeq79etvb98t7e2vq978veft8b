-- Full-Text Search (FTS5) Migration for SQLite
-- Run this after prisma db push to enable full-text search

-- FTS5 virtual table for messages
CREATE VIRTUAL TABLE IF NOT EXISTS "MessageFTS" USING fts5(
  content,
  "chatId",
  "senderId",
  type,
  content='Message',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS "MessageFTS_insert" AFTER INSERT ON "Message" BEGIN
  INSERT INTO "MessageFTS"(rowid, content, "chatId", "senderId", type)
  VALUES (new.rowid, new.content, new."chatId", new."senderId", new.type);
END;

CREATE TRIGGER IF NOT EXISTS "MessageFTS_delete" AFTER DELETE ON "Message" BEGIN
  INSERT INTO "MessageFTS"("MessageFTS", rowid, content, "chatId", "senderId", type)
  VALUES ('delete', old.rowid, old.content, old."chatId", old."senderId", old.type);
END;

CREATE TRIGGER IF NOT EXISTS "MessageFTS_update" AFTER UPDATE ON "Message" BEGIN
  INSERT INTO "MessageFTS"("MessageFTS", rowid, content, "chatId", "senderId", type)
  VALUES ('delete', old.rowid, old.content, old."chatId", old."senderId", old.type);
  INSERT INTO "MessageFTS"(rowid, content, "chatId", "senderId", type)
  VALUES (new.rowid, new.content, new."chatId", new."senderId", new.type);
END;

-- Rebuild FTS index from existing data
INSERT INTO "MessageFTS"("MessageFTS") VALUES('rebuild');
