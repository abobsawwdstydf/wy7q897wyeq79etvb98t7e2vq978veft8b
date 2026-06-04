import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, User, Phone, Mail, Copy, Check } from 'lucide-react';
import { api } from '../lib/api';
import Avatar from './Avatar';

interface ContactCardModalProps {
  chatId: string;
  onClose: () => void;
  onSend: (contact: any) => void;
}

interface Contact {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  phone?: string;
  bio?: string;
  isVerified: boolean;
}

export default function ContactCardModal({ chatId, onClose, onSend }: ContactCardModalProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/contacts/chat/${chatId}`);
      setContacts(response);
    } catch (error) {
      console.error('Load contacts error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = () => {
    if (selectedContact) {
      onSend({
        type: 'contact',
        contact: selectedContact,
      });
      onClose();
    }
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
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <User size={20} />
          Контакты
        </h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition"
        >
          <X size={20} className="text-white/60" />
        </button>
      </div>

      {/* Content */}
      {!selectedContact ? (
        <>
          {/* Contacts list */}
          <div className="flex-1 overflow-y-auto p-4">
            {contacts.length === 0 && !loading && (
              <button
                onClick={loadContacts}
                className="w-full py-3 bg-nexo-500 hover:bg-nexo-600 text-white rounded-lg transition"
              >
                Загрузить контакты
              </button>
            )}

            {loading && (
              <div className="text-center text-white/60 py-8">Загрузка...</div>
            )}

            <div className="space-y-2">
              {contacts.map(contact => (
                <button
                  key={contact.id}
                  onClick={() => setSelectedContact(contact)}
                  className="w-full p-3 bg-white/10 hover:bg-white/20 rounded-lg transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      src={contact.avatar}
                      name={contact.displayName}
                      size="sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-medium truncate">
                        {contact.displayName}
                      </div>
                      <div className="text-white/60 text-sm truncate">
                        @{contact.username}
                      </div>
                    </div>
                    {contact.isVerified && (
                      <div className="text-nexo-500">✓</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Contact details */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="text-center">
              <Avatar
                src={selectedContact.avatar}
                name={selectedContact.displayName}
                size="lg"
              />
              <h3 className="text-lg font-semibold text-white mt-3">
                {selectedContact.displayName}
              </h3>
              <p className="text-white/60 text-sm">@{selectedContact.username}</p>
              {selectedContact.bio && (
                <p className="text-white/60 text-sm mt-2">{selectedContact.bio}</p>
              )}
            </div>

            {selectedContact.phone && (
              <div className="bg-white/10 rounded-lg p-3">
                <div className="flex items-center gap-2 text-white/60 text-sm mb-2">
                  <Phone size={16} />
                  Телефон
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white font-mono">{selectedContact.phone}</span>
                  <button
                    onClick={() => handleCopyPhone(selectedContact.phone!)}
                    className="p-2 hover:bg-white/10 rounded transition"
                  >
                    {copied ? (
                      <Check size={16} className="text-green-400" />
                    ) : (
                      <Copy size={16} className="text-white/60" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 p-4 border-t border-white/10">
            <button
              onClick={() => setSelectedContact(null)}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition text-sm"
            >
              Назад
            </button>

            <button
              onClick={handleSend}
              className="ml-auto px-4 py-2 bg-nexo-500 hover:bg-nexo-600 text-white rounded-lg transition text-sm"
            >
              Отправить контакт
            </button>
          </div>
        </>
      )}
    </motion.div>
  );
}
