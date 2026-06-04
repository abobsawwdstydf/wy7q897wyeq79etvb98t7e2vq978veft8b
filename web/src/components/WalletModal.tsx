import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Wallet, ArrowUpRight, ArrowDownLeft, Send, Plus,
  History, ChevronRight, AlertCircle, Check, Search,
  CreditCard, ExternalLink,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/authStore';
import { useToastStore } from '../stores/toastStore';
import BeaverIcon from './BeaverIcon';
import SidePanelWrapper from './SidePanelWrapper';

interface Transaction {
  id: string;
  amount: number;
  type: string;
  description: string | null;
  createdAt: string;
}

interface WalletModalProps {
  onClose: () => void;
  embedded?: boolean;
  initialView?: WalletView;
}

type WalletView = 'main' | 'send' | 'topup' | 'history';

export default function WalletModal({ onClose, embedded, initialView = 'main' }: WalletModalProps) {
  const { user, updateUser } = useAuthStore();
  const { success, error: showError } = useToastStore();
  const [view, setView] = useState<WalletView>(initialView);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);

  // Send beavers state
  const [sendSearch, setSendSearch] = useState('');
  const [sendResults, setSendResults] = useState<any[]>([]);
  const [sendTarget, setSendTarget] = useState<any | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [sendNote, setSendNote] = useState('');
  const [sending, setSending] = useState(false);
  const [sendSearchLoading, setSendSearchLoading] = useState(false);

  // Top-up state
  const [topupAmount, setTopupAmount] = useState('');
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupUrl, setTopupUrl] = useState<string | null>(null);

  // Load fresh balance on open
  useEffect(() => {
    const loadBalance = async () => {
      try {
        const data = await api.get('/wallet/balance');
        if (data && typeof data.beavers === 'number') {
          updateUser({ beavers: data.beavers, totalSpent: data.totalSpent, totalEarned: data.totalEarned });
        }
      } catch {
        // silent
      }
    };
    loadBalance();
  }, []);

  useEffect(() => {
    if (view === 'history') loadTransactions();
  }, [view]);

  const loadTransactions = async () => {
    setLoadingTx(true);
    try {
      const data = await api.get('/wallet/transactions');
      setTransactions(data || []);
    } catch {
      setTransactions([]);
    } finally {
      setLoadingTx(false);
    }
  };

  // Search users for sending
  useEffect(() => {
    if (!sendSearch.trim() || sendSearch.trim().length < 2) {
      setSendResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSendSearchLoading(true);
      try {
        const q = sendSearch.startsWith('@') ? sendSearch.slice(1) : sendSearch;
        const results = await api.searchUsers(q);
        setSendResults(results.filter((u: any) => u.id !== user?.id).slice(0, 8));
      } catch {
        setSendResults([]);
      } finally {
        setSendSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [sendSearch, user?.id]);

  const handleSend = async () => {
    if (!sendTarget || !sendAmount) return;
    const amount = parseInt(sendAmount);
    if (isNaN(amount) || amount <= 0) return;
    if (amount > (user?.beavers || 0)) {
      showError('Недостаточно бобров');
      return;
    }
    setSending(true);
    try {
      const result = await api.post('/wallet/send', {
        toUserId: sendTarget.id,
        amount,
        note: sendNote.trim() || undefined,
      });
      updateUser({ beavers: result.newBalance });
      success(
        <span className="flex items-center gap-1">
          Отправлено {amount} <BeaverIcon size={16} /> пользователю @{sendTarget.username}
        </span>
      );
      setSendTarget(null);
      setSendSearch('');
      setSendAmount('');
      setSendNote('');
      setView('main');
    } catch (e: any) {
      showError(e.message || 'Ошибка отправки');
    } finally {
      setSending(false);
    }
  };

  const handleTopup = async () => {
    const amount = parseInt(topupAmount);
    if (isNaN(amount) || amount < 10) {
      showError('Минимальная сумма пополнения — 10 бобров');
      return;
    }
    setTopupLoading(true);
    try {
      // Используем YooKassa вместо Нексо
      const result = await api.post('/wallet/topup', { amount });
      if (result.paymentUrl) {
        // Открываем платёж YooKassa в новом окне
        window.open(result.paymentUrl, '_blank');
        setTopupUrl(result.paymentUrl);
      } else {
        showError('Не удалось создать платёж');
      }
    } catch (e: any) {
      showError(e.message || 'Ошибка создания платежа');
    } finally {
      setTopupLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const getTxIcon = (type: string, amount: number) => {
    if (amount > 0) return <ArrowDownLeft size={16} className="text-green-400" />;
    return <ArrowUpRight size={16} className="text-red-400" />;
  };

  const getTxLabel = (type: string) => {
    const labels: Record<string, string> = {
      purchase: 'Покупка',
      admin_add: 'Начисление',
      admin_remove: 'Списание',
      premium: 'Нексо НУче',
      gift: 'Подарок',
      refund: 'Возврат',
      send: 'Отправка',
      receive: 'Получение',
      topup: 'Пополнение',
      channel_sub: 'Подписка на канал',
    };
    return labels[type] || type;
  };

  const quickAmounts = [50, 100, 200, 500, 1000];

  return (
    <SidePanelWrapper
      onClose={onClose}
      embedded={embedded}
      title={
        view === 'main' ? 'Кошелёк' :
        view === 'send' ? 'Отправить бобров' :
        view === 'topup' ? 'Пополнить баланс' :
        'История операций'
      }
      icon={view === 'main' ? <Wallet size={15} className="text-amber-400" /> : undefined}
      showBack={view !== 'main'}
    >
      <div className="overflow-y-auto flex-1">
        <AnimatePresence mode="wait">
            {/* ===== MAIN VIEW ===== */}
            {view === 'main' && (
              <motion.div
                key="main"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-4 space-y-4"
              >
                {/* Balance card */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent border border-amber-500/20 p-5">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl -translate-y-8 translate-x-8" />
                  <p className="text-xs text-amber-300/60 font-medium uppercase tracking-wider mb-1">Баланс</p>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-bold text-white">{user?.beavers || 0}</span>
                    <BeaverIcon size={36} className="mb-0.5" />
                  </div>
                  <p className="text-xs text-amber-300/50 mt-1">1 бобёр = 1 рубль</p>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setView('send')}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <Send size={18} className="text-blue-400" />
                    </div>
                    <span className="text-xs text-zinc-400">Отправить</span>
                  </button>
                  <button
                    onClick={() => setView('topup')}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center">
                      <Plus size={18} className="text-green-400" />
                    </div>
                    <span className="text-xs text-zinc-400">Пополнить</span>
                  </button>
                  <button
                    onClick={() => setView('history')}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                      <History size={18} className="text-purple-400" />
                    </div>
                    <span className="text-xs text-zinc-400">История</span>
                  </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-zinc-500 mb-1">Потрачено</p>
                    <p className="text-sm font-semibold text-red-400 flex items-center gap-1">{user?.totalSpent || 0} <BeaverIcon size={14} /></p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-zinc-500 mb-1">Получено</p>
                    <p className="text-sm font-semibold text-green-400 flex items-center gap-1">{user?.totalEarned || 0} <BeaverIcon size={14} /></p>
                  </div>
                </div>

                <p className="text-[10px] text-zinc-600 text-center">
                  Бобры — внутренняя валюта · Не являются реальными деньгами
                </p>
              </motion.div>
            )}

            {/* ===== SEND VIEW ===== */}
            {view === 'send' && (
              <motion.div
                key="send"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-4"
              >
                {!sendTarget ? (
                  <>
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Поиск по @username или имени..."
                        value={sendSearch}
                        onChange={e => setSendSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 outline-none focus:border-nexo-500/50"
                        autoFocus
                      />
                    </div>

                    {sendSearchLoading && (
                      <div className="flex justify-center py-4">
                        <div className="w-5 h-5 border-2 border-nexo-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}

                    {sendResults.length > 0 && (
                      <div className="space-y-1">
                        {sendResults.map(u => (
                          <button
                            key={u.id}
                            onClick={() => { setSendTarget(u); setSendSearch(''); }}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left"
                          >
                            <div className="w-9 h-9 rounded-full bg-nexo-500/20 flex items-center justify-center text-sm font-bold text-nexo-400 flex-shrink-0">
                              {u.avatar ? (
                                <img src={u.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                              ) : (
                                (u.displayName || u.username || '?')[0].toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">{u.displayName || u.username}</p>
                              <p className="text-xs text-zinc-500">@{u.username}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {sendSearch.trim().length >= 2 && !sendSearchLoading && sendResults.length === 0 && (
                      <p className="text-sm text-zinc-500 text-center py-4">Пользователи не найдены</p>
                    )}
                  </>
                ) : (
                  <>
                    {/* Selected user */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="w-10 h-10 rounded-full bg-nexo-500/20 flex items-center justify-center text-sm font-bold text-nexo-400 flex-shrink-0">
                        {sendTarget.avatar ? (
                          <img src={sendTarget.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          (sendTarget.displayName || sendTarget.username || '?')[0].toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{sendTarget.displayName || sendTarget.username}</p>
                        <p className="text-xs text-zinc-500">@{sendTarget.username}</p>
                      </div>
                      <button
                        onClick={() => setSendTarget(null)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="text-xs text-zinc-500 mb-2 block">Сумма (бобров)</label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="0"
                          value={sendAmount}
                          onChange={e => setSendAmount(e.target.value)}
                          min={1}
                          max={user?.beavers || 0}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg font-bold outline-none focus:border-amber-500/50 pr-12"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2"><BeaverIcon size={22} /></span>
                      </div>
                      <p className="text-xs text-zinc-600 mt-1">Доступно: {user?.beavers || 0} <BeaverIcon size={12} /></p>
                    </div>

                    {/* Quick amounts */}
                    <div className="flex gap-2 flex-wrap">
                      {[10, 50, 100, 500].map(a => (
                        <button
                          key={a}
                          onClick={() => setSendAmount(String(a))}
                          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-400 transition-colors flex items-center gap-1"
                        >
                          {a} <BeaverIcon size={12} />
                        </button>
                      ))}
                    </div>

                    {/* Note */}
                    <div>
                      <label className="text-xs text-zinc-500 mb-2 block">Комментарий (необязательно)</label>
                      <input
                        type="text"
                        placeholder="За что отправляете..."
                        value={sendNote}
                        onChange={e => setSendNote(e.target.value)}
                        maxLength={100}
                        className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-500 outline-none focus:border-nexo-500/50"
                      />
                    </div>

                    <button
                      onClick={handleSend}
                      disabled={sending || !sendAmount || parseInt(sendAmount) <= 0}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {sending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Send size={16} />
                          Отправить {sendAmount || 0} <BeaverIcon size={16} />
                        </>
                      )}
                    </button>
                  </>
                )}
              </motion.div>
            )}

            {/* ===== TOPUP VIEW ===== */}
            {view === 'topup' && (
              <motion.div
                key="topup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4 space-y-4"
              >
                {topupUrl ? (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                      <CreditCard size={28} className="text-green-400" />
                    </div>
                    <div>
                      <p className="text-white font-medium mb-1">Платёж создан</p>
                      <p className="text-sm text-zinc-400">
                        Нажмите кнопку ниже для оплаты через ЮKassa.
                        После оплаты бобры будут зачислены автоматически.
                      </p>
                    </div>
                    <a
                      href={topupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium text-sm hover:opacity-90 transition-opacity"
                    >
                      <ExternalLink size={16} />
                      Оплатить через ЮKassa
                    </a>
                    <button
                      onClick={() => { setTopupUrl(null); setTopupAmount(''); }}
                      className="w-full py-2.5 rounded-xl text-sm text-zinc-400 hover:bg-white/5 transition-colors"
                    >
                      Отмена
                    </button>
                    <p className="text-[10px] text-zinc-600">
                      После оплаты обновите страницу или подождите несколько секунд
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
                      <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300/80">
                        1 бобёр = 1 рубль. Минимальное пополнение — 10 бобров (10 ₽).
                        Пополнение через YooKassa.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs text-zinc-500 mb-2 block">Сумма пополнения</label>
                      <div className="relative">
                        <input
                          type="number"
                          placeholder="100"
                          value={topupAmount}
                          onChange={e => setTopupAmount(e.target.value)}
                          min={10}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-lg font-bold outline-none focus:border-amber-500/50 pr-16"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-zinc-400 flex items-center gap-1">
                          <BeaverIcon size={14} /> / ₽
                        </span>
                      </div>
                    </div>

                    {/* Quick amounts */}
                    <div>
                      <p className="text-xs text-zinc-500 mb-2">Быстрый выбор</p>
                      <div className="grid grid-cols-3 gap-2">
                        {quickAmounts.map(a => (
                          <button
                            key={a}
                            onClick={() => setTopupAmount(String(a))}
                            className={`py-2 rounded-xl border text-xs font-medium transition-all ${
                              topupAmount === String(a)
                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                                : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                            }`}
                          >
                            <span className="flex items-center justify-center gap-1">{a} <BeaverIcon size={12} /></span>
                            <br />
                            <span className="text-[10px] opacity-60">{a} ₽</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {topupAmount && parseInt(topupAmount) >= 10 && (
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-400">Вы получите:</span>
                          <span className="text-amber-400 font-bold flex items-center gap-1">{topupAmount} <BeaverIcon size={14} /></span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-zinc-400">К оплате:</span>
                          <span className="text-white font-bold">{topupAmount} ₽</span>
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleTopup}
                      disabled={topupLoading || !topupAmount || parseInt(topupAmount) < 10}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {topupLoading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <CreditCard size={16} />
                          Пополнить через YooKassa
                        </>
                      )}
                    </button>

                    <p className="text-[10px] text-zinc-600 text-center">
                      Пополнение обрабатывается через ЮKassa · Безопасно и быстро
                    </p>
                  </>
                )}
              </motion.div>
            )}

            {/* ===== HISTORY VIEW ===== */}
            {view === 'history' && (
              <motion.div
                key="history"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="p-4"
              >
                {loadingTx ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-nexo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className="text-center py-8">
                    <History size={32} className="text-zinc-600 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">История пуста</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {transactions.map(tx => (
                      <div
                        key={tx.id}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          tx.amount > 0 ? 'bg-green-500/20' : 'bg-red-500/20'
                        }`}>
                          {getTxIcon(tx.type, tx.amount)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {tx.description || getTxLabel(tx.type)}
                          </p>
                          <p className="text-xs text-zinc-500">{formatDate(tx.createdAt)}</p>
                        </div>
                        <span className={`text-sm font-bold flex-shrink-0 flex items-center gap-1 ${
                          tx.amount > 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount} <BeaverIcon size={14} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
      </div>
    </SidePanelWrapper>
  );
}
