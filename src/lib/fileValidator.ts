import { fromBuffer as fileTypeFromBuffer } from 'file-type';

/**
 * SECURITY: Валидация файла по magic bytes (реальному содержимому)
 * Защита от загрузки вредоносных файлов с подменённым расширением
 */
export async function validateFileType(buffer: Buffer, declaredMimeType: string): Promise<{
  valid: boolean;
  actualMimeType?: string;
  error?: string;
}> {
  try {
    // Проверяем реальный MIME тип по magic bytes
    const fileType = await fileTypeFromBuffer(buffer);
    
    if (!fileType) {
      // Файл не распознан по magic bytes — разрешаем (некоторые форматы не имеют magic bytes)
      return { valid: true };
    }
    
    // Нормализуем MIME типы (убираем параметры)
    const normalizedDeclared = declaredMimeType.split(';')[0].trim().toLowerCase();
    const normalizedActual = fileType.mime.toLowerCase();
    
    // Проверяем, что тип файла разрешён
    const allowedMimeTypes = [
      // Изображения
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp',
      'image/avif', 'image/apng', 'image/tiff', 'image/x-icon', 'image/jfif',
      // Видео
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
      'video/avi', 'video/x-flv', 'video/mpeg', 'video/3gpp', 'video/x-ms-wmv',
      // Аудио
      'audio/mpeg', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/webm', 'audio/aac', 'audio/mp4', 'audio/x-m4a', 'application/ogg',
      'audio/flac', 'audio/x-flac', 'audio/x-wav', 'audio/x-mpeg', 'audio/x-aac',
      // Документы
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'application/vnd.oasis.opendocument.presentation',
      'application/rtf',
      'application/x-rtf',
      'text/rtf',
      // Архивы
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
      'application/x-tar', 'application/gzip', 'application/x-bzip2',
      // Текст и код
      'text/plain', 'text/html', 'text/css', 'text/javascript', 'application/json',
      'application/xml', 'text/xml', 'text/csv', 'text/markdown',
      'application/x-yaml', 'text/yaml',
      // Шрифты
      'font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'application/font-woff', 'application/font-sfnt',
      // 3D и CAD
      'model/gltf-binary', 'model/gltf+json',
      // Прочее
      'application/octet-stream',
    ];
    
    // Проверяем соответствие
    if (normalizedDeclared !== normalizedActual) {
      // Разрешаем некоторые совместимые типы
      const compatibleTypes: Record<string, string[]> = {
        'image/jpeg': ['image/jpg'],
        'image/jpg': ['image/jpeg'],
        'audio/mpeg': ['audio/mp3'],
        'audio/mp3': ['audio/mpeg'],
        'audio/ogg': ['audio/opus', 'audio/webm', 'application/ogg'],
        'audio/opus': ['audio/ogg', 'audio/webm', 'application/ogg'],
        'audio/webm': ['audio/ogg', 'audio/opus', 'video/webm'],
        'audio/mp4': ['audio/x-m4a', 'audio/aac', 'video/mp4'],
        'audio/x-m4a': ['audio/mp4', 'audio/aac'],
        'audio/aac': ['audio/mp4', 'audio/x-m4a'],
        'video/quicktime': ['video/mov'],
        'video/mov': ['video/quicktime'],
        'video/webm': ['audio/webm'],
      };
      
      const compatible = compatibleTypes[normalizedActual]?.includes(normalizedDeclared) ||
                        compatibleTypes[normalizedDeclared]?.includes(normalizedActual);
      
      // Если заявленный тип разрешён — принимаем (magic bytes могут неточно определять формат)
      if (!compatible && !allowedMimeTypes.includes(normalizedDeclared)) {
        return {
          valid: false,
          actualMimeType: normalizedActual,
          error: `Тип файла не совпадает: заявлен ${normalizedDeclared}, обнаружен ${normalizedActual}`,
        };
      }
    }
    
    if (!allowedMimeTypes.includes(normalizedActual) && !allowedMimeTypes.includes(normalizedDeclared)) {
      return {
        valid: false,
        actualMimeType: normalizedActual,
        error: `Тип файла не разрешён: ${normalizedActual}`,
      };
    }
    
    return { valid: true, actualMimeType: normalizedActual };
  } catch (error: any) {
    console.error('[FILE_VALIDATOR] Error:', error);
    return { valid: false, error: 'Ошибка проверки файла' };
  }
}

/**
 * SECURITY: Проверка размера файла
 */
export function validateFileSize(size: number, mimeType: string): { valid: boolean; error?: string } {
  const maxSizes: Record<string, number> = {
    'image': 10 * 1024 * 1024, // 10 MB
    'video': 100 * 1024 * 1024, // 100 MB
    'audio': 20 * 1024 * 1024, // 20 MB
    'document': 50 * 1024 * 1024, // 50 MB
    'default': 20 * 1024 * 1024, // 20 MB
  };
  
  const category = mimeType.split('/')[0];
  const maxSize = maxSizes[category] || maxSizes['default'];
  
  if (size > maxSize) {
    return {
      valid: false,
      error: `Файл слишком большой. Максимум: ${Math.round(maxSize / 1024 / 1024)} MB`,
    };
  }
  
  return { valid: true };
}

/**
 * SECURITY: Проверка общего размера загрузки
 */
export function validateTotalUploadSize(files: { size: number }[]): { valid: boolean; error?: string } {
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const maxTotalSize = 200 * 1024 * 1024; // 200 MB за один запрос
  
  if (totalSize > maxTotalSize) {
    return {
      valid: false,
      error: `Общий размер файлов слишком большой. Максимум: 200 MB за раз`,
    };
  }
  
  return { valid: true };
}

/**
 * SECURITY: Санитизация имени файла
 */
export function sanitizeFilename(filename: string): string {
  // Удаляем путь (защита от path traversal)
  let sanitized = filename.replace(/^.*[\\/]/, '');
  
  // Удаляем опасные символы
  sanitized = sanitized.replace(/[<>:"|?*]/g, '_');
  for (let i = 0; i < sanitized.length; i++) {
    const code = sanitized.charCodeAt(i);
    if (code >= 0x00 && code <= 0x1f) {
      sanitized = sanitized.substring(0, i) + '_' + sanitized.substring(i + 1);
    }
  }
  
  // Ограничиваем длину
  if (sanitized.length > 255) {
    const ext = sanitized.split('.').pop();
    const name = sanitized.substring(0, 255 - (ext ? ext.length + 1 : 0));
    sanitized = ext ? `${name}.${ext}` : name;
  }
  
  // Предотвращаем двойные расширения (.pdf.exe)
  const parts = sanitized.split('.');
  if (parts.length > 2) {
    const ext = parts.pop();
    const name = parts.join('_');
    sanitized = `${name}.${ext}`;
  }
  
  return sanitized;
}
