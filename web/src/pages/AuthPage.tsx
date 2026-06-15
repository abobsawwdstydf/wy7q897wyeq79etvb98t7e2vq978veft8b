import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { Eye, EyeOff, ArrowRight, ArrowLeft, Camera, Check, QrCode, Smartphone, Lock, User, Calendar, FileText, Image, Phone, AtSign, Loader2, X } from 'lucide-react';
import DatePicker from '../components/DatePicker';
import { playKeyboardSound } from '../lib/sounds';
import QRCode from '../lib/qrcode';
import { useResponsive } from '../hooks/useResponsive';

import { AuthShell, AuthCard, AuthLogo, AuthTitle, AuthGrid, authPrimaryButtonStyle } from '../components/AuthShell';

function formatPhone(value: string) {
  const cleaned = value.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('8') && cleaned.length === 1) return '+7';
  if (cleaned.startsWith('8') && cleaned.length > 1) return '+7' + cleaned.slice(1);
  if (!cleaned.startsWith('+') && cleaned.length > 0) return '+' + cleaned;
  return cleaned;
}

const errorBox = (error: string) => (
  <AnimatePresence>
    {error && (
      <motion.div
        initial={{ opacity: 0, y: -10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="mt-4 p-3.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-300 text-[13px] flex items-center gap-2.5 backdrop-blur-sm"
      >
        <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
          <X size={12} className="text-red-400" />
        </div>
        <span className="font-medium">{error}</span>
      </motion.div>
    )}
  </AnimatePresence>
);

const primaryButtonClass =
  'w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 relative overflow-hidden';

export default function AuthPage() {
  const [mode, setMode] = useState<'landing' | 'register' | 'login' | 'login-method' | 'login-password' | 'login-qr' | 'login-code' | 'register-success'>('landing');
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isMobile } = useResponsive();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [bio, setBio] = useState('');
  const [birthday, setBirthday] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cloudPassword, setCloudPassword] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginShowPassword, setLoginShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [useCloudPassword, setUseCloudPassword] = useState(false);

  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { login, register, user } = useAuthStore();

  useEffect(() => {
    if (username.length < 3 || username.length > 17) { setUsernameStatus('idle'); return; }
    if (!/^[a-zA-Z0-9_.-]+$/.test(username)) { setUsernameStatus('idle'); return; }
    if (username.startsWith('.') || username.endsWith('.')) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      try {
        const r = await api.checkUsername(username);
        setUsernameStatus(r.available ? 'available' : 'taken');
      }
      catch (err) {
        console.error('Check username error:', err);
        setUsernameStatus('idle');
      }
    }, 500);
    return () => clearTimeout(t);
  }, [username]);

  useEffect(() => {
    if (!/^\+\d{7,15}$/.test(phone)) { setPhoneStatus('idle'); return; }
    setPhoneStatus('checking');
    const t = setTimeout(async () => {
      try { const r = await api.checkPhone(phone); setPhoneStatus(r.available ? 'available' : 'taken'); }
      catch { setPhoneStatus('idle'); }
    }, 500);
    return () => clearTimeout(t);
  }, [phone]);

  const handleUsernameChange = (val: string) => {
    const filtered = val.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 17);
    setUsername(filtered);
    playKeyboardSound();
  };

  const handlePhoneChange = (val: string) => {
    setPhone(formatPhone(val));
    playKeyboardSound();
  };

  const selectAvatar = () => avatarInputRef.current?.click();
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/gif')) { return; }
    if (file.size > 10 * 1024 * 1024) { setError('Файл не более 10MB'); return; }
    if (avatarPreview) {
      URL.revokeObjectURL(avatarPreview);
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setError('');
  };

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mode === 'login-method' || mode === 'landing') {
      setError('');
    }
    if (mode === 'login-code') {
      setVerificationCode('');
    }
  }, [mode]);

  const isStepValid = (): boolean => {
    switch (step) {
      case 1: return username.length >= 3 && username.length <= 17 && usernameStatus === 'available';
      case 2: return displayName.trim().length > 0;
      case 3: return true;
      case 4: {
        if (!birthday.trim()) return false;
        const selected = new Date(birthday);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        selected.setHours(0, 0, 0, 0);
        return selected < today;
      }
      case 5: return true;
      case 6: return password.length >= 6 && password.length <= 50 && password === confirmPassword;
      case 7: return true;
      case 8: return /^\+\d{7,15}$/.test(phone) && phoneStatus !== 'taken';
      default: return false;
    }
  };

  const handleNext = () => {
    if (!isStepValid()) {
      if (step === 1) {
        if (username.length < 3) setError('Минимум 3 символа');
        else if (usernameStatus === 'taken') setError('Username занят');
        else setError('Недопустимые символы');
      } else if (step === 2) {
        setError('Введите имя');
      } else if (step === 4) {
        if (!birthday.trim()) {
          setError('Выберите дату рождения');
        } else {
          const selected = new Date(birthday);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          selected.setHours(0, 0, 0, 0);
          if (selected >= today) setError('Дата рождения не может быть сегодняшней или будущей');
          else setError('Выберите дату рождения');
        }
      } else if (step === 6) {
        if (password.length < 6) setError('Пароль минимум 6 символов');
        else if (password !== confirmPassword) setError('Пароли не совпадают');
      } else if (step === 8) {
        if (!/^\+\d{7,15}$/.test(phone)) setError('Введите корректный номер');
        else if (phoneStatus === 'taken') setError('Номер уже зарегистрирован');
      }
      return;
    }
    setError('');
    if (step < 8) setStep(step + 1);
  };

  const handleBack = () => {
    setError('');
    if (step > 1) setStep(step - 1);
  };

  const handleRegister = async () => {
    if (!isStepValid()) return;
    setError('');
    setIsSubmitting(true);
    try {
      await register({
        username,
        displayName: displayName || username,
        phone,
        password,
        bio: bio || undefined,
        birthday: birthday || undefined,
        avatar: avatarFile || undefined,
      });
      setMode('register-success');
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setIsSubmitting(false); }
  };

  const handleLoginPassword = async () => {
    setError('');
    if (!/^\+\d{7,15}$/.test(phone)) { setError('Введите корректный номер'); return; }
    if (loginPassword.length < 6) { setError('Пароль минимум 6 символов'); return; }
    setIsSubmitting(true);
    try {
      await login(phone, loginPassword);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setIsSubmitting(false); }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (!/^\+\d{7,15}$/.test(phone)) { setError('Введите корректный номер'); return; }
    if (verificationCode.length !== 6) { setError('Введите 6-значный код'); return; }
    setIsSubmitting(true);
    try {
      await login(phone, verificationCode);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setIsSubmitting(false); }
  };

  const handleLoginWithCloudPassword = async () => {
    setError('');
    if (!/^\+\d{7,15}$/.test(phone)) { setError('Введите корректный номер'); return; }
    if (!cloudPassword.trim()) { setError('Введите облачный пароль'); return; }
    setIsSubmitting(true);
    try {
      await login(phone, cloudPassword);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setIsSubmitting(false); }
  };

  const generateDeviceToken = () => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  };

  const [deviceToken, setDeviceToken] = useState(() => generateDeviceToken());
  const deviceLink = `${window.location.origin}/device?device=${deviceToken}`;
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [qrStatus, setQrStatus] = useState<'waiting' | 'scanned' | 'confirmed' | 'denied' | 'expired'>('waiting');
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const regenerateQR = () => {
    const newToken = generateDeviceToken();
    setDeviceToken(newToken);
    setQrStatus('waiting');
  };

  useEffect(() => {
    if (mode === 'landing' || mode === 'login-qr') {
      // Register device token server-side
      api.post('/auth/device/init', { token: deviceToken }).catch(() => {});

      try {
        const url = QRCode.toDataURL(deviceLink, {
          width: 256,
          margin: 2,
          color: { dark: '#000000', light: '#ffffff' }
        });
        if (url) {
          setQrCodeUrl(url);
        } else {
          console.error('QR code generation returned empty');
          setTimeout(() => {
            try {
              const retryUrl = QRCode.toDataURL(deviceLink, {
                width: 256,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
              });
              setQrCodeUrl(retryUrl || '');
            } catch (e) {
              console.error('QR retry failed:', e);
            }
          }, 500);
        }
      } catch (err) {
        console.error('Failed to generate QR code:', err);
        setTimeout(() => {
          try {
            const retryUrl = QRCode.toDataURL(deviceLink, {
              width: 256,
              margin: 2,
              color: { dark: '#000000', light: '#ffffff' }
            });
            setQrCodeUrl(retryUrl || '');
          } catch (e) {
            console.error('QR retry failed:', e);
          }
        }, 500);
      }
    }
  }, [mode, deviceLink, deviceToken]);

  // Polling for QR login confirmation
  useEffect(() => {
    if (mode !== 'landing' && mode !== 'login-qr') return;
    if (user) return;

    const startedAt = Date.now();
    const ttl = 5 * 60 * 1000;

    const stopPolling = () => {
      if (qrPollRef.current) {
        clearInterval(qrPollRef.current);
        qrPollRef.current = null;
      }
    };

    qrPollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > ttl) {
        stopPolling();
        regenerateQR();
        return;
      }

      try {
        const result: any = await api.get(`/auth/device/check?device=${deviceToken}`);
        if (!result) return;

        if (result.scanned) {
          setQrStatus('scanned');
        }

        if (result.confirmed && result.user) {
          stopPolling();
          setQrStatus('confirmed');
          try {
            useAuthStore.getState().loginWithToken('', result.user);
          } catch (e) {
            console.error('loginWithToken error:', e);
          }
        } else if (result.denied) {
          stopPolling();
          setQrStatus('denied');
        }
      } catch {
        // ignore network errors, continue polling
      }
    }, 2000);

    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, deviceToken, user]);

  if (mode === 'register-success') {
    return (
      <AuthShell>
        <div className="text-center max-w-sm mx-4">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.4 }}
            className="relative w-20 h-20 rounded-[1.5rem] bg-emerald-500/20 flex items-center justify-center mx-auto mb-4"
            style={{ boxShadow: '0 0 40px rgba(16,185,129,0.3), 0 10px 30px rgba(0,0,0,0.3)' }}
          >
            <motion.div
              animate={{ scale: [1, 1.5, 1.5], opacity: [0.5, 0, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
              className="absolute inset-0 rounded-[1.5rem] bg-emerald-500/30"
            />
            <Check size={40} className="text-emerald-400 relative z-10" />
          </motion.div>
          <h2
            className="text-2xl font-bold mb-2"
            style={{
              background: 'linear-gradient(135deg, #fff, #6ee7b7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Всё почти готово
          </h2>
          <p className="text-white/40 text-[14px]">Загрузка мессенджера...</p>
          <div className="mt-6 flex items-center justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
                transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
                className="w-1.5 h-1.5 rounded-full bg-emerald-400"
              />
            ))}
          </div>
        </div>
      </AuthShell>
    );
  }

  if (mode === 'login-qr') {
    return (
      <AuthShell onBack={() => { if (qrStatus === 'waiting' || qrStatus === 'expired' || qrStatus === 'denied') setMode('login-method'); }}>
        <div className="text-center max-w-sm mx-4 w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            <h2
              className="text-2xl font-bold mb-2 tracking-tight"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              <span
                style={{
                  background: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Вход по QR-коду
              </span>
            </h2>
            <p className="text-sm text-white/40 mb-7">
              {qrStatus === 'confirmed' ? 'Вход подтверждён' :
               qrStatus === 'scanned' ? 'QR-код отсканирован' :
               qrStatus === 'denied' ? 'Вход отклонён' :
               qrStatus === 'expired' ? 'Ссылка истекла' :
               'Отсканируйте код на другом устройстве'}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6, type: 'spring', bounce: 0.3 }}
            className="relative mb-6 mx-auto inline-block"
          >
            <div
              className="relative rounded-xl overflow-hidden"
              style={{
                boxShadow: qrStatus === 'confirmed'
                  ? '0 0 0 2px rgba(16,185,129,0.7), 0 0 30px rgba(16,185,129,0.4)'
                  : qrStatus === 'denied'
                    ? '0 0 0 2px rgba(239,68,68,0.7), 0 0 30px rgba(239,68,68,0.4)'
                    : qrStatus === 'scanned'
                      ? '0 0 0 2px rgba(168,85,247,0.7), 0 0 30px rgba(168,85,247,0.4)'
                      : '0 0 0 2px rgba(99,102,241,0.6), 0 0 20px rgba(99,102,241,0.3)',
                transition: 'box-shadow 0.4s ease',
              }}
            >
              {qrStatus === 'confirmed' ? (
                <div
                  className="w-60 h-60 flex flex-col items-center justify-center"
                  style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.25) 0%, rgba(16,185,129,0.05) 70%)' }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', bounce: 0.5 }}
                    className="w-20 h-20 rounded-[1.5rem] bg-emerald-500/30 flex items-center justify-center mb-3"
                    style={{ boxShadow: '0 0 40px rgba(16,185,129,0.5)' }}
                  >
                    <Check size={48} className="text-emerald-300" strokeWidth={2.5} />
                  </motion.div>
                  <p className="text-emerald-300 text-sm font-semibold">Вход выполнен</p>
                </div>
              ) : qrStatus === 'denied' ? (
                <div
                  className="w-60 h-60 flex flex-col items-center justify-center"
                  style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.25) 0%, rgba(239,68,68,0.05) 70%)' }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', bounce: 0.5 }}
                    className="w-20 h-20 rounded-[1.5rem] bg-red-500/30 flex items-center justify-center mb-3"
                    style={{ boxShadow: '0 0 40px rgba(239,68,68,0.5)' }}
                  >
                    <X size={48} className="text-red-300" strokeWidth={2.5} />
                  </motion.div>
                  <p className="text-red-300 text-sm font-semibold">Отклонено</p>
                </div>
              ) : qrStatus === 'expired' ? (
                <div
                  className="w-60 h-60 flex flex-col items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <X size={48} className="text-white/40 mb-3" />
                  <p className="text-white/50 text-sm font-medium">Время вышло</p>
                </div>
              ) : qrCodeUrl ? (
                <div className="relative">
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    className="w-60 h-60 block"
                    style={{
                      imageRendering: 'pixelated',
                      opacity: qrStatus === 'scanned' ? 0.35 : 1,
                      filter: qrStatus === 'scanned' ? 'blur(2px)' : 'none',
                      transition: 'opacity 0.4s ease, filter 0.4s ease',
                    }}
                  />
                  {qrStatus === 'scanned' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                        className="w-14 h-14 rounded-full border-[3px] border-white/15 border-t-purple-300 mb-2"
                      />
                      <p className="text-purple-200 text-sm font-semibold">Подтвердите на телефоне</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-60 h-60 bg-zinc-100 flex items-center justify-center">
                  <Loader2 size={32} className="text-zinc-400 animate-spin" />
                </div>
              )}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              {qrStatus === 'waiting' && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                  />
                  <p className="text-xs text-white/50 font-medium">Ожидание сканирования</p>
                </>
              )}
              {qrStatus === 'scanned' && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.8)]"
                  />
                  <p className="text-xs text-purple-300 font-medium">Ожидание подтверждения...</p>
                </>
              )}
              {qrStatus === 'confirmed' && (
                <p className="text-xs text-emerald-300 font-semibold">Перенаправление в мессенджер...</p>
              )}
              {qrStatus === 'denied' && (
                <p className="text-xs text-red-300 font-medium">Вход был отклонён на другом устройстве</p>
              )}
              {qrStatus === 'expired' && (
                <p className="text-xs text-white/40 font-medium">Ссылка действительна 5 минут</p>
              )}
            </div>

            {(qrStatus === 'waiting' || qrStatus === 'scanned') && (
              <>
                <p className="text-[11px] text-white/30 mb-3">Или перейдите по ссылке</p>
                <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3 backdrop-blur-xl">
                  <code className="text-[11px] text-white/60 flex-1 truncate font-mono">{deviceLink}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(deviceLink);
                    }}
                    className="text-[#818cf8] hover:text-[#a5b4fc] text-xs font-semibold whitespace-nowrap transition-colors"
                  >
                    Копировать
                  </button>
                </div>
              </>
            )}

            {(qrStatus === 'denied' || qrStatus === 'expired') && (
              <button
                onClick={regenerateQR}
                className="mt-2 w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-semibold text-[14px] transition-opacity hover:opacity-90"
              >
                Попробовать снова
              </button>
            )}
          </motion.div>
        </div>
      </AuthShell>
    );
  }

  if (mode === 'login-code') {
    return (
      <AuthShell onBack={() => setMode('login-password')}>
        <AuthCard className="max-w-sm w-full">
          <div className="flex flex-col items-center mb-6">
            <AuthLogo size="sm" />
            <div className="mt-3">
              <AuthTitle title="Подтверждение" subtitle="Код отправлен в чат Нексо на вашем устройстве" />
            </div>
          </div>

          <div className="flex gap-2 justify-center mb-5">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.input
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={verificationCode[i] || ''}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  if (val) {
                    const newCode = verificationCode.split('');
                    newCode[i] = val;
                    setVerificationCode(newCode.join(''));
                    if (i < 5) {
                      const next = (e.target.nextElementSibling as HTMLInputElement);
                      next?.focus();
                    }
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !verificationCode[i] && i > 0) {
                    const prev = (e.currentTarget.previousElementSibling as HTMLInputElement);
                    prev?.focus();
                  }
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
                  if (pasted) {
                    e.preventDefault();
                    setVerificationCode(pasted.padEnd(6, ''));
                    const lastInput = e.currentTarget.parentElement?.children[Math.min(pasted.length, 5)] as HTMLInputElement;
                    lastInput?.focus();
                  }
                }}
                className="w-11 h-14 text-center text-xl font-bold rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white focus:border-[#6366f1]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none"
              />
            ))}
          </div>

          <motion.button
            whileHover={{
              scale: 1.01,
              boxShadow: '0 0 30px rgba(99,102,241,0.4), 0 8px 24px rgba(0,0,0,0.3)',
            }}
            whileTap={{ scale: 0.98 }}
            onClick={handleVerifyCode}
            disabled={isSubmitting || verificationCode.length !== 6}
            className={primaryButtonClass}
            style={authPrimaryButtonStyle}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} /> Войти</>}
          </motion.button>

          <div className="mt-4 text-center">
            <button
              onClick={() => setUseCloudPassword(!useCloudPassword)}
              className="text-[12px] text-white/40 hover:text-[#a5b4fc] transition-colors"
            >
              {useCloudPassword ? 'Ввести код' : 'Войти по облачному паролю'}
            </button>
          </div>

          <AnimatePresence>
            {useCloudPassword && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden"
              >
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
                  />
                  <input
                    type="password"
                    value={cloudPassword}
                    onChange={(e) => setCloudPassword(e.target.value)}
                    placeholder="Облачный пароль"
                    className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none"
                  />
                </div>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleLoginWithCloudPassword}
                  disabled={isSubmitting || !cloudPassword.trim()}
                  className="w-full mt-3 py-3 px-4 rounded-2xl bg-white/[0.06] border border-white/[0.1] text-white font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Lock size={18} /> Войти</>}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {errorBox(error)}
        </AuthCard>
      </AuthShell>
    );
  }

  if (mode === 'login-password') {
    return (
      <AuthShell onBack={() => setMode('login-method')}>
        <AuthCard className="max-w-sm w-full">
          <div className="flex flex-col items-center mb-6">
            <AuthLogo size="sm" />
            <div className="mt-3">
              <AuthTitle title="Вход в аккаунт" subtitle="Введите данные для входа" />
            </div>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="block text-[12px] font-medium text-white/50 mb-1.5 ml-1">
                Телефон
              </label>
              <div className="relative">
                <Phone
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  placeholder="+79991234567"
                  autoFocus
                  className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none"
                  style={{ backdropFilter: 'blur(10px)' }}
                />
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-white/50 mb-1.5 ml-1">
                Пароль
              </label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
                />
                <input
                  type={loginShowPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Введите пароль"
                  onKeyDown={(e) => e.key === 'Enter' && handleLoginPassword()}
                  className="w-full pl-10 pr-11 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none"
                  style={{ backdropFilter: 'blur(10px)' }}
                />
                <button
                  type="button"
                  onClick={() => setLoginShowPassword(!loginShowPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors p-1"
                >
                  {loginShowPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{
                scale: 1.01,
                boxShadow: '0 0 30px rgba(99,102,241,0.4), 0 8px 24px rgba(0,0,0,0.3)',
              }}
              whileTap={{ scale: 0.98 }}
              onClick={handleLoginPassword}
              disabled={isSubmitting}
              className={`${primaryButtonClass} mt-2`}
              style={authPrimaryButtonStyle}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Check size={18} /> Войти
                </>
              )}
            </motion.button>

            {errorBox(error)}
          </div>

          <div className="mt-5 pt-5 border-t border-white/[0.06] text-center">
            <button
              onClick={() => setMode('login-code')}
              className="text-[12px] text-white/40 hover:text-[#a5b4fc] transition-colors"
            >
              Нет пароля? Войти по коду
            </button>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  if (mode === 'login-method') {
    return (
      <AuthShell onBack={() => setMode('landing')}>
        <AuthCard className="max-w-sm w-full">
          <div className="flex flex-col items-center mb-5">
            <AuthLogo size="sm" />
            <div className="mt-3">
              <AuthTitle title="Способ входа" subtitle="Выберите удобный вариант" />
            </div>
          </div>

          <div className="space-y-2.5">
            <motion.button
              whileHover={{ scale: 1.01, backgroundColor: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('login-password')}
              className="w-full py-3.5 px-4 rounded-[1.5rem] bg-white/[0.03] border border-white/[0.06] text-white font-medium flex items-center gap-3.5 transition-all duration-200 group"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#6366f1]/20 to-[#8b5cf6]/20 border border-[#6366f1]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Smartphone size={18} className="text-[#a5b4fc]" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-[14px] text-white">По номеру и паролю</div>
                <div className="text-[11px] text-white/35">Введите телефон и пароль</div>
              </div>
              <ArrowRight size={16} className="text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all" />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.01, backgroundColor: 'rgba(168,85,247,0.08)', borderColor: 'rgba(168,85,247,0.25)' }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setMode('login-qr')}
              className="w-full py-3.5 px-4 rounded-[1.5rem] bg-white/[0.03] border border-white/[0.06] text-white font-medium flex items-center gap-3.5 transition-all duration-200 group"
            >
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#a855f7]/20 to-[#ec4899]/20 border border-[#a855f7]/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <QrCode size={18} className="text-[#d8b4fe]" />
              </div>
              <div className="text-left flex-1">
                <div className="font-semibold text-[14px] text-white">Показать QR-код</div>
                <div className="text-[11px] text-white/35">Отсканируйте на другом устройстве</div>
              </div>
              <ArrowRight size={16} className="text-white/20 group-hover:text-white/60 group-hover:translate-x-1 transition-all" />
            </motion.button>

          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  if (mode === 'landing') {
    return (
      <AuthShell showGrid>
        <div className="text-center max-w-sm mx-4 w-full">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="relative mb-6 inline-block">
              <motion.div
                animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.3, 0.2] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 -m-4 rounded-[2rem] bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] blur-2xl"
              />
              <AuthLogo size="lg" />
            </div>

            <motion.h1
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-4xl font-black mb-2 tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #c7d2fe 50%, #818cf8 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                filter: 'drop-shadow(0 0 30px rgba(99,102,241,0.2))',
                letterSpacing: '-0.04em',
              }}
            >
              Нексо
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
              className="text-white/30 text-[12px] mb-6"
              style={{ letterSpacing: '0.06em' }}
            >
              Безопасный мессенджер нового поколения
            </motion.p>

            {!isMobile && (
              <>
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.6, duration: 0.6, type: 'spring', bounce: 0.3 }}
                  className="relative mb-5 mx-auto inline-block"
                >
                  <div
                    className="relative rounded-xl overflow-hidden"
                    style={{
                      boxShadow: qrStatus === 'confirmed'
                        ? '0 0 0 2px rgba(16,185,129,0.7), 0 0 30px rgba(16,185,129,0.4)'
                        : qrStatus === 'scanned'
                          ? '0 0 0 2px rgba(168,85,247,0.7), 0 0 30px rgba(168,85,247,0.4)'
                          : '0 0 0 2px rgba(99,102,241,0.6), 0 0 20px rgba(99,102,241,0.3)',
                      transition: 'box-shadow 0.4s ease',
                    }}
                  >
                    {qrStatus === 'confirmed' ? (
                      <div
                        className="w-56 h-56 flex flex-col items-center justify-center"
                        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.25) 0%, rgba(16,185,129,0.05) 70%)' }}
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: 'spring', bounce: 0.5 }}
                          className="w-16 h-16 rounded-[1.2rem] bg-emerald-500/30 flex items-center justify-center mb-2"
                          style={{ boxShadow: '0 0 30px rgba(16,185,129,0.5)' }}
                        >
                          <Check size={36} className="text-emerald-300" strokeWidth={2.5} />
                        </motion.div>
                        <p className="text-emerald-300 text-[13px] font-semibold">Вход выполнен</p>
                      </div>
                    ) : qrCodeUrl ? (
                      <div className="relative">
                        <img
                          src={qrCodeUrl}
                          alt="QR Code"
                          className="w-56 h-56 block"
                          style={{
                            imageRendering: 'pixelated',
                            opacity: qrStatus === 'scanned' ? 0.35 : 1,
                            filter: qrStatus === 'scanned' ? 'blur(2px)' : 'none',
                            transition: 'opacity 0.4s ease, filter 0.4s ease',
                          }}
                        />
                        {qrStatus === 'scanned' && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                              className="w-12 h-12 rounded-full border-[3px] border-white/15 border-t-purple-300 mb-2"
                            />
                            <p className="text-purple-200 text-[12px] font-semibold">Подтвердите на телефоне</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="w-56 h-56 bg-zinc-100 flex items-center justify-center">
                        <Loader2 size={32} className="text-zinc-400 animate-spin" />
                      </div>
                    )}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.5 }}
                  className="space-y-3"
                >
                  {qrStatus === 'waiting' && (
                    <>
                      <div className="flex items-center justify-center gap-2 text-white/70">
                        <motion.div
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.6)]"
                        />
                        <p className="text-[13px] font-medium">Отсканируйте QR-код для входа</p>
                      </div>
                      <p className="text-[11px] text-white/30">
                        Откройте Нексо на другом устройстве → Настройки → Устройства → Подключить
                      </p>
                    </>
                  )}
                  {qrStatus === 'scanned' && (
                    <p className="text-[13px] text-purple-300 font-medium">Ожидание подтверждения на телефоне...</p>
                  )}
                  {qrStatus === 'confirmed' && (
                    <p className="text-[13px] text-emerald-300 font-semibold">Перенаправление в мессенджер...</p>
                  )}
                  {qrStatus === 'denied' && (
                    <p className="text-[13px] text-red-300 font-medium">Вход отклонён на другом устройстве</p>
                  )}
                  {qrStatus === 'expired' && (
                    <p className="text-[13px] text-white/40 font-medium">Срок действия ссылки истёк</p>
                  )}
                </motion.div>
              </>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.5 }}
              className="flex gap-2 mt-5"
            >
              <motion.button
                whileHover={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.08)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setMode('login-method')}
                className="flex-1 py-2.5 px-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white/70 font-medium text-[13px] transition-all duration-200 backdrop-blur-sm"
              >
                Войти
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02, backgroundColor: 'rgba(99,102,241,0.15)' }}
                whileTap={{ scale: 0.97 }}
                onClick={() => { setMode('register'); setStep(1); setError(''); }}
                className="flex-1 py-2.5 px-3 rounded-2xl bg-[#6366f1]/[0.12] border border-[#6366f1]/25 text-[#a5b4fc] font-medium text-[13px] transition-all duration-200 backdrop-blur-sm"
              >
                Регистрация
              </motion.button>
            </motion.div>

            {!isMobile && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                onClick={() => {
                  navigator.clipboard.writeText(deviceLink);
                }}
                className="mt-3 text-[11px] text-white/25 hover:text-white/50 transition-colors font-mono"
              >
                {deviceLink.slice(0, 32)}...
              </motion.button>
            )}
          </motion.div>
        </div>
      </AuthShell>
    );
  }

  if (mode === 'register') {
    const profileCard = (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.03] border border-white/[0.06] rounded-3xl p-3.5 mb-5 flex items-center gap-3"
      >
        <div className="w-11 h-11 rounded-2xl overflow-hidden border-2 border-[#6366f1]/50 flex-shrink-0">
          {avatarPreview ? (
            <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white font-bold">
              {displayName ? displayName[0].toUpperCase() : username ? username[0].toUpperCase() : '?'}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate text-[14px]">
            {displayName || username || 'Новый пользователь'}
          </div>
          <div className="text-[11px] text-white/40">
            {username ? `@${username}` : `Шаг ${step} из 8`}
          </div>
        </div>
        <div className="text-[11px] text-[#a5b4fc] font-semibold bg-[#6366f1]/10 px-2 py-1 rounded-lg">
          {step}/8
        </div>
      </motion.div>
    );

    return (
      <AuthShell onBack={() => { if (step > 1) handleBack(); else setMode('landing'); }}>
        <AuthCard className="max-w-md w-full" scrollable>
          <div className="flex flex-col items-center mb-4">
            <AuthLogo size="sm" />
            <div className="mt-3">
              <AuthTitle title="Регистрация" subtitle="Создайте аккаунт Нексо" />
            </div>
          </div>

          {profileCard}

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {step === 1 && (
                <div className="space-y-3">
                  <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                    <AtSign size={14} /> Username <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="username"
                    autoFocus
                    className={`w-full px-4 py-3 rounded-2xl bg-white/[0.04] border text-white placeholder-white/25 focus:ring-2 transition-all outline-none ${
                      usernameStatus === 'taken'
                        ? 'border-red-500/50'
                        : usernameStatus === 'available'
                        ? 'border-emerald-500/50'
                        : 'border-white/[0.08]'
                    } focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20`}
                  />
                  <div className="flex justify-between items-center px-1">
                    <div>
                      {usernameStatus === 'available' && (
                        <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                          <Check size={11} /> Свободен
                        </p>
                      )}
                      {usernameStatus === 'taken' && (
                        <p className="text-[11px] text-red-400">Занят</p>
                      )}
                      {usernameStatus === 'idle' && username.length >= 3 && !/^[a-zA-Z0-9_.-]+$/.test(username) && (
                        <p className="text-[11px] text-red-400">Недопустимые символы</p>
                      )}
                      {usernameStatus === 'idle' && username.length >= 3 && /^[a-zA-Z0-9_.-]+$/.test(username) && (
                        <p className="text-[11px] text-amber-400">Ошибка проверки</p>
                      )}
                    </div>
                    <p className="text-[11px] text-white/30">{username.length}/17</p>
                  </div>
                  <p className="text-[11px] text-white/30 px-1">Латиница, цифры, -_. 3-17 символов</p>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                    <User size={14} /> Имя <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => { setDisplayName(e.target.value.slice(0, 50)); playKeyboardSound(); }}
                    placeholder="Ваше имя"
                    autoFocus
                    maxLength={50}
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none"
                  />
                  <p className="text-[11px] text-white/30 text-right px-1">{displayName.length}/50</p>
                  <p className="text-[11px] text-white/30 px-1">Можно использовать эмодзи</p>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                    <Image size={14} /> Аватарка
                  </label>
                  <div className="flex flex-col items-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={selectAvatar}
                      className={`relative w-24 h-24 rounded-[1.8rem] border-2 border-dashed flex items-center justify-center transition-all overflow-hidden ${
                        avatarPreview
                          ? 'border-[#6366f1]/60'
                          : 'border-white/[0.15] hover:border-white/30'
                      }`}
                    >
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Camera size={22} className="text-white/40" />
                      )}
                    </motion.button>
                    {avatarPreview && (
                      <button
                        onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                        className="text-[12px] text-red-400 hover:text-red-300"
                      >
                        Убрать
                      </button>
                    )}
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*,image/gif,.gif"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                    <p className="text-[11px] text-white/30 text-center">Фото или GIF. Можно пропустить</p>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                    <Calendar size={14} /> Дата рождения <span className="text-red-400">*</span>
                  </label>
                  <DatePicker value={birthday} onChange={setBirthday} />
                  {!birthday.trim() && <p className="text-[11px] text-white/30 mt-1 ml-1">Обязательное поле</p>}
                </div>
              )}

              {step === 5 && (
                <div className="space-y-3">
                  <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                    <FileText size={14} /> О себе
                  </label>
                  <textarea
                    value={bio}
                    onChange={(e) => { setBio(e.target.value.slice(0, 500)); playKeyboardSound(); }}
                    placeholder="Пара слов о вас..."
                    autoFocus
                    rows={3}
                    maxLength={500}
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all resize-none outline-none"
                  />
                  <p className="text-[11px] text-white/30 text-right px-1">{bio.length}/500</p>
                  <p className="text-[11px] text-white/30 px-1">Необязательно</p>
                </div>
              )}

              {step === 6 && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                      <Lock size={14} /> Пароль <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); playKeyboardSound(); }}
                        placeholder="От 6 до 50 символов"
                        autoFocus
                        className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all pr-11 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 p-1"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="text-[11px] text-white/30 mt-1 ml-1">{password.length}/50</p>
                  </div>
                  <div>
                    <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                      <Lock size={14} /> Подтвердите пароль <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); playKeyboardSound(); }}
                        placeholder="Повторите пароль"
                        className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all pr-11 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 p-1"
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-[11px] text-red-400 mt-1 ml-1">Пароли не совпадают</p>
                    )}
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className="space-y-3">
                  <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                    <Lock size={14} /> Облачный пароль
                  </label>
                  <input
                    type="text"
                    value={cloudPassword}
                    onChange={(e) => { setCloudPassword(e.target.value); playKeyboardSound(); }}
                    placeholder="Редко используемый, но важный"
                    autoFocus
                    className="w-full px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none"
                  />
                  <p className="text-[11px] text-white/30 px-1">Необязательно. Для входа на новых устройствах</p>
                </div>
              )}

              {step === 8 && (
                <div className="space-y-3">
                  <label className="block text-[12px] font-medium text-white/50 mb-1 ml-1 flex items-center gap-2">
                    <Phone size={14} /> Номер телефона <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="+79991234567"
                    autoFocus
                    className={`w-full px-4 py-3 rounded-2xl bg-white/[0.04] border text-white placeholder-white/25 focus:ring-2 transition-all outline-none ${
                      phoneStatus === 'taken'
                        ? 'border-red-500/50'
                        : phoneStatus === 'available'
                        ? 'border-emerald-500/50'
                        : 'border-white/[0.08]'
                    } focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20`}
                  />
                  {phoneStatus === 'available' && (
                    <p className="text-[11px] text-emerald-400 ml-1 flex items-center gap-1">
                      <Check size={11} /> Свободен
                    </p>
                  )}
                  {phoneStatus === 'taken' && (
                    <p className="text-[11px] text-red-400 ml-1">Уже зарегистрирован</p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {errorBox(error)}

          <div className="flex gap-2.5 mt-5">
            {step > 1 && (
              <motion.button
                whileHover={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                whileTap={{ scale: 0.98 }}
                onClick={handleBack}
                className="flex-1 py-3 px-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-white font-medium text-[14px] flex items-center justify-center gap-2 transition-all"
              >
                <ArrowLeft size={16} /> Назад
              </motion.button>
            )}
            {step < 8 ? (
              <motion.button
                whileHover={{ boxShadow: '0 0 25px rgba(99,102,241,0.4)' }}
                whileTap={{ scale: 0.98 }}
                onClick={handleNext}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-semibold text-[14px] flex items-center justify-center gap-2 relative overflow-hidden"
                style={{ boxShadow: '0 0 15px rgba(99,102,241,0.3)' }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
                Далее <ArrowRight size={16} />
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ boxShadow: '0 0 25px rgba(99,102,241,0.4)' }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRegister}
                disabled={isSubmitting || !isStepValid()}
                className="flex-1 py-3 px-4 rounded-2xl bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 relative overflow-hidden"
                style={{ boxShadow: '0 0 15px rgba(99,102,241,0.3)' }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full hover:translate-x-full transition-transform duration-700" />
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> Зарегистрироваться</>}
              </motion.button>
            )}
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  return null;
}
