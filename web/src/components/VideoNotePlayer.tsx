import { useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VideoNotePlayerProps {
  videoUrl: string;
  duration: number;
  thumbnail?: string | null;
}

export default function VideoNotePlayer({ videoUrl, duration, thumbnail }: VideoNotePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update progress when video element exists
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        const progress = (video.currentTime / video.duration) * 100;
        setProgress(progress);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [isFullscreen]);

  // Handle video end
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      setIsPlaying(false);
      setIsFullscreen(false);
      setProgress(0);
    };

    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [isFullscreen]);

  // Start playback after fullscreen overlay opens and video element mounts
  useEffect(() => {
    if (!isFullscreen) return;

    const timer = setTimeout(() => {
      const video = videoRef.current;
      if (video) {
        const startPlay = () => {
          video.muted = false;
          setIsMuted(false);
          video.play().catch(() => {
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          });
        };

        if (video.readyState >= 2) {
          startPlay();
        } else {
          video.addEventListener('loadeddata', startPlay, { once: true });
          video.load();
        }
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isFullscreen]);

  const handleClick = useCallback(() => {
    if (!isPlaying) {
      setIsPlaying(true);
      setIsMuted(false);
      // Small delay to let the fullscreen overlay render
      setTimeout(() => {
        setIsFullscreen(true);
      }, 50);
    } else {
      const video = videoRef.current;
      if (video) {
        video.pause();
      }
      setIsPlaying(false);
      setIsFullscreen(false);
      setProgress(0);
    }
  }, [isPlaying]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  return (
    <>
      {/* Fullscreen overlay */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center"
            onClick={() => {
              videoRef.current?.pause();
              setIsPlaying(false);
              setIsFullscreen(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-[min(90vw,400px)] h-[min(90vw,400px)] rounded-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Video element */}
              <video
                ref={videoRef}
                src={videoUrl}
                loop
                playsInline
                preload="metadata"
                poster={thumbnail || undefined}
                className="w-full h-full object-cover"
              />

              {/* Progress ring */}
              <svg
                className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none"
                viewBox="0 0 100 100"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke="rgba(99, 102, 241, 0.3)"
                  strokeWidth="3"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="48"
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${(progress / 100) * 301.59} 301.59`}
                />
              </svg>

              {/* Sound button */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={toggleMute}
                className="absolute top-4 right-4 p-3 rounded-full bg-black/50 hover:bg-black/70 transition-colors z-10"
              >
                {isMuted ? (
                  <VolumeX size={20} className="text-white" />
                ) : (
                  <Volume2 size={20} className="text-white" />
                )}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Thumbnail/Preview */}
      <div
        ref={containerRef}
        className="relative w-[200px] h-[200px] rounded-full overflow-hidden cursor-pointer group shadow-lg hover:shadow-xl transition-shadow"
        onClick={handleClick}
      >
        {/* Thumbnail or video preview */}
        {thumbnail ? (
          <img
            src={thumbnail}
            alt="Video note"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-nexo-500/20 to-nexo-600/20" />
        )}

        {/* Gradient border */}
        <div className="absolute inset-0 rounded-full ring-2 ring-nexo-500/50 pointer-events-none" />

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

        {/* Play icon */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <motion.div
            whileHover={{ scale: 1.1 }}
            className="w-16 h-16 rounded-full bg-nexo-500/90 backdrop-blur-sm flex items-center justify-center shadow-lg"
          >
            <Play size={28} className="text-white ml-1" fill="white" />
          </motion.div>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs font-medium">
          {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
        </div>
      </div>
    </>
  );
}
