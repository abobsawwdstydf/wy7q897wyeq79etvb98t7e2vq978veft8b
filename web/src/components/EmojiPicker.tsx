import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useLang } from '../lib/i18n';
import { X } from 'lucide-react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const { lang } = useLang();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99990]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15 }}
        className={`fixed z-[99991] rounded-2xl shadow-2xl border border-white/10 bg-[#111113] overflow-hidden flex flex-col ${
          isMobile ? 'bottom-0 left-0 right-0 rounded-t-2xl max-h-[70vh]' : 'bottom-20 left-1/2 -translate-x-1/2 w-[360px] max-h-[480px]'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header for mobile */}
        {isMobile && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <h3 className="text-sm font-semibold text-white">Эмодзи</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Emoji picker */}
        <div className="flex-1 overflow-hidden">
          <Picker
            data={data}
            onEmojiSelect={(e: { native: string }) => {
              onSelect(e.native);
              onClose();
            }}
            theme="dark"
            locale={lang === 'ru' ? 'ru' : 'en'}
            set="native"
            previewPosition="none"
            skinTonePosition="search"
            perLine={9}
            emojiSize={28}
            emojiButtonSize={36}
            maxFrequentRows={2}
            navPosition="bottom"
            dynamicWidth={false}
          />
        </div>
      </motion.div>
    </>,
    document.body
  );
}
