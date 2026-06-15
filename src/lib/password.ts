/**
 * Валидация сложности пароля.
 * Требования:
 * - Минимум 8 символов
 * - Максимум 50 символов
 * - Хотя бы 1 буква
 * - Хотя бы 1 цифра
 */
export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: 'Пароль должен содержать минимум 8 символов' };
  }
  if (password.length > 50) {
    return { valid: false, error: 'Пароль не более 50 символов' };
  }
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(password)) {
    return { valid: false, error: 'Пароль должен содержать хотя бы одну букву' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: 'Пароль должен содержать хотя бы одну цифру' };
  }
  return { valid: true };
}

/**
 * Проверка на commonly used пароли
 */
export function isCommonPassword(password: string): boolean {
  const common = [
    'password', '12345678', 'qwerty123', 'admin123', 'letmein',
    'welcome1', 'monkey123', 'dragon1', 'login123', 'abc12345',
    'password1', '123456789', '1234567890', 'qwerty1234',
  ];
  return common.includes(password.toLowerCase());
}
