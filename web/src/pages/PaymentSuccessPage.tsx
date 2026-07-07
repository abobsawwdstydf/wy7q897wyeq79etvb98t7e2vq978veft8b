import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowLeft, Wallet } from 'lucide-react';
import BeaverIcon from '../components/BeaverIcon';

export default function PaymentSuccessPage() {
  const [amount, setAmount] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAmount(params.get('amount'));
    setLabel(params.get('label'));
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="w-full max-w-md bg-[#0f0f14] rounded-3xl border border-white/10 shadow-2xl p-8 text-center"
      >
        {/* Иконка успеха */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', damping: 15, stiffness: 400 }}
          className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6"
        >
          <CheckCircle size={40} className="text-emerald-400" />
        </motion.div>

        <h1 className="text-2xl font-bold text-white mb-2">Оплата прошла!</h1>
        <p className="text-zinc-400 text-sm mb-6">
          Ваш баланс бобров успешно пополнен
        </p>

        {amount && (
          <div className="flex items-center justify-center gap-2 mb-6 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <Wallet size={18} className="text-amber-400" />
            <span className="text-amber-300 font-semibold flex items-center gap-1">+{amount} бобров <BeaverIcon size={16} /></span>
          </div>
        )}

        {label && (
          <p className="text-xs text-zinc-600 mb-6">Транзакция: {label}</p>
        )}

        <div className="space-y-3">
          <button
            onClick={() => window.location.href = '/'}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-nexo-500 to-purple-600 text-white font-semibold text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} />
            Вернуться в Нексо
          </button>
        </div>

        <p className="text-xs text-zinc-600 mt-4">
          Бобры уже зачислены на ваш счёт. Если баланс не обновился — перезайдите в приложение.
        </p>
      </motion.div>
    </div>
  );
}
