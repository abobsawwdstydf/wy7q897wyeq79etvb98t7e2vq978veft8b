import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Paperclip,
  Smile,
  Mic,
  X,
  Reply,
  Pencil,
  Image as ImageIcon,
  FileText,
  Clock,
  Calendar,
  Check,
  Music,
  Video,
  FileText as TemplateIcon,
} from 'lucide-react';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useLang } from '../lib/i18n';
import { AUDIO_EXTENSIONS, MAX_FILE_SIZE } from '../lib/types';
import { playSendSound } from '../lib/sounds';
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

interface Attachment {
  file: File;
  preview?: string;
  type: 'image' | 'video' | 'file' | 'audio';
}

interface MessageInputProps {
  chatId: string;
}

export default function MessageInput({ chatId }: MessageInputProps) {
  const { user } = useAuthStore();
  const isPremium = useAuthStore(state => state.isPremium());
  const { t } = useLang();
  const { replyTo, editingMessage, setReplyTo, setEditingMessage, getDraft, setDraft, chats } = useChatStore();
  const [text, setText] = useState(() => getDraft(chatId));

  const chat = chats.find(c => c.id === chatId);
  const isGroup = chat?.type === 'group';
  const chatMembers = (chat?.members || []).filter((m) => m.user.id !== user?.id);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleStep, setScheduleStep] = useState<'presets' | 'custom'>('presets');
  const [scheduleHour, setScheduleHour] = useState('12');
  const [scheduleMinute, setScheduleMinute] = useState('00');
  const [scheduleCalDate, setScheduleCalDate] = useState('');
  const [scheduleCalMonth, setScheduleCalMonth] = useState(new Date().getMonth());
  const [scheduleCalYear, setScheduleCalYear] = useState(new Date().getFullYear());
  const [scheduleToast, setScheduleToast] = useState<string | null>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
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
  
  // Video notes
  const [recordMode, setRecordMode] = useState<'voice' | 'video'>('voice');
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [pressTimer, setPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  const filteredMembers = mentionQuery !== null && isGroup
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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordingTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [liveBars, setLiveBars] = useState<number[]>(() => Array(32).fill(5));

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
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

        // Проверяем что все файлы загрузились
        for (let i = 0; i < results.length; i++) {
          if (!results[i] || !results[i].url) {
            throw new Error(`Файл ${attachments[i].file.name} не загрузился`);
          }
        }

        // Определяем тип первого файла для основного типа сообщения
        const firstResult = results[0];
        const mediaType = firstResult.mimetype.startsWith('image/') ? 'image'
          : firstResult.mimetype.startsWith('video/') ? 'video'
          : firstResult.mimetype.startsWith('audio/') ? 'audio'
          : 'file';

        // Создаём массив media для всех файлов
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

        // Отправляем одно сообщение со всеми файлами
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
    // Горячие клавиши для быстрых ответов (Ctrl+1-9)
    if (e.ctrlKey && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      setShowQuickReplies(true);
      return;
    }

    // Открыть быстрые ответы по "/"
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
    setAttachments(prev => {
      const updated = prev.filter((_, i) => i !== index);
      // Check arrows after next render
      setTimeout(checkScrollArrows, 50);
      return updated;
    });
  };

  const addAttachment = (file: File, type: 'image' | 'video' | 'file' | 'audio', preview?: string) => {
    setAttachments(prev => {
      if (prev.length >= 1200) {
        alert(t('tooManyFiles'));
        return prev;
      }
      const updated = [...prev, { file, preview, type }];
      // Check arrows after next render
      setTimeout(checkScrollArrows, 50);
      return updated;
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
    // Проверяем, есть ли уже текст или другие стикеры
    const hasContent = text.trim().length > 0;
    
    if (!hasContent) {
      // Если нет текста - отправляем стикер как отдельное сообщение
      handleStickerSend(sticker);
      setShowStickers(false);
      return;
    }
    
    // Если есть текст - вставляем стикер в текст
    const stickerCode = `[sticker:${sticker.id}:${sticker.fileUrl}]`;
    const cursorPos = inputRef.current?.selectionStart || text.length;
    const newText = text.slice(0, cursorPos) + stickerCode + text.slice(cursorPos);
    setText(newText);
    setDraft(chatId, newText);
    inputRef.current?.focus();
    // Устанавливаем курсор после стикера
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      const actx = new AudioContext();
      const source = actx.createMediaStreamSource(stream);
      const analyser = actx.createAnalyser();
      analyser.fftSize = 512; // Increased from 256 for better resolution
      analyser.smoothingTimeConstant = 0.4; // Lower = more responsive, less smooth
      analyser.minDecibels = -45; // More sensitive (default -100)
      analyser.maxDecibels = -10; // More sensitive (default -30)
      source.connect(analyser);
      audioContextRef.current = actx;
      analyserRef.current = analyser;

      const timeDomainData = new Uint8Array(analyser.frequencyBinCount);
      const updateBars = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(timeDomainData);
        const bars: number[] = [];
        const step = Math.floor(timeDomainData.length / 32);
        for (let i = 0; i < 32; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            const val = Math.abs(timeDomainData[i * step + j] - 128);
            sum += val;
          }
          const avg = sum / step;
          // More sensitive mapping: 0-128 to 15-100 with exaggeration
          bars.push(Math.max(15, Math.min(100, avg * 2.2 + 15)));
        }
        setLiveBars(bars);
        animFrameRef.current = requestAnimationFrame(updateBars);
      };
      animFrameRef.current = requestAnimationFrame(updateBars);

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], `voice.${ext}`, { type: mimeType });

        try {
          const result = await api.uploadFile(file);
          
          if (!result || !result.url) {
            throw new Error('Не получен URL файла от сервера');
          }

          const socket = getSocket();
          if (socket) {
            socket.emit('send_message', {
              chatId,
              content: null,
              type: 'voice',
              mediaUrl: result.url,
              mediaType: 'voice',
              fileName: result.filename || file.name,
              fileSize: result.size || file.size,
              duration: recordingTimeRef.current,
              replyToId: replyTo?.id || null,
            });
            setReplyTo(null);
          }
        } catch (e) {
          console.error('Ошибка отправки голосового:', e);
          alert('Не удалось отправить голосовое сообщение.');
        }
      };

      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimeRef.current = 0;
      timerRef.current = setInterval(() => {
        recordingTimeRef.current += 1;
        setRecordingTime((t) => t + 1);
      }, 1000);
    } catch (e) {
      console.error('Ошибка записи:', e);
    }
  };

  const cleanupAnalyser = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setLiveBars(Array(32).fill(5));
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    setIsRecording(false);
    setRecordingTime(0);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    cleanupAnalyser();
    setIsRecording(false);
    setRecordingTime(0);
    recordingTimeRef.current = 0;
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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

      // Check file size before adding
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

  // Check if arrows should be visible
  const checkScrollArrows = () => {
    const el = attachmentsScrollRef.current;
    if (el) {
      setShowLeftArrow(el.scrollLeft > 0);
      setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
    }
  };

  const scrollAttachments = (direction: 'left' | 'right') => {
    const el = attachmentsScrollRef.current;
    if (el) {
      const scrollAmount = 200;
      el.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Проверка грамматики
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

  // Применить исправление грамматики
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
          <motion.div
            initial={{ height: 0, opacity: 0, y: 10 }}
            animate={{ height: 'auto', opacity: 1, y: 0 }}
            exit={{ height: 0, opacity: 0, y: 10 }}
            onAnimationComplete={checkScrollArrows}
            className="mb-2 max-w-3xl mx-auto px-1.5 relative"
          >
            {/* Left scroll arrow */}
            {showLeftArrow && (
              <button
                onClick={() => scrollAttachments('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center hover:bg-black/80 transition-all shadow-lg"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </button>
            )}

            {/* Right scroll arrow */}
            {showRightArrow && (
              <button
                onClick={() => scrollAttachments('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 text-white flex items-center justify-center hover:bg-black/80 transition-all shadow-lg"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6"/>
                </svg>
              </button>
            )}

            {/* Compact horizontal scroll for attachments */}
            <div
              ref={attachmentsScrollRef}
              onScroll={checkScrollArrows}
              className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1 pl-2 pr-2"
            >
              {attachments.map((att, index) => (
                <div key={index} className="relative flex-shrink-0 w-16 h-16 bg-white/[0.08] backdrop-blur-xl border border-white/15 rounded-lg overflow-hidden shadow-lg group">
                  <div className="w-full h-full relative">
                    {att.preview ? (
                      <img src={att.preview} alt="" className="w-full h-full object-cover" />
                    ) : att.type === 'video' ? (
                      <div className="w-full h-full bg-gradient-to-br from-nexo-500/30 to-purple-600/30 flex items-center justify-center">
                        <ImageIcon size={16} className="text-nexo-300" />
                      </div>
                    ) : att.type === 'audio' ? (
                      <div className="w-full h-full bg-gradient-to-br from-emerald-500/30 to-teal-600/30 flex items-center justify-center">
                        <Music size={16} className="text-emerald-300" />
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-sky-500/30 to-blue-600/30 flex items-center justify-center">
                        <FileText size={16} className="text-sky-300" />
                      </div>
                    )}
                    {/* Remove button - visible on hover */}
                    <button
                      onClick={() => removeAttachment(index)}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500/90 hover:bg-red-600 flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X size={8} />
                    </button>
                  </div>
                  {/* File count badge for many files */}
                  {index === attachments.length - 1 && attachments.length > 5 && (
                    <div className="absolute bottom-0 right-0 left-0 bg-black/60 text-[8px] text-white text-center py-0.5">
                      +{attachments.length - 1}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {isSending && (
              <div className="mt-1 flex items-center gap-1.5 text-nexo-400 text-xs">
                <div className="w-3 h-3 border-2 border-nexo-400 border-t-transparent rounded-full animate-spin" />
                <span>{t('uploading')}</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isRecording ? (
        <div className="flex items-center gap-3 max-w-3xl mx-auto px-2">
          {/* Cancel button */}
          <button
            onClick={cancelRecording}
            className="p-3 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all flex-shrink-0"
          >
            <X size={20} />
          </button>
          
          {/* Waveform visualization */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-white font-mono w-12 text-center">{formatTime(recordingTime)}</span>
            </div>
            <div className="flex items-center gap-0.5 h-12 w-full justify-center">
              {liveBars.map((height, i) => (
                <div
                  key={i}
                  className="w-1 bg-gradient-to-t from-red-500 via-orange-400 to-yellow-300 rounded-full transition-all duration-75"
                  style={{ 
                    height: `${Math.max(20, height)}%`,
                    opacity: 0.7 + (height / 200)
                  }}
                />
              ))}
            </div>
          </div>
          
          {/* Send button */}
          <button
            onClick={stopRecording}
            className="p-4 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white transition-all shadow-lg shadow-emerald-500/30 hover:scale-105 flex-shrink-0"
          >
            <Send size={20} />
          </button>
        </div>
      ) : (
        <>
          {/* Mobile layout - all buttons inside field */}
          <div className="flex items-end justify-center max-w-3xl mx-auto sm:hidden px-2 pb-2">
            <div className="flex-1 max-w-2xl bg-[#1a1a1f]/90 backdrop-blur-xl border border-white/[0.08] rounded-[1.5rem] px-1.5 py-1.5 flex items-center gap-0.5 focus-within:border-white/[0.15] transition-all duration-200 shadow-lg shadow-black/20">
              <button
                ref={emojiAnchorRef}
                onClick={() => setShowMediaPicker(prev => !prev)}
                data-mediapicker-anchor
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 flex-shrink-0 ${showMediaPicker ? 'text-yellow-400 bg-yellow-400/10' : 'text-white/35 hover:text-white/70 hover:bg-white/[0.06]'}`}
                title="Эмодзи, стикеры и GIF"
              >
                <Smile size={19} />
              </button>
              
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
                    startRecording();
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
                  <Mic size={17} className="text-white" />
                )}
              </button>
            </div>
          </div>

          {/* Desktop layout - all buttons inside field */}
          <div className="hidden sm:flex items-end justify-center gap-3 max-w-3xl mx-auto">
            <div className="flex-1 max-w-2xl bg-[#1a1a1f]/90 backdrop-blur-xl border border-white/[0.08] rounded-[1.5rem] px-1.5 py-1.5 flex items-center gap-0.5 focus-within:border-white/[0.15] transition-all duration-200 shadow-lg shadow-black/20">
              <button
                ref={emojiAnchorRef}
                onClick={() => setShowMediaPicker(prev => !prev)}
                data-mediapicker-anchor
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-150 flex-shrink-0 ${showMediaPicker ? 'text-yellow-400 bg-yellow-400/10' : 'text-white/35 hover:text-white/70 hover:bg-white/[0.06]'}`}
                title="Эмодзи, стикеры и GIF"
              >
                <Smile size={19} />
              </button>
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
                    startRecording();
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
                  <Mic size={18} className="text-white" />
                )}
              </button>
            </div>
          </div>
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
        {showMediaPicker && (
          <MediaPicker
            onClose={() => setShowMediaPicker(false)}
            anchorRef={emojiAnchorRef}
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

      <AnimatePresence>
        {showSchedule && (
          <ScheduleCalendar
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

      {/* Camera Modal */}
      <AnimatePresence>
        {showCamera && (
          <CameraModal
            onClose={() => setShowCamera(false)}
            onCapture={handleCameraCapture}
          />
        )}
      </AnimatePresence>

      {/* Attach Menu */}
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

      {/* Sticker Picker */}
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

      {/* Poll Modal */}
      <AnimatePresence>
        {showPoll && (
          <PollModal
            onClose={() => setShowPoll(false)}
            onSend={handlePollSend}
          />
        )}
      </AnimatePresence>

      {/* Location Modal */}
      <AnimatePresence>
        {showLocation && (
          <LocationModal
            onClose={() => setShowLocation(false)}
            onSend={handleLocationSend}
          />
        )}
      </AnimatePresence>

      {/* Contact Card Modal */}
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

      {/* Templates Modal */}
      <AnimatePresence>
        {showTemplates && (
          <TemplatesModal
            onClose={() => setShowTemplates(false)}
            onInsert={handleTemplateInsert}
          />
        )}
      </AnimatePresence>

      {/* Quick Reply Modal */}
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

      {/* Grammar Check Modal */}
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

      {/* Video Note Recorder */}
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

// Schedule Calendar Component
function ScheduleCalendar({
  calDate, setCalDate, calMonth, setCalMonth, calYear, setCalYear,
  hour, setHour, minute, setMinute, onSend, t,
}: {
  calDate: string;
  setCalDate: (v: string) => void;
  calMonth: number;
  setCalMonth: (v: number) => void;
  calYear: number;
  setCalYear: (v: number) => void;
  hour: string;
  setHour: (v: string) => void;
  minute: string;
  setMinute: (v: string) => void;
  onSend: (iso: string) => void;
  t: (k: any) => any;
}) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d2 = 1; d2 <= daysInMonth; d2++) cells.push(d2);

  const prevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };

  const selectDay = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    setCalDate(`${calYear}-${m}-${d}`);
  };

  const isSelected = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${calYear}-${m}-${d}` === calDate;
  };

  const isToday = (day: number) => {
    return today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
  };

  const isPast = (day: number) => {
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${calYear}-${m}-${d}` < todayStr;
  };

  const canSend = (() => {
    if (!calDate) return false;
    const dt = new Date(`${calDate}T${hour}:${minute}:00`);
    return dt.getTime() > Date.now();
  })();

  const handleSend = () => {
    if (!canSend) return;
    const m = String(calMonth + 1).padStart(2, '0');
    const d = String(calDate.split('-')[2] || '01').padStart(2, '0');
    onSend(`${calYear}-${m}-${d}T${hour}:${minute}:00`);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" onClick={() => {}}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-sm rounded-2xl bg-surface-secondary border border-white/10 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-2">
            <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className="text-sm font-semibold text-white">
              {new Date(calYear, calMonth).toLocaleString(t('ru-RU' as any) || 'ru-RU', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500 mb-2">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <div key={d} className="py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => (
              day ? (
                <button
                  key={i}
                  onClick={() => selectDay(day)}
                  disabled={isPast(day)}
                  className={`aspect-square rounded-lg text-sm transition-colors ${
                    isSelected(day)
                      ? 'bg-nexo-500 text-white font-semibold'
                      : isToday(day)
                        ? 'text-nexo-400 font-semibold ring-1 ring-nexo-500/50'
                        : isPast(day)
                          ? 'text-zinc-600 cursor-not-allowed'
                          : 'text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {day}
                </button>
              ) : (
                <span key={i} className="aspect-square" />
              )
            ))}
          </div>
        </div>

        <div className="px-3 pb-2">
          <label className="text-[11px] text-zinc-500 mb-1 block">{t('scheduleTime')}</label>
          <div className="flex items-center gap-2">
            <select
              value={hour}
              onChange={(e) => setHour(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-nexo-500/50 appearance-none text-center"
            >
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => (
                <option key={h} value={h} className="bg-zinc-800">{h}</option>
              ))}
            </select>
            <span className="text-zinc-400 font-bold">:</span>
            <select
              value={minute}
              onChange={(e) => setMinute(e.target.value)}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-nexo-500/50 appearance-none text-center"
            >
              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => (
                <option key={m} value={m} className="bg-zinc-800">{m}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="px-3 pb-3">
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full py-2 rounded-xl bg-accent hover:bg-accent-hover disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium transition-colors"
          >
            {t('scheduleSend')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
