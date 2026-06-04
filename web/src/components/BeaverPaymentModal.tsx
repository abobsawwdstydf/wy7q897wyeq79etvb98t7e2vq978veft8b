import { motion } from 'framer-motion';
import { X, AlertCircle, Check, Wallet } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import BeaverIcon from './BeaverIcon';

interface BeaverPaymentModalProps {
  title: string;
  description: string;
  amount: number;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  confirmText?: string;
  loading?: boolean;
}

export default function BeaverPaymentModal({
  title,
  description,
  amount,
  onConfirm,
  onCancel,
  confirmText = 'Оплатить',
  loading = false,
}: BeaverPaymentModalProps) {
  const { user } = useAuthStore();
  const hasEnough = (user?.beavers || 0) >= amount;
  const balanceAfter = (user?.beavers || 0) - amount;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-[#0f0f14] rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <Wallet size={20} className="text-amber-400" />
          </div>
          <h2 className="text-lg font-bold text-white flex-1">{title}</h2>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-400">{description}</p>

          {/* Amount card */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-transparent border border-amber-500/20 p-5">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl -translate-y-8 translate-x-8" />
            <p className="text-xs text-amber-300/60 font-medium uppercase tracking-wider mb-2">Сумма к оплате</p>
            <div className="flex items-end gap-2 mb-4">
              <span className="text-4xl font-bold text-white">{amount}</span>
              <BeaverIcon size={36} className="mb-0.5" />
            </div>

            {/* Balance info */}
            <div className="space-y-2 pt-3 border-t border-white/10">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Текущий баланс:</span>
                <span className="text-white font-medium flex items-center gap-1">
                  {user?.beavers || 0} <BeaverIcon size={14} />
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-400">Баланс после оплаты:</span>
                <span className={`font-bold flex items-center gap-1 ${hasEnough ? 'text-green-400' : 'text-red-400'}`}>
                  {balanceAfter} <BeaverIcon size={14} />
                </span>
              </div>
            </div>
          </div>

          {/* Warning if not enough */}
          {!hasEnough && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-300">
                <p className="font-medium mb-1">Недостаточно бобров</p>
                <p className="text-red-300/80">
                  Нужно {amount} <BeaverIcon size={12} className="inline" />, у вас {user?.beavers || 0} <BeaverIcon size={12} className="inline" />.
                  Пополните баланс в кошельке.
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-medium text-sm transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={onConfirm}
              disabled={!hasEnough || loading}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Check size={16} />
                  {confirmText}
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] text-zinc-600 text-center">
            Бобры — внутренняя валюта Нексо · Не являются реальными деньгами
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
