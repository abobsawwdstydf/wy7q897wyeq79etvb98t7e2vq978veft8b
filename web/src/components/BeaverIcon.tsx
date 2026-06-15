interface BeaverIconProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

/**
 * Beaver coin icon with optional animation.
 * Uses /beaver-coin.svg from public folder.
 */
export default function BeaverIcon({ size = 20, className = '', animate = false }: BeaverIconProps) {
  return (
    <img
      src="/beaver-coin.svg"
      alt="бобр"
      width={size}
      height={size}
      className={`inline-block object-contain select-none ${animate ? 'animate-bounce' : ''} ${className}`}
      draggable={false}
      style={{
        filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
        verticalAlign: 'middle',
      }}
      onError={e => {
        // Fallback to PNG if SVG not found
        const target = e.target as HTMLImageElement;
        target.src = '/beaver-coin.png';
        target.onerror = null; // Prevent infinite loop
      }}
    />
  );
}
