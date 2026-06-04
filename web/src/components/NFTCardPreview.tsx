import { useEffect, useRef } from 'react';

interface NFTCard {
  name: string;
  rarity: string;
  photoUrl: string;
  effectUrls: string;
  backgroundColor?: string;
  gradientColors?: string;
  borderColor?: string;
  borderWidth: number;
}

interface NFTCardPreviewProps {
  card: NFTCard;
  className?: string;
  showInfo?: boolean;
}

export default function NFTCardPreview({ card, className = '', showInfo = true }: NFTCardPreviewProps) {
  const effectsRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!effectsRef.current) return;

    const effects = JSON.parse(card.effectUrls || '[]');
    if (effects.length === 0) return;

    effectsRef.current.innerHTML = '';
    effects.forEach((effectUrl: string, index: number) => {
      const layer = document.createElement('div');
      layer.className = 'absolute inset-0 pointer-events-none';
      layer.style.backgroundImage = `url(${effectUrl})`;
      layer.style.backgroundSize = 'cover';
      layer.style.backgroundPosition = 'center';
      layer.style.opacity = '0.6';
      layer.style.zIndex = String(index + 1);
      effectsRef.current?.appendChild(layer);

      let x = 0;
      let y = 0;
      let rotation = 0;
      let time = Math.random() * 1000;

      const animate = () => {
        time += 0.008;
        x = Math.sin(time) * 8;
        y = Math.cos(time * 0.7) * 8;
        rotation = Math.sin(time * 0.4) * 1.5;
        
        layer.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg)`;
        animationRef.current = requestAnimationFrame(animate);
      };

      animate();
    });

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [card.effectUrls]);

  // Определить фон
  let background = '#667eea';
  if (card.backgroundColor) {
    background = card.backgroundColor;
  } else if (card.gradientColors) {
    try {
      const colors = JSON.parse(card.gradientColors);
      background = `linear-gradient(135deg, ${colors.join(', ')})`;
    } catch (e) {
      // Fallback
    }
  }

  // Определить цвет редкости
  const rarityColors: Record<string, string> = {
    'Common': 'text-gray-300',
    'Rare': 'text-blue-400',
    'Epic': 'text-purple-400',
    'Legendary': 'text-yellow-400',
  };

  return (
    <div className={`relative w-full h-full overflow-hidden rounded-2xl shadow-2xl ${className}`}>
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{ background }}
      />

      {/* Effects */}
      <div ref={effectsRef} className="absolute inset-0" />

      {/* Photo */}
      {card.photoUrl && (
        <div className="absolute inset-0 flex items-center justify-center p-6 z-10">
          <img
            src={card.photoUrl}
            alt={card.name}
            className="max-w-full max-h-full object-contain drop-shadow-2xl"
            style={{
              filter: 'drop-shadow(0 10px 30px rgba(0,0,0,0.5))',
              border: card.borderWidth > 0 ? `${card.borderWidth}px solid ${card.borderColor || '#fff'}` : 'none',
              borderRadius: '12px',
            }}
          />
        </div>
      )}

      {/* Info overlay */}
      {showInfo && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent z-20">
          <div className="font-bold text-xl text-white drop-shadow-lg tracking-tight">{card.name}</div>
          <div className={`text-sm font-semibold uppercase tracking-widest mt-1 ${rarityColors[card.rarity] || 'text-white/70'}`}>
            {card.rarity}
          </div>
        </div>
      )}

      {/* Holographic shine effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 pointer-events-none z-30 mix-blend-overlay" />
    </div>
  );
}
