import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Award, TrendingUp, Lock } from 'lucide-react';
import { api } from '../lib/api';
import { useToastStore } from '../stores/toastStore';
import BeaverIcon from './BeaverIcon';

interface NFTCollectionsModalProps {
  onClose: () => void;
}

export default function NFTCollectionsModal({ onClose }: NFTCollectionsModalProps) {
  const [collections, setCollections] = useState<any[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { success, error } = useToastStore();

  useEffect(() => {
    loadCollections();
  }, []);

  const loadCollections = async () => {
    try {
      const data = await api.getNFTCollections();
      setCollections(data as any[]);
    } catch (err) {
      console.error('Error loading collections:', err);
      error('Не удалось загрузить коллекции');
    } finally {
      setIsLoading(false);
    }
  };

  const loadProgress = async (collectionId: string) => {
    try {
      const data = await api.getCollectionProgress(collectionId);
      setProgress(data as any);
    } catch (err) {
      console.error('Error loading progress:', err);
    }
  };

  const handleSelectCollection = async (collection: any) => {
    setSelectedCollection(collection);
    await loadProgress(collection.id);
  };

  const handleClaimReward = async () => {
    if (!selectedCollection) return;

    try {
      const result: any = await api.claimCollectionReward(selectedCollection.id);
      success(`Получено ${result.reward} бобров!`);
      await loadProgress(selectedCollection.id);
    } catch (err: any) {
      console.error('Error claiming reward:', err);
      error(err.response?.data?.error || 'Не удалось получить награду');
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} />
      
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed inset-0 sm:inset-auto sm:right-3 sm:top-3 sm:bottom-3 sm:w-[600px] sm:rounded-2xl z-50 bg-surface-secondary border border-border flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Award size={20} className="text-nexo-400" />
            NFT Коллекции
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-zinc-500">Загрузка...</div>
            </div>
          ) : selectedCollection ? (
            <div className="p-4 space-y-4">
              {/* Back button */}
              <button onClick={() => setSelectedCollection(null)} className="text-sm text-nexo-400 hover:text-nexo-300">
                ← Назад к коллекциям
              </button>

              {/* Collection header */}
              <div className="bg-surface rounded-xl p-4">
                {selectedCollection.imageUrl && (
                  <img src={selectedCollection.imageUrl} alt={selectedCollection.name} className="w-full h-32 object-cover rounded-lg mb-3" />
                )}
                <h3 className="text-xl font-bold mb-2">{selectedCollection.name}</h3>
                {selectedCollection.description && (
                  <p className="text-sm text-zinc-400 mb-3">{selectedCollection.description}</p>
                )}
                <div className="flex items-center gap-2 text-sm">
                  <BeaverIcon size={16} />
                  <span className="text-nexo-400 font-medium">{selectedCollection.reward} бобров</span>
                  <span className="text-zinc-500">за завершение</span>
                </div>
              </div>

              {/* Progress */}
              {progress && (
                <div className="bg-surface rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Прогресс</span>
                    <span className="text-sm text-zinc-400">{progress.ownedCards}/{progress.totalCards}</span>
                  </div>
                  <div className="w-full bg-surface-secondary rounded-full h-2 overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${progress.progress}%` }} className="h-full bg-gradient-to-r from-nexo-500 to-purple-500" />
                  </div>
                  {progress.completed && !progress.completedAt && (
                    <button onClick={handleClaimReward} className="w-full py-2 bg-nexo-500 hover:bg-nexo-600 rounded-lg font-medium transition-colors">
                      Получить награду
                    </button>
                  )}
                  {progress.completedAt && (
                    <div className="text-center text-sm text-green-400">
                      ✓ Награда получена {new Date(progress.completedAt).toLocaleDateString('ru')}
                    </div>
                  )}
                </div>
              )}

              {/* Cards */}
              <div>
                <h4 className="text-sm font-medium mb-3">Карточки коллекции</h4>
                <div className="grid grid-cols-3 gap-3">
                  {selectedCollection.cards?.map((card: any) => {
                    const owned = card.instances?.length > 0;
                    return (
                      <div key={card.id} className={`relative aspect-square rounded-xl border-2 overflow-hidden ${owned ? 'border-nexo-500' : 'border-border opacity-50'}`}>
                        <img src={card.photoUrl} alt={card.name} className="w-full h-full object-cover" />
                        {!owned && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <Lock size={24} className="text-zinc-400" />
                          </div>
                        )}
                        {owned && (
                          <div className="absolute top-1 right-1 bg-nexo-500 text-white text-xs px-2 py-1 rounded-full">
                            ✓
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {collections.map((collection) => (
                <button key={collection.id} onClick={() => handleSelectCollection(collection)} className="w-full bg-surface hover:bg-surface/80 rounded-xl p-4 transition-colors text-left">
                  <div className="flex items-start gap-3">
                    {collection.imageUrl && (
                      <img src={collection.imageUrl} alt={collection.name} className="w-16 h-16 rounded-lg object-cover" />
                    )}
                    <div className="flex-1">
                      <h3 className="font-medium mb-1">{collection.name}</h3>
                      {collection.description && (
                        <p className="text-sm text-zinc-400 mb-2 line-clamp-2">{collection.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>{collection._count?.cards || 0} карточек</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <BeaverIcon size={12} />
                          <span className="text-nexo-400">{collection.reward}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
