import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Paperclip,
  X,
  Reply,
  Pencil,
  FileText,
  Check,
  Video,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useLang } from '../lib/i18n';
import { AUDIO_EXTENSIONS, MAX_FILE_SIZE } from '../lib/types';
import { playSendSound } from '../lib/sounds';
import type { Attachment } from './input/types';
import VoiceRecorder from './input/VoiceRecorder';
import AttachmentBar from './input/AttachmentBar';
import SchedulePicker from './input/SchedulePicker';
import MentionSuggestions from './input/MentionSuggestions';
import EmojiBar from './input/EmojiBar';
import CameraModal from './CameraModal';
import AttachMenu from './AttachMenu';
import PollModal from './PollModal';
import LocationModal from './LocationModal';
import VideoNoteRecorder from './VideoNoteRecorder';
import MediaPicker from './MediaPicker';
import StickerPicker from './StickerPicker';
import ContactCardModal from './ContactCardModal';
import TemplatesModal from './TemplatesModal';
import QuickReplyModal from './QuickReplyModal';

interface MessageInputProps {
  chatId: string;
}

export default function MessageInput({ chatId }: MessageInputProps) {
  const { user } = useAuthStore();
  const { t } = useLang();
  const { replyTo, editingMessage, setReplyTo, setEditingMessage, getDraft, setDraft, chats } = useChatStore();
  const [text, setText] = useState(() => getDraft(chatId));

  const chat = chats.find(c => c.id === chatId);
  const chatMembers = (chat?.members || []).filter((m) => m.user.id !== user?.id);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleHour, setScheduleHour] = useState('12');
  const [scheduleMinute, setScheduleMinute] = useState('00');
  const [scheduleCalDate, setScheduleCalDate] = useState('');
  const [scheduleCalMonth, setScheduleCalMonth] = useState(new Date().getMonth());
  const [scheduleCalYear, setScheduleCalYear] = useState(new Date().getFullYear());
  const [scheduleToast, setScheduleToast] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showAttachMenu, setShowAttachMenuState] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const [showContactCard, setShowContactCard] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const attachmentsScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [showGrammarCheck, setShowGrammarCheck] = useState(false);
  const [grammarResult, setGrammarResult] = useState<{ corrected: string; hasChanges: boolean; original: string } | null>(null);
  const [showQuickReplies, setShowQuickReplies] = useState(false);

  const [recordMode, setRecordMode] = useState<'voice' | 'video'>('voice');
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const filteredMembers = mentionQuery !== null && (chat?.type === 'group')
    ? chatMembers.filter((m) => {
        const q = mentionQuery.toLowerCase();
        return m.user.displayName.toLowerCase().includes(q) || m.user.username.toLowerCase().includes(q);
      }).slice(0, 6)
    : [];

  const insertMention = (member: { user: { username: string } }) => {
    const el = inputRef.current;
    if (!el) return;
    const cursorPos = el.selectionStart;
    const before = text.substring(0, cursorPos);
    const after = text.substring(cursorPos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) return;
    const newText = before.substring(0, atIdx) + `@${member.user.username} ` + after;
    setText(newText);
    setDraft(chatId, newText);
    setMentionQuery(null);
    setMentionIndex(0);
    setTimeout(() => {
      el.focus();
      const newPos = atIdx + member.user.username.length + 2;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const emojiAnchorRef = useRef<HTMLButtonElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }
  }, [text]);

  useEffect(() => {
    if (editingMessage?.content) {
      setText(editingMessage.content);
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  useEffect(() => {
    if (!editingMessage) {
      setText(getDraft(chatId));
    }
  }, [chatId]);

  useEffect(() => {
    return () => {
      attachments.forEach(att => {
        if (att.preview) URL.revokeObjectURL(att.preview);
      });
    };
  }, []);

  const emitTyping = useCallback(() => {
    const socket = getSocket();
    if (!socket) return;
    socket.emit('typing_start', chatId);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop', chatId);
    }, 2000);
  }, [chatId]);

  const handleSend = async (scheduledAt?: string) => {
    const trimmed = text.trim();
    const hasAttachments = attachments.length > 0;

    if (!trimmed && !hasAttachments) return;
    if (isSending) return;

    playSendSound();

    const socket = getSocket();
    if (!socket) return;

    socket.emit('typing_stop', chatId);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    if (editingMessage) {
      socket.emit('edit_message', {
        messageId: editingMessage.id,
        content: trimmed,
        chatId,
      });
      setEditingMessage(null);
      setText('');
      setDraft(chatId, '');
      return;
    }

    if (hasAttachments) {
      setIsSending(true);
      try {
        const uploadPromises = attachments.map(att => api.uploadFile(att.file));
        const results = await Promise.all(uploadPromises);

        for (let i = 0; i < results.length; i++) {
          if (!results[i] || !results[i].url) {
            throw new Error(`Файл ${attachments[i].file.name} не загрузился`);
          }
        }

        const firstResult = results[0];
        const mediaType = firstResult.mimetype.startsWith('image/') ? 'image'
          : firstResult.mimetype.startsWith('video/') ? 'video'
          : firstResult.mimetype.startsWith('audio/') ? 'audio'
          : 'file';

        const media = results.map((result, index) => ({
          type: result.mimetype.startsWith('image/') ? 'image'
            : result.mimetype.startsWith('video/') ? 'video'
            : result.mimetype.startsWith('audio/') ? 'audio'
            : 'file',
          url: result.url,
          filename: result.filename || attachments[index].file.name,
          size: result.size || attachments[index].file.size,
          duration: result.duration,
        }));

        socket.emit('send_message', {
          chatId,
          content: trimmed || null,
          type: attachments.length > 1 ? 'album' : mediaType,
          mediaUrl: firstResult.url,
          mediaType: mediaType,
          fileName: firstResult.filename || attachments[0].file.name,
          fileSize: firstResult.size || attachments[0].file.size,
          replyToId: replyTo?.id || null,
          quote: replyTo?.quote || null,
          albumCount: attachments.length,
          media: attachments.length > 1 ? media : undefined,
          ...(scheduledAt ? { scheduledAt } : {}),
        });

        setReplyTo(null);
        clearAttachments();
      } catch (e) {
        console.error('Ошибка загрузки файлов:', e);
        alert('Ошибка загрузки файлов: ' + (e instanceof Error ? e.message : 'Неизвестная ошибка'));
      } finally {
        setIsSending(false);
      }
    } else {
      socket.emit('send_message', {
        chatId,
        content: trimmed,
        type: 'text',
        replyToId: replyTo?.id || null,
        quote: replyTo?.quote || null,
        ...(scheduledAt ? { scheduledAt } : {}),
      });
      setReplyTo(null);
    }

    setText('');
    setDraft(chatId, '');
  };

  const handleSendSticker = (sticker: any) => {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('send_message', {
      chatId,
      content: null,
      type: 'sticker',
      mediaUrl: sticker.url,
      replyToId: replyTo?.id || null,
    });

    setReplyTo(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      setShowQuickReplies(true);
      return;
    }

    if (e.key === '/' && text === '') {
      e.preventDefault();
      setShowQuickReplies(true);
      return;
    }

    if (mentionQuery !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % filteredMembers.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + filteredMembers.length) % filteredMembers.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredMembers[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearAttachments = () => {
    attachments.forEach(att => {
      if (att.preview) URL.revokeObjectURL(att.preview);
    });
    setAttachments([]);
  };

  const removeAttachment = (index: number) => {
    const att = attachments[index];
    if (att.preview) URL.revokeObjectURL(att.preview);
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const addAttachment = (file: File, type: 'image' | 'video' | 'file' | 'audio', preview?: string) => {
    setAttachments(prev => {
      if (prev.length >= 1200) {
        alert(t('tooManyFiles'));
        return prev;
      }
      return [...prev, { file, preview, type }];
    });
  };

  const handleCameraCapture = (file: File, type: 'image' | 'video') => {
    const preview = type === 'image' ? URL.createObjectURL(file) : undefined;
    addAttachment(file, type, preview);
    setShowCamera(false);
  };

  const handlePollSend = (poll: { question: string; options: string[]; multiple: boolean; quiz: boolean }) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('send_message', {
        chatId,
        content: JSON.stringify(poll),
        type: 'poll',
        replyToId: replyTo?.id || null,
      });
      setReplyTo(null);
    }
  };

  const handleLocationSend = (location: { lat: number; lng: number; accuracy: number; name?: string }) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('send_message', {
        chatId,
        content: JSON.stringify(location),
        type: 'location',
        replyToId: replyTo?.id || null,
      });
      setReplyTo(null);
    }
  };

  const handleContactSend = (contact: { userId: string; name: string; phone?: string; position?: string; avatarUrl?: string }) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('send_message', {
        chatId,
        content: JSON.stringify(contact),
        type: 'contact',
        replyToId: replyTo?.id || null,
      });
      setReplyTo(null);
    }
  };

  const handleTemplateInsert = (templateText: string) => {
    setText(prev => prev + templateText);
    setDraft(chatId, text + templateText);
    setShowTemplates(false);
    inputRef.current?.focus();
  };

  const handleStickerInsert = (sticker: any) => {
    const hasContent = text.trim().length > 0;

    if (!hasContent) {
      handleStickerSend(sticker);
      setShowStickers(false);
      return;
    }

    const stickerCode = `[sticker:${sticker.id}:${sticker.fileUrl}]`;
    const cursorPos = inputRef.current?.selectionStart || text.length;
    const newText = text.slice(0, cursorPos) + stickerCode + text.slice(cursorPos);
    setText(newText);
    setDraft(chatId, newText);
    inputRef.current?.focus();
    setTimeout(() => {
      if (inputRef.current) {
        const newPos = cursorPos + stickerCode.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleStickerSend = async (sticker: any) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('send_message', {
        chatId,
        content: null,
        type: 'sticker',
        mediaUrl: sticker.fileUrl,
        mediaType: 'sticker',
        fileName: `sticker_${sticker.id}.${sticker.isAnimated ? 'gif' : 'png'}`,
        fileSize: sticker.fileSize,
        replyToId: replyTo?.id || null,
      });
      setReplyTo(null);
    }
  };

  const handleGifSend = async (gif: any) => {
    const socket = getSocket();
    if (socket) {
      socket.emit('send_message', {
        chatId,
        content: gif.title || null,
        type: 'gif',
        mediaUrl: gif.url,
        mediaType: 'gif',
        fileName: `gif_${gif.id}.gif`,
        fileSize: 0,
        replyToId: replyTo?.id || null,
      });
      setReplyTo(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        alert(t('fileTooLarge'));
        return;
      }
      const isAudio = file.type.startsWith('audio/') || AUDIO_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
      addAttachment(file, isAudio ? 'audio' : 'file');
    });
    e.target.value = '';
    setShowAttachMenuState(false);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const isVideo = file.type.startsWith('video/');
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
      addAttachment(file, isVideo ? 'video' : 'image', preview);
    });
    e.target.value = '';
    setShowAttachMenuState(false);
  };

  const startVoiceRecording = () => {
    setIsRecording(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];

      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name}: файл слишком большой (макс. ${(MAX_FILE_SIZE / 1024 / 1024 / 1024).toFixed(1)} ГБ)`);
        return;
      }

      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma', '.opus'];
      const isAudio = file.type.startsWith('audio/') || audioExts.some(ext => file.name.toLowerCase().endsWith(ext));

      const type = isImage ? 'image' : isVideo ? 'video' : isAudio ? 'audio' : 'file';
      const preview = isImage ? URL.createObjectURL(file) : undefined;

      addAttachment(file, type, preview);
      inputRef.current?.focus();
    }
  };

  const hasContent = text.trim() || attachments.length > 0;

  const checkGrammar = async () => {
    if (!text.trim()) return;

    setShowGrammarCheck(true);
    try {
      const response = await api.checkGrammar(text);
      setGrammarResult(response);
    } catch (error) {
      console.error('Ошибка проверки грамматики:', error);
      setGrammarResult(null);
    }
  };

  const applyGrammarFix = () => {
    if (grammarResult?.corrected) {
      setText(grammarResult.corrected);
      setDraft(chatId, grammarResult.corrected);
    }
    setShowGrammarCheck(false);
    setGrammarResult(null);
  };

  return (
    <div
      className="z-10 px-6 pt-2 pb-6 flex-shrink-0 bg-transparent relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 rounded-[2rem] mx-6 mb-6 mt-2 bg-nexo-500/10 border-2 border-dashed border-nexo-400 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-2 text-nexo-300">
              <FileText size={32} className="animate-bounce" />
              <p className="font-semibold">{t('dropFileHere')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(replyTo || editingMessage) && (
          <motion.div
            initial={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
            animate={{ height: 'auto', opacity: 1, y: 0, scale: 1 }}
            exit={{ height: 0, opacity: 0, y: 10, scale: 0.95 }}
            className="mb-2 max-w-3xl mx-auto overflow-hidden px-1.5"
          >
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-2xl relative shadow-xl">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3/5 bg-gradient-to-b from-nexo-400 to-purple-500 rounded-r-md" />
              <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0">
                {editingMessage ? (
                  <Pencil size={12} className="text-nexo-400" />
                ) : (
                  <Reply size={12} className="text-nexo-400" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-xs font-semibold text-nexo-400 mb-0.5">
                  {editingMessage
                    ? t('editing')
                    : `${t('replyTo')} ${replyTo?.sender?.displayName || replyTo?.sender?.username || ''}`}
                </p>
                <div className="text-xs text-zinc-300 truncate opacity-80 border-l border-white/20 pl-2 ml-1">
                  {replyTo?.quote ? `«${replyTo.quote}»` : (editingMessage || replyTo)?.content || t('media') || 'Медиа'}
                </div>
              </div>
              <button
                onClick={() => {
                  setReplyTo(null);
                  setEditingMessage(null);
                  setText('');
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {attachments.length > 0 && (
          <AttachmentBar
            attachments={attachments}
            isSending={isSending}
            onRemove={removeAttachment}
            t={t as (key: string) => string}
          />
        )}
      </AnimatePresence>

      {isRecording ? (
        <VoiceRecorder
          chatId={chatId}
          replyToId={replyTo?.id}
          onSent={() => setIsRecording(false)}
          onCancel={() => setIsRecording(false)}
        />
      ) : (
        <>
          {/* Inline sticker/emoji panel (Telegram-style) — above input bar */}
          <div className="max-w-3xl mx-auto mb-2">
            <AnimatePresence>
              {showStickerPanel && (
                <MediaPicker
                  inline
                  onClose={() => setShowStickerPanel(false)}
                  onSelectEmoji={(emoji) => {
                    const el = inputRef.current;
                    if (!el) return;
                    const cursorPos = el.selectionStart;
                    const before = text.substring(0, cursorPos);
                    const after = text.substring(cursorPos);
                    setText(before + emoji + after);
                    setTimeout(() => {
                      el.focus();
                      const newPos = cursorPos + emoji.length;
                      el.setSelectionRange(newPos, newPos);
                    }, 0);
                  }}
                  onSendSticker={handleStickerSend}
                  onSendGif={handleGifSend}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Mobile layout */}
          <div className="flex items-end justify-center max-w-3xl mx-auto sm:hidden px-2 pb-2">
            <div className="flex-1 max-w-2xl bg-[#1a1a1f]/90 backdrop-blur-xl border border-white/[0.08] rounded-[2rem] px-1.5 py-1.5 flex items-center gap-0.5 focus-within:border-white/[0.15] transition-all duration-200 shadow-lg shadow-black/20">
              <EmojiBar ref={emojiAnchorRef} showMediaPicker={showStickerPanel} onTogglePicker={() => setShowStickerPanel(prev => !prev)} />

              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setDraft(chatId, e.target.value);
                  emitTyping();
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('message')}
                rows={1}
                className="flex-1 bg-transparent text-white placeholder-white/25 resize-none outline-none max-h-[120px] overflow-y-auto scrollbar-hide text-[15px] leading-relaxed px-2 py-1.5"
                style={{ minHeight: '28px' }}
              />

              <button
                onClick={() => setShowAttachMenuState(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/35 hover:text-white/70 hover:bg-white/[0.06] transition-all duration-150 flex-shrink-0"
                title="Прикрепить"
              >
                <Paperclip size={17} />
              </button>

              <button
                onMouseDown={() => {
                  const timer = setTimeout(() => {
                    setRecordMode(prev => prev === 'voice' ? 'video' : 'voice');
                  }, 1300);
                  setPressTimer(timer);
                }}
                onMouseUp={() => {
                  if (pressTimer) {
                    clearTimeout(pressTimer);
                    setPressTimer(null);
                  }
                }}
                onTouchStart={() => {
                  const timer = setTimeout(() => {
                    setRecordMode(prev => prev === 'voice' ? 'video' : 'voice');
                  }, 1300);
                  setPressTimer(timer);
                }}
                onTouchEnd={() => {
                  if (pressTimer) {
                    clearTimeout(pressTimer);
                    setPressTimer(null);
                  }
                }}
                onClick={() => {
                  if (hasContent) {
                    handleSend();
                  } else if (recordMode === 'video') {
                    setShowVideoRecorder(true);
                  } else {
                    startVoiceRecording();
                  }
                }}
                disabled={isSending || (!hasContent && isRecording)}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#818cf8] hover:from-[#818cf8] hover:to-[#a5b4fc] flex items-center justify-center transition-all duration-200 flex-shrink-0 disabled:opacity-40 disabled:scale-95 shadow-md shadow-indigo-500/30"
              >
                {isSending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : hasContent ? (
                  <Send size={17} className="text-white" />
                ) : recordMode === 'video' ? (
                  <Video size={17} className="text-white" />
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                )}
              </button>
            </div>
          </div>

          {/* Desktop layout */}
          <div className="hidden sm:flex items-end justify-center gap-3 max-w-3xl mx-auto">
            <div className="flex-1 max-w-2xl bg-[#1a1a1f]/90 backdrop-blur-xl border border-white/[0.08] rounded-[2rem] px-1.5 py-1.5 flex items-center gap-0.5 focus-within:border-white/[0.15] transition-all duration-200 shadow-lg shadow-black/20">
              <EmojiBar ref={emojiAnchorRef} showMediaPicker={showStickerPanel} onTogglePicker={() => setShowStickerPanel(prev => !prev)} />
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setDraft(chatId, e.target.value);
                  emitTyping();
                }}
                onKeyDown={handleKeyDown}
                placeholder={t('message')}
                rows={1}
                className="flex-1 bg-transparent text-white placeholder-white/25 resize-none outline-none max-h-[150px] overflow-y-auto scrollbar-hide px-2 py-1.5 text-[15px] leading-relaxed"
              />
              {text.trim() && (
                <button
                  onClick={checkGrammar}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white/35 hover:text-emerald-400 hover:bg-emerald-400/10 transition-all duration-150 flex-shrink-0"
                  title="Проверить грамматику"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </button>
              )}
              <button
                onClick={() => setShowAttachMenuState(true)}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white/35 hover:text-white/70 hover:bg-white/[0.06] transition-all duration-150 flex-shrink-0"
                title="Прикрепить"
              >
                <Paperclip size={18} />
              </button>

              <button
                onMouseDown={() => {
                  const timer = setTimeout(() => {
                    setRecordMode(prev => prev === 'voice' ? 'video' : 'voice');
                  }, 1300);
                  setPressTimer(timer);
                }}
                onMouseUp={() => {
                  if (pressTimer) {
                    clearTimeout(pressTimer);
                    setPressTimer(null);
                  }
                }}
                onClick={() => {
                  if (hasContent) {
                    handleSend();
                  } else if (recordMode === 'video') {
                    setShowVideoRecorder(true);
                  } else {
                    startVoiceRecording();
                  }
                }}
                disabled={isSending || (!hasContent && isRecording)}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#818cf8] hover:from-[#818cf8] hover:to-[#a5b4fc] flex items-center justify-center transition-all duration-200 flex-shrink-0 disabled:opacity-40 shadow-md shadow-indigo-500/30"
              >
                {isSending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : hasContent ? (
                  <Send size={18} className="text-white" />
                ) : recordMode === 'video' ? (
                  <Video size={18} className="text-white" />
                ) : (
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
                )}
              </button>
            </div>
          </div>

          {/* Mention Suggestions */}
          {mentionQuery !== null && (
            <MentionSuggestions
              members={filteredMembers}
              mentionIndex={mentionIndex}
              onSelect={insertMention}
            />
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleImageChange}
      />

      <AnimatePresence>
        {showSchedule && (
          <SchedulePicker
            calDate={scheduleCalDate}
            setCalDate={setScheduleCalDate}
            calMonth={scheduleCalMonth}
            setCalMonth={setScheduleCalMonth}
            calYear={scheduleCalYear}
            setCalYear={setScheduleCalYear}
            hour={scheduleHour}
            setHour={setScheduleHour}
            minute={scheduleMinute}
            setMinute={setScheduleMinute}
            onSend={(iso) => {
              handleSend(iso);
              setShowSchedule(false);
              setScheduleToast('Сообщение запланировано');
              setTimeout(() => setScheduleToast(null), 3000);
            }}
            t={t}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scheduleToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-emerald-500 text-white text-sm font-medium shadow-lg z-50 flex items-center gap-2"
          >
            <Check size={16} />
            {scheduleToast}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCamera && (
          <CameraModal
            onClose={() => setShowCamera(false)}
            onCapture={handleCameraCapture}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAttachMenu && (
          <AttachMenu
            onClose={() => setShowAttachMenuState(false)}
            onSelectFile={() => fileInputRef.current?.click()}
            onSelectImage={() => imageInputRef.current?.click()}
            onSelectCamera={() => setShowCamera(true)}
            onSelectPoll={() => setShowPoll(true)}
            onSelectLocation={() => setShowLocation(true)}
            onSelectSticker={() => { setShowStickers(true); setShowAttachMenuState(false); }}
            onSelectContact={() => setShowContactCard(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStickers && (
          <StickerPicker
            onClose={() => setShowStickers(false)}
            onSendSticker={(sticker) => {
              handleSendSticker(sticker);
              setShowStickers(false);
            }}
            onInsertSticker={(sticker) => {
              handleStickerInsert(sticker);
              setShowStickers(false);
            }}
            onSendGif={(gif) => {
              handleGifSend(gif);
              setShowStickers(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPoll && (
          <PollModal
            onClose={() => setShowPoll(false)}
            onSend={handlePollSend}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLocation && (
          <LocationModal
            onClose={() => setShowLocation(false)}
            onSend={handleLocationSend}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showContactCard && (
          <ContactCardModal
            chatId={chatId}
            onClose={() => setShowContactCard(false)}
            onSend={(contact) => {
              handleContactSend({
                userId: contact.contact?.id || contact.id,
                name: contact.contact?.displayName || contact.displayName || '',
                phone: contact.contact?.phone || contact.phone,
                avatarUrl: contact.contact?.avatar || contact.avatar,
              });
              setShowContactCard(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTemplates && (
          <TemplatesModal
            onClose={() => setShowTemplates(false)}
            onSelect={handleTemplateInsert}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQuickReplies && (
          <QuickReplyModal
            onClose={() => setShowQuickReplies(false)}
            onSelect={(message) => {
              setText(message);
              setDraft(chatId, message);
              inputRef.current?.focus();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showGrammarCheck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            onClick={() => {
              setShowGrammarCheck(false);
              setGrammarResult(null);
            }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg rounded-2xl bg-surface-secondary border border-white/10 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                  <h3 className="text-lg font-semibold text-white">Проверка грамматики</h3>
                </div>
                <button
                  onClick={() => {
                    setShowGrammarCheck(false);
                    setGrammarResult(null);
                  }}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-4">
                {!grammarResult ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <div className="w-12 h-12 border-4 border-nexo-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-zinc-400">Проверяю текст...</p>
                  </div>
                ) : grammarResult.hasChanges ? (
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Исходный текст:</label>
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-zinc-300">
                        {grammarResult.original}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-500 mb-1 block">Исправленный текст:</label>
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-white">
                        {grammarResult.corrected}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={applyGrammarFix}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors"
                      >
                        Применить исправления
                      </button>
                      <button
                        onClick={() => {
                          setShowGrammarCheck(false);
                          setGrammarResult(null);
                        }}
                        className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-medium transition-colors"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 gap-3">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Check size={24} className="text-emerald-400" />
                    </div>
                    <p className="text-sm text-zinc-300">Ошибок не найдено!</p>
                    <button
                      onClick={() => {
                        setShowGrammarCheck(false);
                        setGrammarResult(null);
                      }}
                      className="mt-2 px-6 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white font-medium transition-colors"
                    >
                      Закрыть
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showVideoRecorder && (
          <VideoNoteRecorder
            chatId={chatId}
            onClose={() => setShowVideoRecorder(false)}
            onSent={() => {
              setShowVideoRecorder(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
