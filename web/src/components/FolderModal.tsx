import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Folder, Check } from 'lucide-react';

interface FolderModalProps {
  onClose: () => void;
  onSave: (data: { name: string; icon: string; color: string }) => void;
  initialData?: { name: string; icon: string; color: string };
  title?: string;
}

const FOLDER_ICONS = ['📁', '📂', '🗂️', '📋', '📌', '⭐', '❤️', '💼', '🎯', '🔥', '✨', '🎨', '🎵', '🎮', '📱', '💻'];

const FOLDER_COLORS = [
  { name: 'Синий', value: '#6366f1' },
  { name: 'Фиолетовый', value: '#a855f7' },
  { name: 'Розовый', value: '#ec4899' },
  { name: 'Красный', value: '#ef4444' },
  { name: 'Оранжевый', value: '#f97316' },
  { name: 'Жёлтый', value: '#eab308' },
  { name: 'Зелёный', value: '#22c55e' },
  { name: 'Бирюзовый', value: '#14b8a6' },
  { name: 'Голубой', value: '#3b82f6' },
  { name: 'Серый', value: '#6b7280' },
];

export default function FolderModal({ onClose, onSave, initialData, title = 'Создать папку' }: FolderModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [icon, setIcon] = useState(initialData?.icon || '📁');
  const [color, setColor] = useState(initialData?.color || '#6366f1');

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), icon, color });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-md rounded-2xl bg-surface-secondary border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder size={20} className="text-nexo-400" />
            <h3 className="text-lg font-semibold text-white">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Название */}
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Название папки</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Работа"
              maxLength={30}
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-500 focus:outline-none focus:border-nexo-500/50 transition-colors"
              autoFocus
            />
            <div className="mt-1 text-xs text-zinc-500 text-right">{name.length}/30</div>
          </div>

          {/* Иконка */}
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Иконка</label>
            <div className="grid grid-cols-8 gap-2">
              {FOLDER_ICONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setIcon(emoji)}
                  className={`aspect-square rounded-lg flex items-center justify-center text-2xl transition-all ${
                    icon === emoji
                      ? 'bg-nexo-500/20 ring-2 ring-nexo-500 scale-110'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Цвет */}
          <div>
            <label className="text-xs text-zinc-500 mb-1.5 block">Цвет</label>
            <div className="grid grid-cols-5 gap-2">
              {FOLDER_COLORS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setColor(c.value)}
                  className={`aspect-square rounded-lg transition-all relative ${
                    color === c.value ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                >
                  {color === c.value && (
                    <Check size={16} className="absolute inset-0 m-auto text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Превью */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <div className="text-xs text-zinc-500 mb-2">Превью:</div>
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                style={{ backgroundColor: color + '20', color }}
              >
                {icon}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-white">{name || 'Название папки'}</div>
                <div className="text-xs text-zinc-500">0 чатов</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-2.5 rounded-xl bg-nexo-500 hover:bg-nexo-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium transition-colors"
          >
            {initialData ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
