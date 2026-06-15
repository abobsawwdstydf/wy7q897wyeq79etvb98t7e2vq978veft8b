import { Router } from 'express';
import { prisma } from '../db';
import { Prisma } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { SENDER_SELECT, MESSAGE_INCLUDE, uploadFile, deleteUploadedFile } from '../shared';
import { localStorage } from '../lib/localStorage';
import { validateFileType, validateFileSize, validateTotalUploadSize, sanitizeFilename } from '../lib/fileValidator';
import {
  sanitizeText,
  validateContentLength,
  CONTENT_LIMITS,
} from '../lib/sanitize';

const router = Router();

// Получить сообщения чата
router.get('/chat/:chatId', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const { cursor, limit = '50' } = req.query;
    const take = Math.min(Math.max(1, parseInt(limit as string) || 50), 200);

    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
      include: { chat: { select: { type: true } } },
    });

    if (!member) {
      res.status(403).json({ error: 'Нет доступа к этому чату' });
      return;
    }

    const createdAtFilter: Record<string, Date> = {};
    if (cursor) createdAtFilter.lt = new Date(cursor as string);
    // Для каналов и групп показываем все сообщения за всё время, игнорируя clearedAt
    if (member.clearedAt && member.chat.type === 'personal') {
      createdAtFilter.gt = member.clearedAt;
    }

    const messages = await prisma.message.findMany({
      where: {
        chatId,
        isDeleted: false,
        hiddenBy: { none: { userId: req.userId! } },
        OR: [
          { scheduledAt: null },
          { senderId: req.userId! },
        ],
        ...(Object.keys(createdAtFilter).length > 0 ? { createdAt: createdAtFilter } : {}),
      },
      include: MESSAGE_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take,
    });

    // Convert local:// and tg:// URLs to downloadable API URLs for all media
    const transformMedia = (media: any[]) => media.map(m => ({
      ...m,
      url: m.url?.startsWith('local://') 
        ? `/api/files/${m.url.replace('local://', '')}/download`
        : m.url?.startsWith('tg://') 
        ? `/api/files/${m.url.replace('tg://', '')}/download` 
        : m.url,
    }));

    const transformedMessages = messages.map(msg => ({
      ...msg,
      media: transformMedia(msg.media || []),
    }));

    res.json(transformedMessages.reverse());
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Загрузка файлов - ЛОКАЛЬНОЕ ХРАНИЛИЩЕ
// Limit reduced to 20 files for security and performance
router.post('/upload', uploadFile.array('files', 20) as any, async (req: AuthRequest, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    console.log(`[UPLOAD] Received ${files?.length || 0} files from user ${req.userId}`);

    if (!files || files.length === 0) {
      res.status(400).json({ error: 'Файлы не загружены' });
      return;
    }

    // SECURITY: Проверка общего размера загрузки
    const totalSizeValidation = validateTotalUploadSize(files);
    if (!totalSizeValidation.valid) {
      res.status(413).json({ error: totalSizeValidation.error });
      return;
    }

    const uploadedFiles = [];
    const failedFiles = [];

    for (const file of files) {
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      
      // SECURITY: Санитизация имени файла
      const sanitizedName = sanitizeFilename(originalName);

      // Fix empty/wrong MIME type based on file extension
      let mimeType = file.mimetype;
      
      // Normalize MIME types with codecs (e.g., 'audio/ogg;codecs=opus' -> 'audio/ogg')
      if (mimeType && mimeType.includes(';')) {
        mimeType = mimeType.split(';')[0].trim();
      }
      
      if (!mimeType || mimeType === 'application/octet-stream') {
        const ext = sanitizedName.split('.').pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
          'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
          'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/quicktime',
          'mp3': 'audio/mpeg', 'ogg': 'audio/ogg', 'opus': 'audio/opus',
          'wav': 'audio/wav', 'm4a': 'audio/mp4', 'aac': 'audio/aac',
          'pdf': 'application/pdf', 'doc': 'application/msword',
          'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'zip': 'application/zip', 'rar': 'application/x-rar-compressed',
        };
        if (ext && mimeMap[ext]) {
          mimeType = mimeMap[ext];
        }
      }

      // SECURITY: Проверка размера файла
      const sizeValidation = validateFileSize(file.size, mimeType);
      if (!sizeValidation.valid) {
        console.log(`[UPLOAD] File too large: ${sanitizedName} (${file.size} bytes)`);
        failedFiles.push({ name: sanitizedName, error: sizeValidation.error });
        continue;
      }

      // SECURITY: Проверка типа файла по magic bytes
      const typeValidation = await validateFileType(file.buffer, mimeType);
      if (!typeValidation.valid) {
        console.log(`[UPLOAD] Invalid file type: ${sanitizedName} - ${typeValidation.error}`);
        failedFiles.push({ name: sanitizedName, error: typeValidation.error || 'Недопустимый тип файла' });
        continue;
      }
      
      // Используем реальный MIME тип, определённый по magic bytes
      if (typeValidation.actualMimeType) {
        mimeType = typeValidation.actualMimeType;
      }

      let storedFile;
      try {
        // Сохраняем файл локально (encryptionLevel = 1 для всех файлов)
        storedFile = await localStorage.uploadFile(
          file.buffer,
          sanitizedName,
          mimeType,
          req.userId!,
          1
        );
        console.log(`[UPLOAD] Local storage OK: ${storedFile.fileId} (${mimeType})`);
      } catch (storageError: any) {
        console.error(`[UPLOAD] Storage error for ${sanitizedName}: ${storageError.message}`);
        failedFiles.push({ name: sanitizedName, error: storageError.message });
        continue; // Continue with next file instead of failing all
      }

      // Сохраняем метаданные в БД
      try {
        const localFile = await prisma.localFile.create({
          data: {
            fileId: storedFile.fileId,
            userId: req.userId!,
            originalName: storedFile.originalName,
            mimeType: storedFile.mimeType,
            totalSize: storedFile.totalSize,
            storagePath: storedFile.storagePath,
            encryptionLevel: storedFile.encryptionLevel,
            chunks: {
              create: storedFile.chunks.map(chunk => ({
                fileId: storedFile.fileId,
                chunkIndex: chunk.chunkIndex,
                size: chunk.size,
                path: chunk.path,
              }))
            }
          },
          include: { chunks: true }
        });
        console.log(`[UPLOAD] DB OK: ${localFile.fileId}`);
        uploadedFiles.push({
          fileId: localFile.fileId,
          filename: localFile.originalName,
          size: localFile.totalSize,
          mimetype: localFile.mimeType,
          url: `/api/files/${localFile.fileId}/download`,
        });
      } catch (dbError: any) {
        console.error(`[UPLOAD] DB error: ${dbError.message}`);
        // Файл сохранён локально, но не в БД — возвращаем fileId напрямую
        uploadedFiles.push({
          fileId: storedFile.fileId,
          filename: storedFile.originalName,
          size: storedFile.totalSize,
          mimetype: storedFile.mimeType,
          url: `/api/files/${storedFile.fileId}/download`,
        });
      }
    }

    // Return results with partial success info
    if (uploadedFiles.length === 0 && failedFiles.length > 0) {
      // All files failed to upload
      res.status(500).json({ 
        error: 'Не удалось загрузить файлы', 
        failed: failedFiles 
      });
      return;
    }

    const response: any = { files: uploadedFiles };
    if (failedFiles.length > 0) {
      response.failed = failedFiles;
      response.partialSuccess = true;
    }

    res.json(response);
  } catch (error: any) {
    console.error('[UPLOAD] Critical error:', error.message);
    res.status(500).json({ error: 'Ошибка загрузки: ' + (error.message || 'Неизвестная ошибка') });
  }
});

