-- Threads
ALTER TABLE "Message" ADD COLUMN "threadId" TEXT;
ALTER TABLE "Message" ADD COLUMN "replyCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Thread" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Thread_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Thread_messageId_key" ON "Thread"("messageId");

ALTER TABLE "Thread" ADD CONSTRAINT "Thread_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Thread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
