import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Создаем тестового пользователя
  const hashedPassword = await bcrypt.hash('test123', 10);
  
  const user = await prisma.user.upsert({
    where: { username: 'testuser' },
    update: {},
    create: {
      username: 'testuser',
      displayName: 'Test User',
      email: 'test@example.com',
      password: hashedPassword,
      beavers: 1000,
      isVerified: true,
      verifiedBadgeUrl: '/galochcka.png',
    },
  });

  console.log('✅ Создан пользователь:', user.username);
  console.log('   Email:', user.email);
  console.log('   Пароль: test123');
  console.log('   Бобры:', user.beavers);

  // Создаем второго пользователя
  const user2 = await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      displayName: 'Demo User',
      email: 'demo@example.com',
      password: hashedPassword,
      beavers: 500,
    },
  });

  console.log('✅ Создан пользователь:', user2.username);
  console.log('   Email:', user2.email);
  console.log('   Пароль: test123');
  console.log('   Бобры:', user2.beavers);

  // Создаем тестовый пост на стене
  const post = await prisma.wallPost.create({
    data: {
      authorId: user.id,
      content: 'Привет! Это первый пост на стене Нексо! 🎉\n\nСистема стены полностью работает:\n- Текст с форматированием\n- Фото и видео\n- Голосовые сообщения\n- Реакции и комментарии\n- Умная лента\n\nПопробуйте создать свой пост!',
      viewsCount: 0,
    },
  });

  console.log('✅ Создан тестовый пост:', post.id);

  // Создаем комментарий к посту
  const comment = await prisma.wallPostComment.create({
    data: {
      postId: post.id,
      authorId: user2.id,
      content: 'Отличный пост! Система работает супер! 👍',
    },
  });

  console.log('✅ Создан комментарий:', comment.id);

  // Создаем реакцию
  const reaction = await prisma.wallPostReaction.create({
    data: {
      postId: post.id,
      userId: user2.id,
      emoji: '❤️',
    },
  });

  console.log('✅ Создана реакция:', reaction.emoji);

  console.log('\n🎉 Seeding завершен!');
  console.log('\n📝 Тестовые аккаунты:');
  console.log('   1. username: testuser, password: test123');
  console.log('   2. username: demo, password: test123');
  console.log('\n🚀 Теперь можете войти и использовать стену!');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
