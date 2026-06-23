import { PrismaClient } from '@prisma/client';
import { encryptText, decryptText, isEncryptionEnabled } from './encrypt';

interface QueryArgs {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (args: any) => Promise<any>;
}

const databaseUrl = process.env.DATABASE_URL;

export const prisma = new PrismaClient({
  datasources: databaseUrl
    ? {
        db: {
          url: databaseUrl.includes('?')
            ? databaseUrl + '&connection_limit=15&pool_timeout=30'
            : databaseUrl + '?connection_limit=15&pool_timeout=30',
        },
      }
    : undefined,
  log: [],
}).$extends({
  query: {
    message: {
      async create({ args, query }: QueryArgs) {
        if (args.data.content && typeof args.data.content === 'string') {
          args.data.content = encryptText(args.data.content);
        }
        if (args.data.quote && typeof args.data.quote === 'string') {
          args.data.quote = encryptText(args.data.quote);
        }
        const result = await query(args);
        decryptMessageFields(result);
        return result;
      },
      async update({ args, query }: QueryArgs) {
        if (args.data.content && typeof args.data.content === 'string') {
          args.data.content = encryptText(args.data.content);
        }
        if (args.data.quote && typeof args.data.quote === 'string') {
          args.data.quote = encryptText(args.data.quote);
        }
        const result = await query(args);
        decryptMessageFields(result);
        return result;
      },
      async findMany({ args, query }: QueryArgs) {
        const results = await query(args);
        for (const item of results) {
          decryptMessageFields(item);
        }
        return results;
      },
      async findFirst({ args, query }: QueryArgs) {
        const result = await query(args);
        if (result) decryptMessageFields(result);
        return result;
      },
      async findUnique({ args, query }: QueryArgs) {
        const result = await query(args);
        if (result) decryptMessageFields(result);
        return result;
      },
    },
    chat: {
      async findMany({ args, query }: QueryArgs) {
        const results = await query(args);
        for (const chat of results) {
          decryptChatMessages(chat);
        }
        return results;
      },
      async findFirst({ args, query }: QueryArgs) {
        const result = await query(args);
        if (result) decryptChatMessages(result);
        return result;
      },
      async findUnique({ args, query }: QueryArgs) {
        const result = await query(args);
        if (result) decryptChatMessages(result);
        return result;
      },
    },
    pinnedMessage: {
      async findMany({ args, query }: QueryArgs) {
        const results = await query(args);
        for (const item of results) {
          if (item && item.message) {
            decryptMessageFields(item.message);
          }
        }
        return results;
      },
      async findFirst({ args, query }: QueryArgs) {
        const result = await query(args);
        if (result && result.message) {
          decryptMessageFields(result.message);
        }
        return result;
      },
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decryptMessageFields(obj: any): void {
  if (!obj || typeof obj !== 'object' || !isEncryptionEnabled()) return;
  if (typeof obj.content === 'string') obj.content = decryptText(obj.content);
  if (typeof obj.quote === 'string') obj.quote = decryptText(obj.quote);
  if (obj.replyTo && typeof obj.replyTo === 'object') {
    decryptMessageFields(obj.replyTo);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decryptChatMessages(chat: any): void {
  if (!chat || !isEncryptionEnabled()) return;
  if (Array.isArray(chat.messages)) {
    for (const msg of chat.messages) decryptMessageFields(msg);
  }
  if (Array.isArray(chat.pinnedMessages)) {
    for (const pm of chat.pinnedMessages) {
      if (pm && pm.message) {
        decryptMessageFields(pm.message);
      }
    }
  }
}
