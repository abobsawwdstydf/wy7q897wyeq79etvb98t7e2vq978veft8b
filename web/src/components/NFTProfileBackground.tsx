import { useEffect, useRef } from 'react';

interface NFTProfileBackgroundProps {
  card: {
    effectUrls: string;
    backgroundColor?: string;
    gradientColors?: string;
  };
}

export default function NFTProfileBackground({ card }: NFTProfileBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrames = useRef<number[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const effects = JSON.parse(card.effectUrls || '[]');
    if (effects.length === 0) return;

    // Очистить предыдущие эффекты
    containerRef.current.innerHTML = '';
    animationFrames.current.forEach(id => cancelAnimationFrame(id));
    animationFrames.current = [];

    // Создать летающие эффекты
    effects.forEach((effectUrl: string, index: number) => {
      const layer = document.createElement('div');
      layer.className = 'absolute opacity-30 pointer-events-none';
      layer.style.width = '128px';
      layer.style.height = '128px';
      layer.style.backgroundImage = `url(${effectUrl})`;
      layer.style.backgroundSize = 'contain';
      layer.style.backgroundRepeat = 'no-repeat';
      layer.style.backgroundPosition = 'center';
      
      // Случайная начальная позиция
      let x = Math.random() * 100;
      let y = Math.random() * 100;
      layer.style.left = `${x}%`;
      layer.style.top = `${y}%`;
      
      containerRef.current?.appendChild(layer);

      // Анимация дрейфа
      let vx = (Math.random() - 0.5) * 0.05; // Скорость по X
      let vy = (Math.random() - 0.5) * 0.05; // Скорость по Y
      let rotation = 0;
      let rotationSpeed = (Math.random() - 0.5) * 0.5;

      const animate = () => {
        x += vx;
        y += vy;
        rotation += rotationSpeed;

        // Отскок от границ
        if (x < -10 || x > 100) {
          vx *= -1;
          x = Math.max(-10, Math.min(100, x));
        }
        if (y < -10 || y > 100) {
          vy *= -1;
          y = Math.max(-10, Math.min(100, y));
        }

        layer.style.left = `${x}%`;
        layer.style.top = `${y}%`;
        layer.style.transform = `rotate(${rotation}deg)`;

        const frameId = requestAnimationFrame(animate);
        animationFrames.current.push(frameId);
      };

      animate();
    });

    // Cleanup
    return () => {
      animationFrames.current.forEach(id => cancelAnimationFrame(id));
      animationFrames.current = [];
    };
  }, [card]);

  // Определить фон
  let background = 'rgba(0,0,0,0.3)';
  if (card.backgroundColor) {
    // Добавить прозрачность к цвету
    const hex = card.backgroundColor;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    background = `rgba(${r}, ${g}, ${b}, 0.2)`;
  } else if (card.gradientColors) {
    try {
      const colors = JSON.parse(card.gradientColors);
      // Добавить прозрачность к каждому цвету
      const transparentColors = colors.map((color: string) => {
        const hex = color;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, 0.2)`;
      });
      background = `linear-gradient(135deg, ${transparentColors.join(', ')})`;
    } catch (e) {
      // Fallback
    }
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ background }}
    />
  );
}
