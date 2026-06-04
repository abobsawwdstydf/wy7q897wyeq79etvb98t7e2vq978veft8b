import { motion } from 'framer-motion';
import { Loader2, Sparkles } from 'lucide-react';

/**
 * Loading States Components
 * Beautiful loading indicators and spinners
 */

// Нексо Loader (используется в App.tsx)
export function НексоLoader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: { outer: 32, middle: 28, inner: 24 },
    md: { outer: 48, middle: 44, inner: 40 },
    lg: { outer: 64, middle: 60, inner: 56 },
  };

  const { outer, middle, inner } = sizes[size];

  return (
    <div className="relative" style={{ width: outer, height: outer }}>
      <div
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-nexo-500 animate-spin"
        style={{ width: outer, height: outer }}
      />
      <div
        className="absolute rounded-full border-2 border-transparent border-t-nexo-400 animate-spin"
        style={{
          width: middle,
          height: middle,
          top: (outer - middle) / 2,
          left: (outer - middle) / 2,
          animationDuration: '0.8s',
          animationDirection: 'reverse',
        }}
      />
      <div
        className="absolute rounded-full border-2 border-transparent border-t-nexo-300 animate-spin"
        style={{
          width: inner,
          height: inner,
          top: (outer - inner) / 2,
          left: (outer - inner) / 2,
          animationDuration: '0.6s',
        }}
      />
    </div>
  );
}

// Alias for Latin import
export const NexoLoader = НексоLoader;

// Simple Spinner
export function Spinner({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <Loader2 size={size} className={`animate-spin ${className}`} />
  );
}

// Dots Loader
export function DotsLoader({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  const dotSize = dotSizes[size];

  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className={`${dotSize} rounded-full bg-nexo-500`}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
}

// Pulse Loader
export function PulseLoader() {
  return (
    <div className="relative w-12 h-12">
      <motion.div
        className="absolute inset-0 rounded-full bg-nexo-500/30"
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.6, 0, 0.6],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
        }}
      />
      <motion.div
        className="absolute inset-2 rounded-full bg-nexo-500/50"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.8, 0, 0.8],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          delay: 0.5,
        }}
      />
      <div className="absolute inset-4 rounded-full bg-nexo-500" />
    </div>
  );
}

// Progress Bar
export function ProgressBar({ progress = 0, className = '' }: { progress?: number; className?: string }) {
  return (
    <div className={`w-full h-1 bg-white/10 rounded-full overflow-hidden ${className}`}>
      <motion.div
        className="h-full bg-gradient-to-r from-nexo-500 to-purple-600 rounded-full"
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}

// Indeterminate Progress Bar
export function IndeterminateProgress({ className = '' }: { className?: string }) {
  return (
    <div className={`w-full h-1 bg-white/10 rounded-full overflow-hidden ${className}`}>
      <motion.div
        className="h-full w-1/3 bg-gradient-to-r from-nexo-500 to-purple-600 rounded-full"
        animate={{
          x: ['-100%', '400%'],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}

// Skeleton Pulse (alternative to shimmer)
export function SkeletonPulse({ className = '' }: { className?: string }) {
  return (
    <motion.div
      className={`bg-white/5 rounded ${className}`}
      animate={{
        opacity: [0.5, 1, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
      }}
    />
  );
}

// Loading Overlay
export function LoadingOverlay({ message = 'Загрузка...' }: { message?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-strong rounded-2xl p-8 flex flex-col items-center gap-4"
      >
        <НексоLoader size="lg" />
        <p className="text-white text-sm font-medium">{message}</p>
      </motion.div>
    </motion.div>
  );
}

// AI Thinking Indicator
export function AIThinking() {
  return (
    <div className="flex items-center gap-2 px-4 py-2 rounded-xl glass-subtle">
      <motion.div
        animate={{
          rotate: [0, 360],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'linear',
        }}
      >
        <Sparkles size={16} className="text-nexo-400" />
      </motion.div>
      <span className="text-sm text-zinc-400">AI думает</span>
      <DotsLoader size="sm" />
    </div>
  );
}

// Typing Indicator (for chat)
export function TypingIndicator({ name = 'Пользователь' }: { name?: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
        <DotsLoader size="sm" />
      </div>
      <span className="text-xs text-zinc-500">{name} печатает...</span>
    </div>
  );
}

// Upload Progress
export function UploadProgress({ progress = 0, fileName = 'Файл' }: { progress?: number; fileName?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="glass-card p-4 rounded-xl"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white truncate flex-1">{fileName}</span>
        <span className="text-xs text-zinc-500 ml-2">{Math.round(progress)}%</span>
      </div>
      <ProgressBar progress={progress} />
    </motion.div>
  );
}

// Connecting Indicator
export function ConnectingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="glass-toast px-4 py-2 rounded-full flex items-center gap-2">
        <Spinner size={14} className="text-yellow-500" />
        <span className="text-sm text-white">Подключение...</span>
      </div>
    </motion.div>
  );
}

// Success Checkmark Animation
export function SuccessCheckmark({ size = 64 }: { size?: number }) {
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{
        type: 'spring',
        stiffness: 260,
        damping: 20,
      }}
      className="relative"
      style={{ width: size, height: size }}
    >
      <motion.div
        className="absolute inset-0 rounded-full bg-green-500/20"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.2, 1] }}
        transition={{ duration: 0.5 }}
      />
      <motion.svg
        viewBox="0 0 24 24"
        className="absolute inset-0 text-green-500"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <motion.path
          d="M5 13l4 4L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </motion.div>
  );
}
