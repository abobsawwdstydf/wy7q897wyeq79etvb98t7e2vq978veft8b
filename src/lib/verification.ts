import { prisma } from '../db';

/**
 * Генерирует 6-значный код верификации
 */
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Генерирует уникальный токен для ссылки
 */
export function generateToken(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

/**
 * Создаёт запись верификации и возвращает код + токен
 */
export async function createVerification(data: {
  phone?: string;
  email?: string;
  userId?: string;
  purpose: 'phone_register' | 'email_register' | 'login_2fa';
  method: 'email' | 'sms';
}): Promise<{ code: string; token: string }> {
  const code = generateCode();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 минут

  await prisma.verificationCode.create({
    data: {
      phone: data.phone || null,
      email: data.email || null,
      userId: data.userId || null,
      code,
      purpose: data.purpose,
      method: data.method,
      token,
      expiresAt,
    },
  });

  return { code, token };
}

/**
 * Проверяет код верификации
 */
export async function verifyCode(data: {
  phone?: string;
  email?: string;
  userId?: string;
  code: string;
  purpose: 'phone_register' | 'email_register' | 'login_2fa';
}): Promise<{ valid: boolean; message: string }> {
  const record = await prisma.verificationCode.findFirst({
    where: {
      code: data.code,
      purpose: data.purpose,
      used: false,
      expiresAt: { gt: new Date() },
      ...(data.phone ? { phone: data.phone } : {}),
      ...(data.email ? { email: data.email } : {}),
      ...(data.userId ? { userId: data.userId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    return { valid: false, message: 'Неверный или истёкший код' };
  }

  // Отмечаем как использованный
  await prisma.verificationCode.update({
    where: { id: record.id },
    data: { used: true },
  });

  return { valid: true, message: 'Код подтверждён' };
}

/**
 * Находит токен верификации
 */
export async function findVerificationToken(token: string) {
  return prisma.verificationCode.findFirst({
    where: { token, used: false, expiresAt: { gt: new Date() } },
  });
}

/**
 * Очищает истёкшие коды верификации
 */
export async function cleanupExpiredCodes(): Promise<number> {
  const result = await prisma.verificationCode.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
