import { useState, useEffect, useRef, memo } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholder?: string;
  onLoad?: () => void;
}

function LazyImage({ src, alt, className = '', placeholder, onLoad }: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!imgRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: '50px', // Start loading 50px before entering viewport
      }
    );

    observer.observe(imgRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  return (
    <div ref={imgRef} className={`relative ${className}`}>
      {/* Placeholder */}
      {!isLoaded && (
        <div
          className="absolute inset-0 bg-zinc-800 animate-pulse"
          style={{
            backgroundImage: placeholder ? `url(${placeholder})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(10px)',
          }}
        />
      )}

      {/* Actual image */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          className={`${className} transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={handleLoad}
          loading="lazy"
        />
      )}
    </div>
  );
}

export default memo(LazyImage);
