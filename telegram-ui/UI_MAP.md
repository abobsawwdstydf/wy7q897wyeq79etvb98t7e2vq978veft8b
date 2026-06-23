# Telegram iOS UI Map — Полная карта дизайна

> **490 Swift-файлов** из реального кода Telegram iOS, скопированных в одну папку.

---

## Структура папки

```
telegram-ui-demo/
│
├── TabBarUI/              (4)    Нижняя панель навигации
├── Chat/                  (72)   Экран чата — всё
├── ChatInput/             (4)    Панель ввода сообщений
├── ChatList/              (11)   Список чатов (главный экран)
├── ChatBubbles/           (10)   Пузыри сообщений
├── ChatBackgrounds/       (20)   Фоны чатов / Обои
├── InputPanels/           (38)   Все панели ввода
├── NavigationBar/         (9)    Верхняя шапка / навбар
├── Navigation/            (3)    Навконтроллер, TabBarController
├── CallScreen/            (32)   Экраны звонков
│   ├── Components/        (22)   Подкомпоненты
│   ├── Animation/         (3)    Анимации
│   ├── Media/             (1)    Видео-вход
│   └── Utils/             (1)    Интерполяция
├── PeerInfo/              (73)   Профиль пользователя
│   ├── ListItems/         (17)   Ячейки списков
│   ├── Panes/             (5)    Вкладки
│   └── CoverComponent/    (2)    Обложка профиля
├── MusicPlayer/           (45)   Музыка/Аудио плеер
│   ├── MediaPlayer/       (28)   Ядро плеера
│   ├── OverlayPlayer/     (6)    Всплывающий плеер
│   ├── AudioSession/      (2)    Аудио-сессии
│   ├── Waveform/          (3)    Визуализация звука
│   └── PlaybackHeader/    (4)    Шапка плеера
├── ThemeSystem/           (54)   Система тем и цветов
│   ├── Resources/         (8)    Ресурсы тем
│   ├── Settings/          (12)   Настройки тем
│   └── Wallpaper/         (18)   Обои
├── EmojiKeyboard/         (32)   Клавиатура эмодзи и стикеров
├── ComponentFlow/         (31)   Базовые UI-компоненты
│   ├── Components/        (12)   Готовые компоненты
│   ├── Utils/             (7)    Утилиты
│   ├── Host/              (3)    Хосты
│   └── Gestures/          (4)    Жесты
├── Display/               (18)   Утилиты отображения
├── ActionSheets/          (5)    Шторки и алерты
├── ContextMenus/          (5)    Контекстные меню
├── ListComponents/        (5)    Компоненты списков
├── Stories/               (4)    Истории
├── MediaEditor/           (7)    Редактор медиа
├── ShareSheet/            (2)    Панель share
├── PremiumUI/             (4)    Premium/Stars/Подарки
└── Search/                (2)    Поиск
```

---

## Основные модули

### TabBarUI — Нижняя панель
Панелька внизу экрана с иконками (Чаты, Контакты, Звонки, Настройки).

**Цвета:**
- Светлая: фон `#F2F2F2` (blur), иконки `#959595`/`#0088FF`, бейдж `#FF3B30`
- Тёмная: фон `#1D1D1D` (blur), иконки `#FFFFFF`, бейдж `#FFFFFF`+`#000000`

**Анимации:** Lottie иконки, круг-индикатор 29pt, свайп переключения

---

### Chat — Экран чата (72 файла)
Самый большой модуль. `ChatController.swift` — главный контроллер.

**Ключевые файлы:**
- `ChatController.swift` — загрузка, отправка, навигация
- `ChatControllerNode.swift` — layout всего экрана
- `ChatHistoryNode.swift` — виртуализированный список сообщений
- `ChatHistoryListNode.swift` — pull-to-refresh, пагинация

---

### ChatInput — Панель ввода (4 файла)
- `ChatInputNode.swift` — базовая нода
- `ChatInputTextNode.swift` — текстовое поле (TextKit 2)
- `ChatInputPanelContainer.swift` — переключение панелей

---

### ChatList — Список чатов (11 файлов)
- `ChatListHeaderComponent.swift` — заголовок "Chats"
- `ChatListFilterTabContainerNode.swift` — табы фильтров
- `ChatListTitleView.swift` — анимированный заголовок

---

### ChatBubbles — Пузыри сообщений (10 файлов)
- `ChatMessageBubbleContentNode.swift` — базовый контент
- `ChatMessageBubbleItemNode.swift` — ячейка сообщения
- `ChatMessageTextBubbleContentNode.swift` — текст
- `ChatMessageMediaBubbleContentNode.swift` — медиа

**Цвета пузырей:**
- Исходящее: `#0088FF` + белый текст
- Входящее: `#E9E9EB` (светлая) / `#2C2C2E` (тёмная)
- Углы: 18pt, нижний — 6pt

---

### ChatBackgrounds — Фоны чатов (20 файлов)
- `ChatMessageBackground.swift` — фон сообщений
- `WallpaperBackgroundNode.swift` — рендер обоев
- `GradientBackground.swift` — градиенты
- `GlassBackgroundComponent.swift` — glassmorphism
- `BlurredBackgroundComponent.swift` — blur

---

### InputPanels — Все панели ввода (38 файлов)
- `ChatTextInputPanelNode.swift` — текстовый ввод
- `ChatTextInputActionButtonsNode.swift` — кнопки
- `MessageInputPanelComponent.swift` — компонентная система
- `ChatTextInputMediaRecordingButton.swift` — запись голоса

---

### NavigationBar — Шапка чата (9 файлов)
- `NavigationBar.swift` — blur, back arrow SVG (13x22pt)
- `NavigationBarImpl.swift` — реализация Telegram
- `ChatNavigationButton.swift` — кнопки (назад, поиск,更多信息)

