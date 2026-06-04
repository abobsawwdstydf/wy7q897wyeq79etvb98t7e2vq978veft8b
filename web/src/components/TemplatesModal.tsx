import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, Copy } from 'lucide-react';
import { api } from '../lib/api';

interface TemplatesModalProps {
  onClose: () => void;
  onSelect: (content: string) => void;
}

interface Template {
  id: string;
  name: string;
  content: string;
  createdAt: string;
}

export default function TemplatesModal({ onClose, onSelect }: TemplatesModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newContent, setNewContent] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/templates');
      setTemplates(response);
    } catch (error) {
      console.error('Load templates error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newContent.trim()) return;

    try {
      const template = await api.post('/api/templates', {
        name: newName,
        content: newContent,
      });
      setTemplates([template, ...templates]);
      setNewName('');
      setNewContent('');
      setShowCreate(false);
    } catch (error) {
      console.error('Create template error:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/templates/${id}`);
      setTemplates(templates.filter(t => t.id !== id));
    } catch (error) {
      console.error('Delete template error:', error);
    }
  };

  const handleSelect = (content: string) => {
    onSelect(content);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 sm:inset-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-[500px] sm:h-[600px] bg-surface-secondary/95 backdrop-blur-xl rounded-2xl border border-white/10 flex flex-col z-50"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h2 className="text-lg font-semibold text-white">Шаблоны сообщений</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition"
        >
          <X size={20} className="text-white/60" />
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="p-4 border-b border-white/10 space-y-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название шаблона..."
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-nexo-500"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Содержание шаблона..."
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-nexo-500 resize-none h-24"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || !newContent.trim()}
              className="flex-1 px-3 py-2 bg-nexo-500 hover:bg-nexo-600 text-white rounded-lg transition text-sm disabled:opacity-50"
            >
              Создать
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition text-sm"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Templates list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading && (
          <div className="text-center text-white/60 py-8">Загрузка...</div>
        )}

        {!loading && templates.length === 0 && !showCreate && (
          <div className="text-center text-white/60 py-8">
            Нет шаблонов
          </div>
        )}

        <AnimatePresence>
          {templates.map(template => (
            <motion.div
              key={template.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-white/10 hover:bg-white/20 rounded-lg p-3 transition cursor-pointer group"
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  onClick={() => handleSelect(template.content)}
                  className="flex-1 min-w-0"
                >
                  <h3 className="text-white font-medium text-sm">{template.name}</h3>
                  <p className="text-white/60 text-xs line-clamp-2 mt-1">
                    {template.content}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(template.id)}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-red-400 rounded transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-nexo-500 hover:bg-nexo-600 text-white rounded-lg transition text-sm"
        >
          <Plus size={16} />
          Новый шаблон
        </button>
      </div>
    </motion.div>
  );
}
