import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Camera, FileImage, FileText, BarChart3, MapPin, Smile, User } from 'lucide-react';

interface AttachMenuProps {
  onClose: () => void;
  onSelectFile: () => void;
  onSelectImage: () => void;
  onSelectCamera: () => void;
  onSelectPoll: () => void;
  onSelectLocation: () => void;
  onSelectSticker?: () => void;
  onSelectContact?: () => void;
}

export default function AttachMenu({
  onClose,
  onSelectFile,
  onSelectImage,
  onSelectCamera,
  onSelectPoll,
  onSelectLocation,
  onSelectSticker,
  onSelectContact,
}: AttachMenuProps) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const items = [
    { icon: FileImage, label: 'Фото', onClick: onSelectImage, color: 'from-blue-500 to-cyan-500', glow: 'shadow-blue-500/25' },
    { icon: Camera, label: 'Камера', onClick: onSelectCamera, color: 'from-violet-500 to-purple-500', glow: 'shadow-violet-500/25' },
    ...(onSelectSticker ? [{ icon: Smile, label: 'Стикеры', onClick: onSelectSticker, color: 'from-amber-500 to-orange-500', glow: 'shadow-amber-500/25' }] : []),
    { icon: FileText, label: 'Файл', onClick: onSelectFile, color: 'from-zinc-400 to-zinc-500', glow: 'shadow-zinc-400/25' },
    { icon: BarChart3, label: 'Опрос', onClick: onSelectPoll, color: 'from-emerald-500 to-teal-500', glow: 'shadow-emerald-500/25' },
    { icon: MapPin, label: 'Локация', onClick: onSelectLocation, color: 'from-rose-500 to-pink-500', glow: 'shadow-rose-500/25' },
    ...(onSelectContact ? [{ icon: User, label: 'Контакт', onClick: onSelectContact, color: 'from-indigo-500 to-blue-500', glow: 'shadow-indigo-500/25' }] : []),
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={isMobile ? { opacity: 0, y: 80 } : { opacity: 0, y: 30, scale: 0.96 }}
        animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, scale: 1 }}
        exit={isMobile ? { opacity: 0, y: 80 } : { opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
        className={isMobile ? 'fixed bottom-0 left-0 right-0 z-[101]' : 'absolute bottom-20 left-1/2 -translate-x-1/2 w-[340px] max-w-[calc(100%-32px)]'}
        onClick={e => e.stopPropagation()}
      >
        <div className={`relative overflow-hidden ${
          isMobile ? 'rounded-t-[1.75rem] pb-[env(safe-area-inset-bottom)]' : 'rounded-[1.75rem]'
        }`}>
          <div className="absolute inset-0 bg-[#141418]/95 backdrop-blur-3xl" />
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.04] to-transparent pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <h3 className="text-[13px] font-semibold text-white/90 tracking-wide">Прикрепить</h3>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-white/8 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/12 transition-all duration-200"
              >
                <X size={13} />
              </button>
            </div>

            <div className={`px-3 pb-3 grid gap-1.5 ${isMobile ? 'grid-cols-4 max-h-[45vh] overflow-y-auto pb-4' : 'grid-cols-4'}`}>
              {items.map((item, i) => (
                <motion.button
                  key={item.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.025, duration: 0.2 }}
                  onClick={() => {
                    item.onClick();
                    if (item.label !== 'Локация') {
                      onClose();
                    }
                  }}
                  className="flex flex-col items-center gap-2 py-3 px-1 rounded-2xl hover:bg-white/[0.06] active:bg-white/[0.03] transition-all duration-150 group"
                >
                  <div className={`w-11 h-11 rounded-[0.85rem] bg-gradient-to-br ${item.color} ${item.glow} flex items-center justify-center text-white shadow-lg group-hover:scale-110 group-active:scale-95 transition-transform duration-200`}>
                    <item.icon size={19} strokeWidth={2} />
                  </div>
                  <span className="text-[11px] font-medium text-white/50 group-hover:text-white/80 transition-colors duration-150 leading-none">
                    {item.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
