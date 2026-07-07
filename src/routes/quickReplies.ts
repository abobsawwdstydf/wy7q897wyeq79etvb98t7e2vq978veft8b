import { Router } from 'express';
import { prisma } from '../db';
import { AuthRequest, authenticateToken } from '../middleware/auth';

const router = Router();

// Получить умные ответы на основе контекста
router.post('/suggest', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { chatId, lastMessages } = req.body;

    if (!chatId || !lastMessages || !Array.isArray(lastMessages)) {
      return res.status(400).json({ error: 'chatId и lastMessages обязательны' });
    }

    // Анализируем последние сообщения
    const context = lastMessages.slice(-5).map((m: any) => m.content).join(' ');
    
    // Получаем стиль общения пользователя из его последних сообщений
    const userMessages = await prisma.message.findMany({
      where: { senderId: userId, chatId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { content: true }
    });

    const userStyle = userMessages.map(m => m.content).join(' ');

    // Генерируем умные ответы на основе контекста
    const suggestions = generateSmartReplies(context, userStyle);

    res.json({ suggestions });
  } catch (error: any) {
    console.error('Error generating smart replies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Простая генерация умных ответов (можно заменить на AI)
function generateSmartReplies(context: string, userStyle: string): string[] {
  const contextLower = context.toLowerCase();
  const suggestions: string[] = [];

  // Вопросы
  if (contextLower.includes('как дела') || contextLower.includes('как ты')) {
    suggestions.push('Отлично, спасибо! А у тебя?', 'Всё хорошо 👍', 'Нормально, работаю');
  }
  
  // Приглашения
  if (contextLower.includes('пойдём') || contextLower.includes('встретимся')) {
    suggestions.push('Давай!', 'Конечно, во сколько?', 'Отличная идея!');
  }

  // Благодарности
  if (contextLower.includes('спасибо') || contextLower.includes('благодарю')) {
    suggestions.push('Пожалуйста!', 'Не за что 😊', 'Всегда рад помочь');
  }

  // Согласие/несогласие
  if (contextLower.includes('согласен') || contextLower.includes('правильно')) {
    suggestions.push('Да, точно', 'Полностью согласен', 'Именно так');
  }

  // Прощания
  if (contextLower.includes('пока') || contextLower.includes('до встречи')) {
    suggestions.push('Пока! 👋', 'До скорого!', 'Увидимся!');
  }

  // Если нет специфичных ответов, даём общие
  if (suggestions.length === 0) {
    suggestions.push('Понял', 'Хорошо', 'Окей 👌', 'Спасибо за инфо', 'Интересно');
  }

  return suggestions.slice(0, 5);
}

export default router;