**Цвета:**
- Светлая: фон `#F7F7F7` (blur), текст `#000000`, кнопки `#0088FF`
- Тёмная: фон `#1D1D1D` (blur), текст `#FFFFFF`, кнопки `#FFFFFF`

---

### Navigation — Навконтроллер (3 файла)
- `NavigationController.swift` — стек навигации
- `NavigationContainer.swift` — контейнер
- `TabBarController.swift` — контроллер вкладок

---

### CallScreen — Звонки (32 файла)
**Цвета (отдельная палитра):**
- Градиент 1: `#568FD6` → `#626ED5` → `#A667D5` → `#7664DA`
- Градиент 2: `#ACBD65` → `#459F8D` → `#53A4D1` → `#3E917A`
- Градиент 3: `#C0508D` → `#F09536` → `#CE5081` → `#FC7C4C`
- Кнопка завершения: `#FF3B30`
- Кнопки: 56pt, `rgba(255,255,255,0.15)`

**Анимации:** color cycling 8s, blob float 6s, avatar pulse 2s

---

### PeerInfo — Профиль (73 файла)
- `PeerInfoScreen.swift` — ~6000 строк!
- `PeerInfoHeaderNode.swift` — шапка с аватаркой
- `PeerInfoAvatarListNode.swift` — галерея аватарок

---

### MusicPlayer — Музыка (45 файлов)
- `MediaPlayer.swift` — ядро плеера
- `MediaPlayerAudioRenderer.swift` — рендер аудио
- `OverlayAudioPlayerController.swift` — всплывающий плеер
- `AudioWaveformNode.swift` — визуализация волны

---

### ThemeSystem — Темы (54 файла)
- `PresentationTheme.swift` — **ГЛАВНЫЙ ФАЙЛ** все цвета
- `DefaultDarkPresentationTheme.swift` — тёмная тема
- `DefaultDayPresentationTheme.swift` — дневная тема
- `WallpaperBackgroundNode.swift` — рендер обоев

**Цвета по умолчанию:**
| Элемент | Светлая | Тёмная |
|---------|---------|--------|
| Фон | `#FFFFFF` | `#000000` |
| Вторичный | `#F2F2F7` | `#1C1C1E` |
| Акцент | `#0088FF` | `#0088FF` |
| Текст | `#000000` | `#FFFFFF` |
| Разделитель | `#C6C6C8` | `#38383A` |
| Опасность | `#FF3B30` | `#FF3B30` |
| Успех | `#34C759` | `#34C759` |

---

### EmojiKeyboard — Эмодзи/Стикеры (32 файла)
- `EntityKeyboard.swift` — основная клавиатура
- `EmojiPagerContentComponent.swift` — страницы эмодзи
- `ChatEntityKeyboardInputNode.swift` — стикеры в чате
- `StickerPickerScreen.swift` — выбор стикеров

---

### ComponentFlow — UI-компоненты (31 файл)
Базовые блоки: `Rectangle`, `Circle`, `Text`, `Image`, `Button`, `List`, `HStack`, `VStack`, `ZStack`

---

### Display — Утилиты (18 файлов)
- `Font.swift` — шрифты (regular, medium, semibold)
- `HapticFeedback.swift` — тактильная обратная связь
- `Spring.swift` — spring-анимации
- `ContainedViewLayoutTransition.swift` — layout-переходы

---

### ActionSheets — Шторки (5 файлов)
- `ActionSheetController.swift` — шторка с действиями
- `AlertController.swift` — алерт

---

### ContextMenus — Контекстные меню (5 файлов)
- `ContextMenuController.swift` — контроллер меню
- `ContextMenuNode.swift` — визуал

---

### ListComponents — Компоненты списков (5 файлов)
- `ListActionItemComponent.swift` — ячейка действия
- `ListSectionComponent.swift` — секция
- `ListSwitchItemComponent.swift` — переключатель

---

### Stories — Истории (4 файла)
- `StoryContainerScreen.swift` — контейнер историй
- `StoryContent.swift` — контент

---

### MediaEditor — Редактор медиа (7 файлов)
- `MediaEditorScreen.swift` — экран редактирования
- `CameraScreen.swift` — камера
- `VideoMessageCameraScreen.swift` — видео-сообщение

---

### ShareSheet — Панель share (2 файла)
- `ShareWithPeersScreen.swift` — выбор чатов для пересылки

---

### PremiumUI — Premium (4 файла)
- `PremiumIntroScreen.swift` — экран Premium
- `StarsIntroScreen.swift` — звёзды
- `GiftViewScreen.swift` — подарки

---

### Search — Поиск (2 файла)
- `SearchInputPanelComponent.swift` — поисковая панель
- `NavigationSearchComponent.swift` — поиск в навбаре

---

## Шрифты
- `Font.regular(size)` — обычный
- `Font.medium(size)` — средний
- `Font.semibold(size)` — полужирный

**Размеры:** Tab 10-13pt, Nav 17-34pt, Chat 16pt, Profile 24-28pt, Call 28pt

---

## Анимации — паттерны

| Паттерн | Длительность | Где |
|---------|-------------|-----|
| Quick feedback | 0.1-0.15s | Нажатия кнопок |
| Standard transition | 0.2-0.3s | Смена состояний |
| Spring | 0.3-0.5s | Модалки, bouncy |
| Fade in | 0.15-0.25s | Появление |
| Scale bounce | 0.13s + 0.1s | `0.001 → 1.1 → 1.0` |
| Color cycling | 8s infinite | Фон звонка |
| Blob float | 6s infinite | Пузыри звонка |
| Sound wave | 0.6s infinite | Групповой звонок |