// Редактировать сообщение
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { content } = req.body;
    const id = String(req.params.id);

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'Содержимое обязательно' });
      return;
    }

    // SECURITY: Content length validation
    const contentLengthCheck = validateContentLength(content, CONTENT_LIMITS.MESSAGE);
    if (!contentLengthCheck.valid) {
      res.status(400).json({ error: contentLengthCheck.error });
      return;
    }

    // SECURITY: Sanitize content
    const sanitizedContent = sanitizeText(content);

    const message = await prisma.message.findUnique({ 
      where: { id },
      include: {
        chat: {
          select: {
            type: true,
            members: {
              where: { userId: req.userId! },
              select: { role: true }
            }
          }
        }
      }
    });
    
    if (!message) {
      res.status(404).json({ error: 'Сообщение не найдено' });
      return;
    }

    // Для каналов только владелец может редактировать
    const userMember = message.chat.members[0];
    const isOwner = userMember?.role === 'owner' || userMember?.role === 'admin';
    const isChannel = message.chat.type === 'channel';
    
    if (isChannel && !isOwner) {
      res.status(403).json({ error: 'Только владелец канала может редактировать сообщения' });
      return;
    }
    
    // Для личных чатов и групп - только свои сообщения
    if (!isChannel && message.senderId !== req.userId) {
      res.status(403).json({ error: 'Нет прав для редактирования' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id },
      data: { content: sanitizedContent, isEdited: true },
      include: MESSAGE_INCLUDE,
    });

    res.json(updated);
  } catch (_error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить сообщение
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = String(req.params.id);

    const message = await prisma.message.findUnique({
      where: { id },
      include: { 
        media: true,
        chat: { 
          select: { 
            type: true,
            members: { 
              where: { userId: req.userId! },
              select: { role: true }
            }
          }
        }
      },
    });
    
    if (!message) {
      res.status(404).json({ error: 'Сообщение не найдено' });
      return;
    }

    // Проверка прав: для каналов только владелец может удалять
    const userMember = message.chat.members[0];
    const isOwner = userMember?.role === 'owner' || userMember?.role === 'admin';
    const isChannel = message.chat.type === 'channel';
    
    if (isChannel && !isOwner) {
      res.status(403).json({ error: 'Только владелец канала может удалять сообщения' });
      return;
    }
    
    // Для личных чатов и групп - только свои сообщения или админы
    if (!isChannel && message.senderId !== req.userId && !isOwner) {
      res.status(403).json({ error: 'Нет прав для удаления' });
      return;
    }

    // Delete media files from disk
    if (message.media && message.media.length > 0) {
      for (const m of message.media) {
        if (m.url) deleteUploadedFile(m.url);
      }
      await prisma.media.deleteMany({ where: { messageId: id } });
    }

    await prisma.message.update({
      where: { id },
      data: { isDeleted: true, content: null },
    });

    res.json({ success: true });
  } catch (_error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить общие медиа/файлы/ссылки чата
router.get('/chat/:chatId/shared', async (req: AuthRequest, res) => {
  try {
    const chatId = String(req.params.chatId);
    const { type } = req.query; // 'media' | 'files' | 'links'

    // Check membership
    const member = await prisma.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId: req.userId! } },
    });
    if (!member) {
      res.status(403).json({ error: 'Нет доступа' });
      return;
    }

    const baseWhere: Prisma.MessageWhereInput = {
      chatId,
      isDeleted: false,
      hiddenBy: { none: { userId: req.userId! } },
      ...(member.clearedAt ? { createdAt: { gt: member.clearedAt } } : {}),
    };

    if (type === 'media') {
      // Images and videos
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          media: { some: { type: { in: ['image', 'video'] } } },
        },
        include: {
          media: { where: { type: { in: ['image', 'video'] } } },
          sender: { select: SENDER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      res.json(messages);
    } else if (type === 'files') {
      // Files (documents, archives, audio, etc.)
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          media: { some: { type: { notIn: ['image', 'video'] } } },
        },
        include: {
          media: { where: { type: { notIn: ['image', 'video'] } } },
          sender: { select: SENDER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      res.json(messages);
    } else if (type === 'links') {
      // Messages containing URLs
      const messages = await prisma.message.findMany({
        where: {
          ...baseWhere,
          content: { contains: 'http' },
        },
        include: {
          sender: { select: SENDER_SELECT },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      // Filter to only messages with actual URLs
      const withLinks = messages
        .filter((m) => m.content && /https?:\/\/[^\s]+/i.test(m.content))
        .map((m) => {
          const links = m.content!.match(/https?:\/\/[^\s]+/gi) || [];
          return { ...m, links };
        });
      res.json(withLinks);
    } else {
      res.status(400).json({ error: 'Invalid type. Use: media, files, or links' });
    }
  } catch (error) {
    console.error('Shared media error:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
