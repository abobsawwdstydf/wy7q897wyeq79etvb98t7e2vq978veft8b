import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Удаление демо данных стены...\n');

  try {
    // Удаляем все посты стены
    const deletedPosts = await prisma.wallPost.deleteMany({});
    console.log(`✅ Удалено постов: ${deletedPosts.count}`);

    // Удаляем все комментарии
    const deletedComments = await prisma.wallPostComment.deleteMany({});
    console.log(`✅ Удалено комментариев: ${deletedComments.count}`);

    // Удаляем все реакции
    const deletedReactions = await prisma.wallPostReaction.deleteMany({});
    console.log(`✅ Удалено реакций: ${deletedReactions.count}`);

    // Удаляем все просмотры
    const deletedViews = await prisma.wallPostView.deleteMany({});
    console.log(`✅ Удалено просмотров: ${deletedViews.count}`);

    // Удаляем все подписки
    const deletedSubscriptions = await prisma.wallSubscription.deleteMany({});
    console.log(`✅ Удалено подписок: ${deletedSubscriptions.count}`);

    // Удаляем все хэштеги
    const deletedHashtags = await prisma.wallHashtag.deleteMany({});
    console.log(`✅ Удалено хэштегов: ${deletedHashtags.count}`);

    // Удаляем все упоминания
    const deletedMentions = await prisma.wallMention.deleteMany({});
    console.log(`✅ Удалено упоминаний: ${deletedMentions.count}`);

    // Удаляем демо пользователей
    const demoUsernames = ['testuser', 'demo', 'alice', 'bob', 'charlie', 'diana', 'eve'];
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        username: {
          in: demoUsernames
        }
      }
    });
    console.log(`✅ Удалено демо пользователей: ${deletedUsers.count}`);

    // Сбрасываем счётчики подписчиков у всех пользователей
    await prisma.user.updateMany({
      data: {
        subscribersCount: 0
      }
    });
    console.log(`✅ Сброшены счётчики подписчиков`);

    console.log('\n🎉 Все демо данные удалены!');
  } catch (error) {
    console.error('❌ Ошибка при удалении данных:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
