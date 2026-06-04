import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Palette, Copy, Check, Loader2 } from 'lucide-react';
import QRCode from '../lib/qrcode';

interface QRCodeModalProps {
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
  };
  onClose: () => void;
}

const COLORS = [
  { name: 'Нексо', fg: '#6366f1', bg: '#0a0a0a' },
  { name: 'Синий', fg: '#3b82f6', bg: '#0a0a0a' },
  { name: 'Зелёный', fg: '#22c55e', bg: '#0a0a0a' },
  { name: 'Красный', fg: '#ef4444', bg: '#0a0a0a' },
  { name: 'Фиолетовый', fg: '#a855f7', bg: '#0a0a0a' },
  { name: 'Оранжевый', fg: '#f97316', bg: '#0a0a0a' },
  { name: 'Белый', fg: '#ffffff', bg: '#0a0a0a' },
  { name: 'Светлый', fg: '#6366f1', bg: '#ffffff' },
];

export default function QRCodeModal({ user, onClose }: QRCodeModalProps) {
  const [colorIdx, setColorIdx] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showColors, setShowColors] = useState(false);

  const profileUrl = `${window.location.origin}/?user=${user.username}`;

  const generateQR = useCallback(() => {
    const color = COLORS[colorIdx];
    setQrError(false);
    try {
      const dataUrl = QRCode.toDataURL(profileUrl, {
        width: 280,
        margin: 2,
        color: { dark: color.fg, light: color.bg },
      });
      if (dataUrl) {
        setQrDataUrl(dataUrl);
      } else {
        // Retry once after delay
        setTimeout(() => {
          try {
            const retryUrl = QRCode.toDataURL(profileUrl, {
              width: 280,
              margin: 2,
              color: { dark: color.fg, light: color.bg },
            });
            if (retryUrl) {
              setQrDataUrl(retryUrl);
            } else {
              setQrError(true);
            }
          } catch {
            setQrError(true);
          }
        }, 500);
      }
    } catch (e) {
      console.error('QR generation failed:', e);
      // Retry once after delay
      setTimeout(() => {
        try {
          const retryUrl = QRCode.toDataURL(profileUrl, {
            width: 280,
            margin: 2,
            color: { dark: color.fg, light: color.bg },
          });
          if (retryUrl) {
            setQrDataUrl(retryUrl);
          } else {
            setQrError(true);
          }
        } catch {
          setQrError(true);
        }
      }, 500);
    }
  }, [colorIdx, profileUrl]);

  useEffect(() => {
    generateQR();
  }, [generateQR]);

  const downloadQR = () => {
    const color = COLORS[colorIdx];
    const canvas = document.createElement('canvas');
    const size = 512;
    const padding = 40;
    const qrSize = size - padding * 2;
    const borderRadius = 32;
    canvas.width = size;
    canvas.height = size + 100;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw rounded rectangle background with shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, borderRadius);
    ctx.fillStyle = color.bg;
    ctx.fill();
    ctx.restore();

    // Draw border (обводка)
    ctx.strokeStyle = color.fg + '40';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, canvas.width - 3, canvas.height - 3, borderRadius);
    ctx.stroke();

    const qrImg = new Image();
    qrImg.onload = () => {
      ctx.drawImage(qrImg, padding, padding, qrSize, qrSize);

      const avatarSize = 60;
      const avatarX = (size - avatarSize) / 2;
      const avatarY = padding + (qrSize - avatarSize) / 2;

      // Avatar ring shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(size / 2, avatarY + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
      ctx.fillStyle = color.bg;
      ctx.fill();
      ctx.restore();

      // Avatar ring
      ctx.strokeStyle = color.fg;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(size / 2, avatarY + avatarSize / 2, avatarSize / 2 + 1, 0, Math.PI * 2);
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
      ctx.clip();

      if (user.avatar) {
        const avatarImg = new Image();
        avatarImg.crossOrigin = 'anonymous';
        avatarImg.onload = () => {
          ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
          finishDownload();
        };
        avatarImg.onerror = () => {
          drawFallbackAvatar();
          finishDownload();
        };
        avatarImg.src = user.avatar;
      } else {
        drawFallbackAvatar();
        finishDownload();
      }

      function drawFallbackAvatar() {
        if (!ctx) return;
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(user.displayName[0]?.toUpperCase() || 'N', size / 2, avatarY + avatarSize / 2);
      }

      function finishDownload() {
        if (!ctx) return;
        ctx.restore();
        ctx.fillStyle = color.fg;
        ctx.font = 'bold 24px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`@${user.username}`, size / 2, size + 50);
        const link = document.createElement('a');
        link.download = `nexo-qr-${user.username}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
    };
    qrImg.src = qrDataUrl;
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {}
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="relative w-full max-w-sm mx-4 glass-strong rounded-3xl p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
          >
            <X size={20} />
          </button>

          <div className="flex flex-col items-center">
            <div className="relative mb-4">
              <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-nexo-500/50 shadow-lg">
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-nexo-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                    {user.displayName[0]?.toUpperCase() || 'N'}
                  </div>
                )}
              </div>
            </div>

            <h3 className="text-lg font-semibold text-white mb-1">{user.displayName}</h3>
            <p className="text-sm text-zinc-400 mb-4">@{user.username}</p>

            <div className="relative bg-white rounded-2xl p-4 mb-4 shadow-xl">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR Code" className="w-[280px] h-[280px]" style={{ imageRendering: 'pixelated' }} />
              ) : qrError ? (
                <div className="w-[280px] h-[280px] flex items-center justify-center text-zinc-500 text-sm">
                  Не удалось сгенерировать QR
                </div>
              ) : (
                <div className="w-[280px] h-[280px] flex items-center justify-center">
                  <Loader2 size={32} className="text-zinc-400 animate-spin" />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 w-full mb-4">
              <button
                onClick={copyLink}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-zinc-300 hover:bg-white/10 transition-colors"
              >
                {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                {copied ? 'Скопировано' : 'Скопировать ссылку'}
              </button>
              <button
                onClick={downloadQR}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-zinc-300 hover:bg-white/10 transition-colors"
              >
                <Download size={16} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowColors(!showColors)}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-zinc-300 hover:bg-white/10 transition-colors"
                >
                  <Palette size={16} />
                </button>
                <AnimatePresence>
                  {showColors && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 glass-strong rounded-xl shadow-xl grid grid-cols-4 gap-1.5"
                    >
                      {COLORS.map((c, i) => (
                        <button
                          key={i}
                          onClick={() => { setColorIdx(i); setShowColors(false); }}
                          className={`w-8 h-8 rounded-lg border-2 transition-all ${
                            colorIdx === i ? 'border-white scale-110' : 'border-transparent'
                          }`}
                          style={{ background: `linear-gradient(135deg, ${c.fg} 50%, ${c.bg} 50%)` }}
                          title={c.name}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <p className="text-xs text-zinc-500 text-center">
              Отсканируйте QR-код или перейдите по ссылке, чтобы открыть профиль
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
