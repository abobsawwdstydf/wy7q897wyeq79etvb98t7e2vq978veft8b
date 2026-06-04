import React, { useState } from 'react';
import {
  EnhancedModal,
  AnimatedButton,
  AnimatedText,
  GradientText,
  AnimatedInput,
  AnimatedTextarea,
  useToast,
  ToastContainer,
  SyncIndicator,
  SyncProgress,
  ConnectionStatus,
  AnimatedCard,
  CardGrid,
  FeatureCard,
  StatCard,
  ProfileCard,
} from './index';
import {
  Sparkles,
  Zap,
  Heart,
  Star,
  Users,
  TrendingUp,
  Mail,
  Lock,
} from 'lucide-react';

export const UIDemo: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const { toasts, removeToast, success, error, info, warning } = useToast();

  const handleSync = () => {
    setSyncStatus('syncing');
    setProgress(0);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setSyncStatus('success');
          success('Синхронизация завершена!', 'Все данные обновлены');
          return 100;
        }
        return prev + 10;
      });
    }, 200);
  };

  return (
    <div className="min-h-screen bg-surface p-8 space-y-12">
      {/* Header */}
      <div className="text-center space-y-4">
        <AnimatedText
          text="UI Components Demo"
          animation="slide"
          as="h1"
          className="text-5xl font-bold"
          gradient
        />
        <AnimatedText
          text="Современные компоненты с анимациями"
          animation="fade"
          delay={200}
          className="text-xl text-gray-400"
        />
      </div>

      {/* Buttons Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">
          <GradientText>Кнопки</GradientText>
        </h2>
        
        <div className="flex flex-wrap gap-4">
          <AnimatedButton variant="primary" size="lg" glow>
            Primary Button
          </AnimatedButton>
          
          <AnimatedButton variant="secondary" size="lg">
            Secondary Button
          </AnimatedButton>
          
          <AnimatedButton variant="ghost" size="lg">
            Ghost Button
          </AnimatedButton>
          
          <AnimatedButton variant="danger" size="lg">
            Danger Button
          </AnimatedButton>
          
          <AnimatedButton variant="success" size="lg">
            Success Button
          </AnimatedButton>
          
          <AnimatedButton variant="glass" size="lg">
            Glass Button
          </AnimatedButton>
          
          <AnimatedButton
            variant="primary"
            size="lg"
            icon={<Sparkles className="w-5 h-5" />}
            glow
          >
            With Icon
          </AnimatedButton>
          
          <AnimatedButton
            variant="primary"
            size="lg"
            loading
          >
            Loading...
          </AnimatedButton>
        </div>
      </section>

      {/* Modal Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">
          <GradientText>Модальные окна</GradientText>
        </h2>
        
        <div className="flex gap-4">
          <AnimatedButton
            variant="primary"
            onClick={() => setIsModalOpen(true)}
          >
            Открыть модалку
          </AnimatedButton>
        </div>

        <EnhancedModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Пример модального окна"
          size="md"
          animation="scale"
        >
          <div className="p-6 space-y-4">
            <p className="text-gray-300">
              Это пример улучшенного модального окна с анимациями и backdrop blur.
            </p>
            
            <AnimatedInput
              label="Email"
              type="email"
              icon={<Mail className="w-5 h-5" />}
              placeholder="example@email.com"
              variant="glass"
            />
            
            <AnimatedInput
              label="Пароль"
              type="password"
              icon={<Lock className="w-5 h-5" />}
              placeholder="••••••••"
              showPasswordToggle
              variant="glass"
            />
            
            <div className="flex gap-3 pt-4">
              <AnimatedButton
                variant="primary"
                className="flex-1"
                glow
              >
                Войти
              </AnimatedButton>
              <AnimatedButton
                variant="ghost"
                className="flex-1"
                onClick={() => setIsModalOpen(false)}
              >
                Отмена
              </AnimatedButton>
            </div>
          </div>
        </EnhancedModal>
      </section>

      {/* Inputs Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">
          <GradientText>Поля ввода</GradientText>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          <AnimatedInput
            label="Email"
            type="email"
            icon={<Mail className="w-5 h-5" />}
            placeholder="example@email.com"
            hint="Введите ваш email адрес"
            variant="glass"
          />
          
          <AnimatedInput
            label="Пароль"
            type="password"
            icon={<Lock className="w-5 h-5" />}
            placeholder="••••••••"
            showPasswordToggle
            variant="glass"
          />
          
          <AnimatedInput
            label="С ошибкой"
            type="text"
            error="Это поле обязательно"
            variant="glass"
          />
          
          <AnimatedInput
            label="С успехом"
            type="text"
            success="Отлично!"
            variant="glass"
          />
        </div>
        
        <div className="max-w-4xl">
          <AnimatedTextarea
            label="Сообщение"
            placeholder="Введите ваше сообщение..."
            autoResize
            maxLength={500}
            variant="glass"
          />
        </div>
      </section>

      {/* Toast Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">
          <GradientText>Уведомления</GradientText>
        </h2>
        
        <div className="flex flex-wrap gap-4">
          <AnimatedButton
            variant="success"
            onClick={() => success('Успешно!', 'Операция выполнена успешно')}
          >
            Success Toast
          </AnimatedButton>
          
          <AnimatedButton
            variant="danger"
            onClick={() => error('Ошибка!', 'Что-то пошло не так')}
          >
            Error Toast
          </AnimatedButton>
          
          <AnimatedButton
            variant="primary"
            onClick={() => info('Информация', 'Это информационное сообщение')}
          >
            Info Toast
          </AnimatedButton>
          
          <AnimatedButton
            variant="secondary"
            onClick={() => warning('Внимание!', 'Это предупреждение')}
          >
            Warning Toast
          </AnimatedButton>
        </div>

        <ToastContainer
          toasts={toasts}
          onClose={removeToast}
          position="top-right"
        />
      </section>

      {/* Sync Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">
          <GradientText>Синхронизация</GradientText>
        </h2>
        
        <div className="flex flex-wrap gap-6 items-center">
          <SyncIndicator status={syncStatus} showLabel size="lg" />
          
          <ConnectionStatus
            isOnline={true}
            lastSync={new Date()}
          />
          
          <AnimatedButton
            variant="primary"
            onClick={handleSync}
            disabled={syncStatus === 'syncing'}
          >
            Запустить синхронизацию
          </AnimatedButton>
        </div>
        
        {syncStatus === 'syncing' && (
          <div className="max-w-md">
            <SyncProgress
              progress={progress}
              label="Синхронизация данных"
              showPercentage
            />
          </div>
        )}
      </section>

      {/* Cards Section */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">
          <GradientText>Карточки</GradientText>
        </h2>
        
        <CardGrid columns={4} gap="lg">
          <StatCard
            label="Пользователи"
            value="1,234"
            trend="up"
            trendValue="+12%"
            icon={<Users className="w-6 h-6" />}
          />
          
          <StatCard
            label="Лайки"
            value="5,678"
            trend="up"
            trendValue="+8%"
            icon={<Heart className="w-6 h-6" />}
          />
          
          <StatCard
            label="Рейтинг"
            value="4.8"
            trend="neutral"
            trendValue="0%"
            icon={<Star className="w-6 h-6" />}
          />
          
          <StatCard
            label="Конверсия"
            value="3.2%"
            trend="down"
            trendValue="-2%"
            icon={<TrendingUp className="w-6 h-6" />}
          />
        </CardGrid>
        
        <CardGrid columns={3} gap="lg">
          <FeatureCard
            icon={<Zap className="w-8 h-8" />}
            title="Быстро"
            description="Молниеносная скорость работы и отклика"
          />
          
          <FeatureCard
            icon={<Sparkles className="w-8 h-8" />}
            title="Красиво"
            description="Современный дизайн с анимациями"
          />
          
          <FeatureCard
            icon={<Heart className="w-8 h-8" />}
            title="Удобно"
            description="Интуитивный и понятный интерфейс"
          />
        </CardGrid>
        
        <div className="max-w-sm mx-auto">
          <ProfileCard
            avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=demo"
            name="Иван Иванов"
            role="Frontend Developer"
            bio="Создаю красивые и функциональные интерфейсы"
            stats={[
              { label: 'Проекты', value: 42 },
              { label: 'Подписчики', value: 1234 },
              { label: 'Лайки', value: 5678 },
            ]}
            actions={
              <div className="flex gap-2">
                <AnimatedButton variant="primary" className="flex-1" size="sm">
                  Подписаться
                </AnimatedButton>
                <AnimatedButton variant="ghost" className="flex-1" size="sm">
                  Сообщение
                </AnimatedButton>
              </div>
            }
          />
        </div>
      </section>

      {/* Text Animations */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">
          <GradientText>Текстовые анимации</GradientText>
        </h2>
        
        <div className="space-y-4">
          <AnimatedText
            text="Fade анимация"
            animation="fade"
            className="text-2xl font-bold text-white"
          />
          
          <AnimatedText
            text="Slide анимация"
            animation="slide"
            className="text-2xl font-bold text-white"
          />
          
          <AnimatedText
            text="Typewriter эффект"
            animation="typewriter"
            className="text-2xl font-bold text-white"
            duration={2000}
          />
          
          <AnimatedText
            text="Wave анимация"
            animation="wave"
            className="text-2xl font-bold text-white"
          />
          
          <div className="text-2xl font-bold">
            <GradientText animate>
              Градиентный анимированный текст
            </GradientText>
          </div>
        </div>
      </section>

      {/* Different Card Variants */}
      <section className="space-y-6">
        <h2 className="text-3xl font-bold text-white">
          <GradientText>Варианты карточек</GradientText>
        </h2>
        
        <CardGrid columns={2} gap="lg">
          <AnimatedCard variant="default" hover="lift" animation="slide">
            <h3 className="text-xl font-bold text-white mb-2">Default Card</h3>
            <p className="text-gray-400">Стандартная карточка с lift эффектом</p>
          </AnimatedCard>
          
          <AnimatedCard variant="glass" hover="tilt" animation="scale">
            <h3 className="text-xl font-bold text-white mb-2">Glass Card</h3>
            <p className="text-gray-400">Стеклянная карточка с 3D tilt эффектом</p>
          </AnimatedCard>
          
          <AnimatedCard variant="gradient" hover="glow" animation="flip">
            <h3 className="text-xl font-bold text-white mb-2">Gradient Card</h3>
            <p className="text-gray-400">Градиентная карточка с glow эффектом</p>
          </AnimatedCard>
          
          <AnimatedCard variant="neon" hover="scale" animation="fade">
            <h3 className="text-xl font-bold text-white mb-2">Neon Card</h3>
            <p className="text-gray-400">Неоновая карточка с scale эффектом</p>
          </AnimatedCard>
        </CardGrid>
      </section>
    </div>
  );
};

export default UIDemo;
