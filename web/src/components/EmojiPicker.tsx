import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useLang } from '../lib/i18n';
import BottomSheet from './BottomSheet';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const { lang } = useLang();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const pickerContent = (
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
  );

  // Мобильная версия — шторка
  if (isMobile) {
    return createPortal(
      <BottomSheet isOpen={true} onClose={onClose} title="Эмодзи" maxHeight="70vh">
        {pickerContent}
      </BottomSheet>,
      document.body
    );
  }

  // Десктоп — popup
  return createPortal(
    <>
      <div className="fixed inset-0 z-[99990]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.15 }}
        className="fixed z-[99991] rounded-2xl shadow-2xl border border-white/10 bg-[#111113] overflow-hidden flex flex-col bottom-20 left-1/2 -translate-x-1/2 w-[360px] max-h-[480px]"
        onClick={e => e.stopPropagation()}
      >
        {pickerContent}
      </motion.div>
    </>,
    document.body
  );
}
