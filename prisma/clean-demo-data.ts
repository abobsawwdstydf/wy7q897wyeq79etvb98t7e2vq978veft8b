import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanDemoData() {
  console.log('🧹 Начинаем очистку демо данных...\n');

  try {
    // Удаляем все посты стены
    const deletedPosts = await prisma.wallPost.deleteMany({});
    console.log(`✅ Удалено постов стены: ${deletedPosts.count}`);

    // Удаляем все хэштеги
    const deletedHashtags = await prisma.wallHashtag.deleteMany({});
    console.log(`✅ Удалено хэштегов: ${deletedHashtags.count}`);

    // Удаляем все подписки
    const deletedSubscriptions = await prisma.wallSubscription.deleteMany({});
    console.log(`✅ Удалено подписок: ${deletedSubscriptions.count}`);

    // Сбрасываем счётчики подписчиков
    await prisma.user.updateMany({
      data: {
        subscribersCount: 0
      }
    });
    console.log(`✅ Сброшены счётчики подписчиков`);

    // Удаляем тестовых пользователей (кроме админа и реальных пользователей)
    // Оставляем только пользователей с реальными email или созданных недавно
    const testUsers = await prisma.user.findMany({
      where: {
        OR: [
          { username: { startsWith: 'test' } },
          { username: { startsWith: 'demo' } },
          { username: { startsWith: 'user' } },
          { email: { contains: 'test' } },
          { email: { contains: 'demo' } },
        ]
      }
    });

    for (const testUser of testUsers) {
      try {
        await prisma.user.delete({
          where: { id: testUser.id }
        });
        console.log(`✅ Удалён тестовый пользователь: ${testUser.username}`);
      } catch (err) {
        console.log(`⚠️  Не удалось удалить пользователя ${testUser.username}: ${err}`);
      }
    }

    console.log('\n✨ Очистка демо данных завершена!');
  } catch (error) {
    console.error('❌ Ошибка при очистке данных:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanDemoData();
