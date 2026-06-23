import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../stores/authStore';
import { api } from '../lib/api';
import { connectSocket } from '../lib/socket';
import {
  Eye, EyeOff, ArrowRight, ArrowLeft, Camera, Check,
  Smartphone, Lock, User, Calendar, FileText, Phone, AtSign,
  Loader2, X, Shield, Sparkles,
} from 'lucide-react';
import DatePicker from '../components/DatePicker';
import { playKeyboardSound } from '../lib/sounds';
import QRCode from '../lib/qrcode';
import { useResponsive } from '../hooks/useResponsive';

function formatPhone(v: string) {
  const c = v.replace(/[^\d+]/g, '');
  if (c.startsWith('8') && c.length === 1) return '+7';
  if (c.startsWith('8') && c.length > 1) return '+7' + c.slice(1);
  if (!c.startsWith('+') && c.length > 0) return '+' + c;
  return c;
}

const GLASS = {
  background: 'rgba(20, 20, 24, 0.7)',
  backdropFilter: 'blur(40px)',
  WebkitBackdropFilter: 'blur(40px)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  boxShadow: '0 8px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
} as React.CSSProperties;

const ErrorBanner = ({ msg }: { msg: string }) => (
  <AnimatePresence>
    {msg && (
      <motion.div
        key={msg}
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className="mt-3 p-3.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-[13px] flex items-center gap-2.5"
        style={{ boxShadow: '0 0 20px rgba(239,68,68,0.15), inset 0 1px 0 rgba(239,68,68,0.1)' }}
      >
        <div className="w-5 h-5 rounded-full bg-red-500/25 flex items-center justify-center flex-shrink-0">
          <X size={11} className="text-red-400" />
        </div>
        <span className="font-medium">{msg}</span>
      </motion.div>
    )}
  </AnimatePresence>
);

const InputField = ({
  icon: Icon, type = 'text', value, onChange, placeholder, autoFocus, autoComplete, inputMode,
  className = '', right, disabled, onKeyDown
}: {
  icon: any; type?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; autoFocus?: boolean; autoComplete?: string; inputMode?: string;
  className?: string; right?: React.ReactNode; disabled?: boolean; onKeyDown?: (e: React.KeyboardEvent) => void;
}) => (
  <div className="relative">
    <Icon size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none" />
    <input
      type={type} value={value} onChange={onChange} placeholder={placeholder}
      autoFocus={autoFocus} autoComplete={autoComplete} inputMode={inputMode as any}
      disabled={disabled} onKeyDown={onKeyDown}
      className={`w-full pl-10 ${right ? 'pr-11' : 'pr-4'} py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none disabled:opacity-40 text-[15px] ${className}`}
    />
    {right && <div className="absolute right-2 top-1/2 -translate-y-1/2">{right}</div>}
  </div>
);

