import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, X } from 'lucide-react';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useChatStore } from '../../stores/chatStore';

interface VoiceRecorderProps {
  chatId: string;
  replyToId?: string;
  onSent: () => void;
  onCancel: () => void;
}

export default function VoiceRecorder({ chatId, replyToId, onSent, onCancel }: VoiceRecorderProps) {
  const { setReplyTo } = useChatStore();
  const [recordingTime, setRecordingTime] = useState(0);
  const [liveBars, setLiveBars] = useState<number[]>(() => Array(32).fill(5));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const recordingTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

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

  const cleanupAnalyser = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    analyserRef.current = null;
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setLiveBars(Array(32).fill(5));
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
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
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      analyser.minDecibels = -45;
      analyser.maxDecibels = -10;
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
              replyToId: replyToId || null,
            });
            setReplyTo(null);
          }
          onSent();
        } catch (e) {
          console.error('Ошибка отправки голосового:', e);
          alert('Не удалось отправить голосовое сообщение.');
        }
      };

      recorder.start();
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

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    cleanupAnalyser();
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
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    onCancel();
  };

  useEffect(() => {
    startRecording();
  }, []);

  return (
    <div className="flex items-center gap-3 max-w-3xl mx-auto px-2">
      <button
        onClick={cancelRecording}
        className="p-3 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-all flex-shrink-0"
      >
        <X size={20} />
      </button>

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

      <button
        onClick={stopRecording}
        className="p-4 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white transition-all shadow-lg shadow-emerald-500/30 hover:scale-105 flex-shrink-0"
      >
        <Send size={20} />
      </button>
    </div>
  );
}
