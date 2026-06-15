import { forwardRef } from 'react';
import { Smile } from 'lucide-react';

interface EmojiBarProps {
  showMediaPicker: boolean;
  onTogglePicker: () => void;
}

const EmojiBar = forwardRef<HTMLButtonElement, EmojiBarProps>(
  ({ showMediaPicker, onTogglePicker }, ref) => {
    return (
      <button
        ref={ref}
        onClick={onTogglePicker}
        data-mediapicker-anchor
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 flex-shrink-0 ${
          showMediaPicker
            ? 'text-yellow-400 bg-yellow-400/10'
            : 'text-white/35 hover:text-white/70 hover:bg-white/[0.06]'
        }`}
        title="Эмодзи, стикеры и GIF"
      >
        <Smile size={19} />
      </button>
    );
  }
);

EmojiBar.displayName = 'EmojiBar';

export default EmojiBar;