type Mode = 'landing' | 'register' | 'login-code' | 'register-done';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('landing');
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { isMobile } = useResponsive();
  const { login, register, user } = useAuthStore();

  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [bio, setBio] = useState('');
  const [birthday, setBirthday] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cloudPassword, setCloudPassword] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginShowPw, setLoginShowPw] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const codeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [verificationCode, setVerificationCode] = useState('');

  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [phoneStatus, setPhoneStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');

  const avatarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (username.length < 3 || username.length > 17 || !/^[a-zA-Z0-9_.-]+$/.test(username)) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const t = setTimeout(async () => {
      try { const r = await api.checkUsername(username); setUsernameStatus(r.available ? 'available' : 'taken'); }
      catch { setUsernameStatus('idle'); }
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

  useEffect(() => { setError(''); setCodeSent(false); }, [mode]);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); if (codeTimerRef.current) clearInterval(codeTimerRef.current); }, []);

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setError('Файл не более 10MB'); return; }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
    setError('');
  };

  const stepOk = useCallback((): boolean => {
    switch (step) {
      case 1: return username.length >= 3 && username.length <= 17 && usernameStatus === 'available' && displayName.trim().length > 0;
      case 2: return /^\+\d{7,15}$/.test(phone) && phoneStatus !== 'taken';
      case 3: return password.length >= 6 && password.length <= 50 && password === confirmPassword;
      case 4: return true;
      default: return false;
    }
  }, [step, username, usernameStatus, displayName, phone, phoneStatus, password, confirmPassword]);

  const validate = (): boolean => {
    if (step === 1) {
      if (username.length < 3) { setError('Минимум 3 символа'); return false; }
      if (usernameStatus === 'taken') { setError('Username занят'); return false; }
      if (!/^[a-zA-Z0-9_.-]+$/.test(username)) { setError('Только латиница, цифры и -_.'); return false; }
      if (displayName.trim().length === 0) { setError('Введите имя'); return false; }
      return true;
    }
    if (step === 2) {
      if (!/^\+\d{7,15}$/.test(phone)) { setError('Введите корректный номер'); return false; }
      if (phoneStatus === 'taken') { setError('Номер уже зарегистрирован'); return false; }
      return true;
    }
    if (step === 3) {
      if (password.length < 6) { setError('Пароль минимум 6 символов'); return false; }
      if (password !== confirmPassword) { setError('Пароли не совпадают'); return false; }
      return true;
    }
    return true;
  };

  const nextStep = () => { setError(''); if (validate() && step < 4) setStep(step + 1); };
  const prevStep = () => { setError(''); if (step > 1) setStep(step - 1); };

  const handleLogin = async () => {
    setError('');
    if (!/^\+\d{7,15}$/.test(phone)) { setError('Введите корректный номер'); return; }
    if (loginPassword.length < 6) { setError('Пароль минимум 6 символов'); return; }
    setSubmitting(true);
    try { await login(phone, loginPassword); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка входа'); }
    finally { setSubmitting(false); }
  };

  const handleSendCode = async () => {
    setError('');
    if (!/^\+\d{7,15}$/.test(phone)) { setError('Введите корректный номер'); return; }
    setSubmitting(true);
    try {
      await api.sendCode(phone);
      setCodeSent(true);
      setCodeCountdown(60);
      if (codeTimerRef.current) clearInterval(codeTimerRef.current);
      const id = setInterval(() => {
        setCodeCountdown(prev => prev <= 1 ? (clearInterval(id), 0) : prev - 1);
      }, 1000);
      codeTimerRef.current = id;
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка отправки кода'); }
    finally { setSubmitting(false); }
  };

  const handleLoginCode = async () => {
    setError('');
    if (!/^\+\d{7,15}$/.test(phone)) { setError('Введите корректный номер'); return; }
    if (verificationCode.length !== 6) { setError('Введите 6-значный код'); return; }
    setSubmitting(true);
    try {
      const result = await api.verifyCode(phone, verificationCode);
      if (result.csrfToken) api.setCsrfToken(result.csrfToken);
      localStorage.setItem('nexo_user', JSON.stringify(result.user));
      if (result.accessToken) {
        localStorage.setItem('nexo_access_token', result.accessToken);
        connectSocket(result.accessToken);
      }
      useAuthStore.setState({ user: result.user, isLoading: false });
      setTimeout(() => {
        import('../lib/notifications').then(m => m.subscribeToNotifications().catch(() => {}));
      }, 2000);
    }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setSubmitting(false); }
  };

  const handleLoginCloud = async () => {
    setError('');
    if (!/^\+\d{7,15}$/.test(phone)) { setError('Введите корректный номер'); return; }
    if (!cloudPassword.trim()) { setError('Введите облачный пароль'); return; }
    setSubmitting(true);
    try { await login(phone, cloudPassword); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка'); }
    finally { setSubmitting(false); }
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setError('');
    setSubmitting(true);
    try {
      await register({
        username, displayName: displayName || username, phone, password,
        bio: bio || undefined, birthday: birthday || undefined, avatar: avatarFile || undefined,
      });
      setMode('register-done');
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Ошибка регистрации'); }
    finally { setSubmitting(false); }
  };

  const genToken = () => { const a = new Uint8Array(32); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); };
  const [deviceToken, setDeviceToken] = useState(genToken);
  const deviceLink = `${window.location.origin}/device?device=${deviceToken}`;
  const [qrUrl, setQrUrl] = useState('');
  const [qrStatus, setQrStatus] = useState<'waiting' | 'scanned' | 'confirmed' | 'denied' | 'expired'>('waiting');
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const regenQR = () => { setDeviceToken(genToken()); setQrStatus('waiting'); };

  useEffect(() => {
    api.post('/auth/device/init', { token: deviceToken }).catch(() => {});
    try {
      const url = QRCode.toDataURL(deviceLink, { width: 256, margin: 2, color: { dark: '#000000', light: '#ffffff' } });
      setQrUrl(url || '');
    } catch {}
  }, [deviceLink, deviceToken]);

  useEffect(() => {
    if (user) return;
    const start = Date.now();
    qrPollRef.current = setInterval(async () => {
      if (Date.now() - start > 5 * 60 * 1000) {
        clearInterval(qrPollRef.current!);
        regenQR();
        return;
      }
      try {
        const r: any = await api.get(`/auth/device/check?device=${deviceToken}`);
        if (!r) return;
        if (r.scanned) setQrStatus('scanned');
        if (r.confirmed && r.user) {
          clearInterval(qrPollRef.current!);
          setQrStatus('confirmed');
          try { useAuthStore.getState().loginWithToken(r.accessToken || '', r.user); } catch {}
        } else if (r.denied) {
          clearInterval(qrPollRef.current!);
          setQrStatus('denied');
        }
      } catch {}
    }, 2000);
    return () => { if (qrPollRef.current) clearInterval(qrPollRef.current); };
  }, [deviceToken, user]);

  if (mode === 'register-done') {
    return (
      <div className="h-full flex items-center justify-center bg-[#09090b] overflow-y-auto relative">
        <Background />
        <div className="relative z-10 text-center max-w-sm mx-4">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.4 }}
            className="relative w-20 h-20 rounded-[1.5rem] bg-emerald-500/20 flex items-center justify-center mx-auto mb-5"
            style={{ boxShadow: '0 0 40px rgba(16,185,129,0.3)' }}>
            <motion.div animate={{ scale: [1, 1.5, 1.5], opacity: [0.5, 0, 0] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 rounded-[1.5rem] bg-emerald-500/30" />
            <Check size={40} className="text-emerald-400 relative z-10" />
          </motion.div>
          <h2 className="text-2xl font-bold mb-2" style={{ background: 'linear-gradient(135deg, #fff, #6ee7b7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Добро пожаловать!
          </h2>
          <p className="text-white/40 text-[14px]">Загрузка мессенджера...</p>
          <div className="mt-6 flex items-center justify-center gap-1.5">
            {[0, 1, 2].map(i => (
              <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }} transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }} className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'login-code') {
    return (
      <div className="h-full flex items-center justify-center bg-[#09090b] overflow-y-auto relative">
        <Background />
        <BackButton onClick={() => { setMode('landing'); setCodeSent(false); setVerificationCode(''); setError(''); }} />
        <div className="relative z-10 w-full max-w-sm mx-4">
          <GlassCard>
            <div className="flex flex-col items-center mb-5">
              <SmallLogo />
              <h2 className="text-lg font-bold mt-3" style={{ background: 'linear-gradient(135deg, #fff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Вход по коду
              </h2>
              <p className="text-[12px] text-white/30 mt-1">{codeSent ? `Код отправлен на ${phone}` : 'Код подтверждения для входа'}</p>
            </div>

            {!codeSent ? (
              <div className="space-y-3">
                <InputField icon={Phone} type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="+79991234567" autoFocus autoComplete="tel" inputMode="tel" onKeyDown={e => e.key === 'Enter' && handleSendCode()} />
                <button onClick={handleSendCode} disabled={submitting || !/^\+\d{7,15}$/.test(phone)}
                  className="w-full py-3.5 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-white"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.3), 0 6px 20px rgba(0,0,0,0.2)' }}>
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <>Отправить код</>}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-2 justify-center mb-2">
                  {[0, 1, 2, 3, 4, 5].map(i => (
                    <input key={i} type="text" inputMode="numeric" maxLength={1}
                      value={verificationCode[i] || ''}
                      onChange={e => {
                        const v = e.target.value.replace(/[^0-9]/g, '');
                        if (v) {
                          const c = verificationCode.split(''); c[i] = v; setVerificationCode(c.join(''));
                          if (i < 5) (e.target.nextElementSibling as HTMLInputElement)?.focus();
                        }
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Backspace' && !verificationCode[i] && i > 0)
                          (e.currentTarget.previousElementSibling as HTMLInputElement)?.focus();
                      }}
                      onPaste={e => {
                        const p = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
                        if (p) { e.preventDefault(); setVerificationCode(p.padEnd(6, '')); (e.currentTarget.parentElement?.children[Math.min(p.length, 5)] as HTMLInputElement)?.focus(); }
                      }}
                      className="w-11 h-13 text-center text-lg font-bold rounded-xl bg-white/[0.04] border border-white/[0.08] text-white focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none"
                    />
                  ))}
                </div>

                <button onClick={handleLoginCode} disabled={submitting || verificationCode.length !== 6}
                  className="w-full py-3.5 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-white"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.3), 0 6px 20px rgba(0,0,0,0.2)' }}>
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} /> Войти</>}
                </button>

                <div className="text-center">
                  {codeCountdown > 0 ? (
                    <p className="text-[12px] text-white/30">Отправить повторно через {codeCountdown} сек</p>
                  ) : (
                    <button onClick={handleSendCode} className="text-[12px] text-[#a5b4fc] hover:text-[#c4b5fd] transition-colors">
                      Отправить код повторно
                    </button>
                  )}
                </div>

                <div className="text-center">
                  <button onClick={() => { setCodeSent(false); setVerificationCode(''); setError(''); }} className="text-[12px] text-white/40 hover:text-[#a5b4fc] transition-colors">
                    Сменить номер
                  </button>
                </div>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-white/[0.06] text-center">
              <button onClick={() => { setCodeSent(false); setVerificationCode(''); setMode('landing'); setError(''); }} className="text-[12px] text-white/40 hover:text-[#a5b4fc] transition-colors">
                Войти по паролю
              </button>
            </div>

            <ErrorBanner msg={error} />
          </GlassCard>
        </div>
      </div>
    );
  }

  if (mode === 'register') {
    const total = 4;
    return (
      <div className="h-full flex items-center justify-center bg-[#09090b] overflow-y-auto relative">
        <Background />
        <BackButton onClick={() => { if (step > 1) prevStep(); else setMode('landing'); }} />
        <div className="relative z-10 w-full max-w-sm mx-4">
          <GlassCard scrollable>
            <div className="flex flex-col items-center mb-3">
              <SmallLogo />
              <h2 className="text-lg font-bold mt-3" style={{ background: 'linear-gradient(135deg, #fff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Регистрация
              </h2>
              <p className="text-[12px] text-white/30 mt-1">Шаг {step} из {total}</p>
            </div>

            {/* Profile preview */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 mb-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-[#6366f1]/50 flex-shrink-0">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#6366f1] to-[#a855f7] flex items-center justify-center text-white font-bold text-sm">
                    {displayName ? displayName[0].toUpperCase() : username ? username[0].toUpperCase() : '?'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white truncate text-[13px]">{displayName || username || 'Новый пользователь'}</div>
                <div className="text-[11px] text-white/40">{username ? `@${username}` : `Шаг ${step} из ${total}`}</div>
              </div>
            </div>

            {/* Steps */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${n === step ? 'bg-[#6366f1] text-white scale-110' : n < step ? 'bg-[#6366f1]/30 text-[#a5b4fc]' : 'bg-white/[0.06] text-white/30'}`}>
                    {n < step ? <Check size={12} /> : n}
                  </div>
                  {n < 4 && <div className={`w-4 h-[2px] rounded-full ${n < step ? 'bg-[#6366f1]/50' : 'bg-white/[0.08]'}`} />}
                </div>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>

                {step === 1 && (
                  <div className="space-y-3">
                    <label className="block text-[12px] font-medium text-white/50 ml-1 flex items-center gap-2"><AtSign size={14} /> Username <span className="text-red-400">*</span></label>
                    <input type="text" value={username} onChange={e => { const v = e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 17); setUsername(v); playKeyboardSound(); }}
                      placeholder="username" autoFocus autoComplete="username"
                      className={`w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border text-white placeholder-white/25 focus:ring-2 transition-all outline-none ${usernameStatus === 'taken' ? 'border-red-500/50' : usernameStatus === 'available' ? 'border-emerald-500/50' : 'border-white/[0.08]'} focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20`} />
                    <div className="flex justify-between items-center px-1">
                      <div>
                        {usernameStatus === 'available' && <p className="text-[11px] text-emerald-400 flex items-center gap-1"><Check size={11} /> Свободен</p>}
                        {usernameStatus === 'taken' && <p className="text-[11px] text-red-400">Занят</p>}
                        {usernameStatus === 'idle' && username.length >= 3 && !/^[a-zA-Z0-9_.-]+$/.test(username) && <p className="text-[11px] text-red-400">Недопустимые символы</p>}
                      </div>
                      <p className="text-[11px] text-white/30">{username.length}/17</p>
                    </div>
                    <p className="text-[11px] text-white/30 px-1">Латиница, цифры, -_. 3-17 символов</p>

                    <label className="block text-[12px] font-medium text-white/50 ml-1 flex items-center gap-2 pt-1"><User size={14} /> Имя <span className="text-red-400">*</span></label>
                    <input type="text" value={displayName} onChange={e => { setDisplayName(e.target.value.slice(0, 50)); playKeyboardSound(); }}
                      placeholder="Ваше имя" autoComplete="name"
                      className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none" />
                    <p className="text-[11px] text-white/30 text-right px-1">{displayName.length}/50</p>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-3">
                    <label className="block text-[12px] font-medium text-white/50 ml-1 flex items-center gap-2"><Phone size={14} /> Номер телефона <span className="text-red-400">*</span></label>
                    <input type="tel" value={phone} onChange={e => { setPhone(formatPhone(e.target.value)); playKeyboardSound(); }}
                      placeholder="+79991234567" autoFocus autoComplete="tel" inputMode="tel"
                      className={`w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border text-white placeholder-white/25 focus:ring-2 transition-all outline-none ${phoneStatus === 'taken' ? 'border-red-500/50' : phoneStatus === 'available' ? 'border-emerald-500/50' : 'border-white/[0.08]'} focus:border-[#6366f1]/50 focus:ring-[#6366f1]/20`} />
                    {phoneStatus === 'available' && <p className="text-[11px] text-emerald-400 ml-1 flex items-center gap-1"><Check size={11} /> Свободен</p>}
                    {phoneStatus === 'taken' && <p className="text-[11px] text-red-400 ml-1">Уже зарегистрирован</p>}
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-3">
                    <label className="block text-[12px] font-medium text-white/50 ml-1 flex items-center gap-2"><Lock size={14} /> Пароль <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <input type={showPw ? 'text' : 'password'} value={password} onChange={e => { setPassword(e.target.value); playKeyboardSound(); }}
                        placeholder="От 6 до 50 символов" autoFocus autoComplete="new-password"
                        className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all pr-11 outline-none" />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 p-1">
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="text-[11px] text-white/30 px-1">{password.length}/50</p>

                    <label className="block text-[12px] font-medium text-white/50 ml-1 flex items-center gap-2 pt-1"><Shield size={14} /> Подтвердите пароль <span className="text-red-400">*</span></label>
                    <div className="relative">
                      <input type={showPw2 ? 'text' : 'password'} value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); playKeyboardSound(); }}
                        placeholder="Повторите пароль" autoComplete="new-password"
                        className="w-full px-4 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all pr-11 outline-none" />
                      <button type="button" onClick={() => setShowPw2(!showPw2)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 p-1">
                        {showPw2 ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && <p className="text-[11px] text-red-400 px-1">Пароли не совпадают</p>}
                  </div>
                )}

                {step === 4 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[12px] font-medium text-white/50 mb-2 ml-1 flex items-center gap-2"><Camera size={14} /> Аватарка</label>
                      <div className="flex items-center gap-3">
                        <button onClick={() => avatarRef.current?.click()}
                          className={`relative w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden transition-all ${avatarPreview ? 'border-[#6366f1]/60' : 'border-white/[0.15] hover:border-white/30'}`}>
                          {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : <Camera size={20} className="text-white/40" />}
                        </button>
                        {avatarPreview && <button onClick={() => { setAvatarFile(null); setAvatarPreview(null); }} className="text-[12px] text-red-400 hover:text-red-300">Убрать</button>}
                        <input ref={avatarRef} type="file" accept="image/*" onChange={handleAvatar} className="hidden" />
                        <p className="text-[11px] text-white/30">Фото или GIF</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-white/50 mb-1.5 ml-1 flex items-center gap-2"><Calendar size={14} /> Дата рождения</label>
                      <DatePicker value={birthday} onChange={setBirthday} />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-white/50 mb-1.5 ml-1 flex items-center gap-2"><FileText size={14} /> О себе</label>
                      <textarea value={bio} onChange={e => { setBio(e.target.value.slice(0, 500)); playKeyboardSound(); }}
                        placeholder="Пара слов о вас..." rows={2} maxLength={500}
                        className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all resize-none outline-none" />
                      <p className="text-[11px] text-white/30 text-right px-1">{bio.length}/500</p>
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-white/50 mb-1.5 ml-1 flex items-center gap-2"><Lock size={14} /> Облачный пароль</label>
                      <input type="text" value={cloudPassword} onChange={e => { setCloudPassword(e.target.value); playKeyboardSound(); }}
                        placeholder="Необязательно" className="w-full px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white placeholder-white/25 focus:border-[#6366f1]/50 focus:ring-2 focus:ring-[#6366f1]/20 transition-all outline-none" />
                      <p className="text-[11px] text-white/30 px-1 mt-1">Для входа на новых устройствах</p>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            <ErrorBanner msg={error} />

            <div className="flex gap-2.5 mt-5">
              {step > 1 && (
                <button onClick={prevStep}
                  className="flex-1 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white font-medium text-[14px] flex items-center justify-center gap-2 min-h-[48px] transition-all hover:bg-white/[0.06]">
                  <ArrowLeft size={16} /> Назад
                </button>
              )}
              {step < total ? (
                <button onClick={nextStep}
                  className="flex-1 py-3.5 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 min-h-[48px] text-white transition-all hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 15px rgba(99,102,241,0.3)' }}>
                  Далее <ArrowRight size={16} />
                </button>
              ) : (
                <button onClick={handleRegister} disabled={submitting || !stepOk()}
                  className="flex-1 py-3.5 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 min-h-[48px] text-white transition-all hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 15px rgba(99,102,241,0.3)' }}>
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> Зарегистрироваться</>}
                </button>
              )}
            </div>
          </GlassCard>
        </div>
      </div>
    );
  }

  // ═══════ LANDING: Phone + Password together ═══════
  return (
    <div className="h-full flex items-center justify-center bg-[#09090b] overflow-y-auto relative">
      <Background />

      <div className="relative z-10 w-full max-w-sm mx-4">
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-6">
          <div className="relative mb-4 inline-block">
            <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.2, 0.3, 0.2] }} transition={{ duration: 4, repeat: Infinity }}
              className="absolute inset-0 -m-4 rounded-[2rem] bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] blur-2xl" />
            <motion.img
              src="/logo.png" alt="Нексо"
              className="relative w-20 h-20 rounded-[1.5rem] shadow-lg shadow-[#6366f1]/25 object-cover"
              style={{ boxShadow: '0 0 60px rgba(99,102,241,0.3), 0 25px 60px rgba(0,0,0,0.5)' }}
              initial={{ rotate: -180, scale: 0 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ duration: 0.6, type: 'spring', bounce: 0.4 }}
            />
          </div>
          <motion.h1 initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="text-3xl sm:text-4xl font-black mb-1 tracking-tight"
            style={{ background: 'linear-gradient(135deg, #fff, #c7d2fe, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.04em' }}>
            Нексо
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
            className="text-white/30 text-[12px]" style={{ letterSpacing: '0.06em' }}>
            Безопасный мессенджер нового поколения
          </motion.p>
        </motion.div>

        {/* Login card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}>
          <div style={GLASS} className="rounded-2xl p-5 relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#6366f1]/30 to-transparent" />

            <div className="space-y-3">
              <InputField icon={Phone} type="tel" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="+79991234567" autoFocus autoComplete="tel" inputMode="tel" onKeyDown={e => e.key === 'Enter' && (loginPassword ? handleLogin() : undefined)} />
              <InputField icon={Lock} type={loginShowPw ? 'text' : 'password'} value={loginPassword} onChange={e => setLoginPassword(e.target.value)} placeholder="Пароль" autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && handleLogin()}
                right={<button type="button" onClick={() => setLoginShowPw(!loginShowPw)} className="text-white/30 hover:text-white/70 p-1">{loginShowPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>} />

              <button onClick={handleLogin} disabled={submitting}
                className="w-full py-3.5 rounded-xl font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-white hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 0 20px rgba(99,102,241,0.3), 0 6px 20px rgba(0,0,0,0.2)' }}>
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} /> Войти</>}
              </button>

              <ErrorBanner msg={error} />
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <button onClick={() => { setMode('login-code'); setError(''); }} className="text-[12px] text-white/40 hover:text-[#a5b4fc] transition-colors">
                Войти по коду
              </button>
              <button onClick={() => { setMode('register'); setStep(1); setError(''); }} className="text-[12px] text-[#a5b4fc] hover:text-[#c4b5fd] font-medium transition-colors">
                Регистрация
              </button>
            </div>
          </div>
        </motion.div>

        {/* QR on desktop */}
        {!isMobile && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
            className="mt-5 text-center">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-[1px] bg-white/[0.06]" />
              <span className="text-[11px] text-white/20 uppercase tracking-wider">или</span>
              <div className="flex-1 h-[1px] bg-white/[0.06]" />
            </div>
            <p className="text-[13px] text-white/50 mb-3">
              {qrStatus === 'waiting' ? 'Отсканируйте QR для входа' : qrStatus === 'scanned' ? 'Подтвердите на телефоне...' : qrStatus === 'confirmed' ? 'Вход выполнен' : qrStatus === 'denied' ? 'Отклонено' : 'Истёк'}
            </p>
            <div className="relative mx-auto inline-block rounded-xl overflow-hidden" style={{
              boxShadow: qrStatus === 'confirmed' ? '0 0 0 2px rgba(16,185,129,0.7), 0 0 20px rgba(16,185,129,0.3)'
                : qrStatus === 'scanned' ? '0 0 0 2px rgba(168,85,247,0.7), 0 0 20px rgba(168,85,247,0.3)'
                : '0 0 0 1px rgba(99,102,241,0.3)',
            }}>
              {qrStatus === 'confirmed' ? (
                <div className="w-44 h-44 flex flex-col items-center justify-center bg-emerald-500/10">
                  <Check size={36} className="text-emerald-300" />
                </div>
              ) : qrUrl ? (
                <img src={qrUrl} alt="QR" className="w-44 h-44 block" style={{ imageRendering: 'pixelated', opacity: qrStatus === 'scanned' ? 0.3 : 1, filter: qrStatus === 'scanned' ? 'blur(3px)' : 'none', transition: 'all 0.4s' }} />
              ) : (
                <div className="w-44 h-44 bg-white/5 flex items-center justify-center"><Loader2 size={24} className="text-white/30 animate-spin" /></div>
              )}
            </div>
            {(qrStatus === 'denied' || qrStatus === 'expired') && (
              <button onClick={regenQR} className="mt-3 text-[12px] text-[#a5b4fc] hover:text-[#c4b5fd] transition-colors">Попробовать снова</button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Background() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.06, 0.12, 0.06] }} transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-1/4 left-1/3 w-[400px] h-[400px] rounded-full bg-[#6366f1] blur-[120px]" />
      <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.04, 0.08, 0.04] }} transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        className="absolute bottom-1/4 right-1/3 w-[350px] h-[350px] rounded-full bg-[#8b5cf6] blur-[100px]" />
      <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.03, 0.06, 0.03] }} transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#a855f7] blur-[80px]" />
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} onClick={onClick}
      className="fixed sm:absolute top-3 left-3 sm:top-4 sm:left-4 p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.08] transition-all text-white/50 hover:text-white/80 z-20"
      style={{ marginTop: 'max(0px, env(safe-area-inset-top))' }}>
      <ArrowLeft size={18} />
    </motion.button>
  );
}

function SmallLogo() {
  return (
    <motion.div initial={{ rotate: -180, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ duration: 0.5, type: 'spring', bounce: 0.4 }}
      className="relative">
      <div className="absolute inset-0 -m-2 bg-[#6366f1]/30 blur-xl" />
      <img src="/logo.png" alt="Нексо" className="relative w-12 h-12 rounded-[1rem] shadow-lg shadow-[#6366f1]/25 object-cover" />
    </motion.div>
  );
}

function GlassCard({ children, className = '', scrollable = false }: { children: React.ReactNode; className?: string; scrollable?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      style={GLASS}
      className={`rounded-2xl p-5 relative overflow-hidden ${className}`}>
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#6366f1]/30 to-transparent" />
      <div className={scrollable ? 'max-h-[calc(100dvh-6rem)] sm:max-h-[calc(100vh-2rem)] overflow-y-auto scrollbar-hide' : ''}>
        {children}
      </div>
    </motion.div>
  );
}
