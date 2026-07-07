import { useState, useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket';

interface NftGiftData {
  fromUserId: string;
  cardName: string;
  message: string;
  instanceId: string;
}

interface NftPriceData {
  cardName: string;
  change: number;
  newPrice: number;
}

export function useNFTNotifications() {
  const [nftGiftReceived, setNftGiftReceived] = useState<NftGiftData | null>(null);
  const [nftPriceNotif, setNftPriceNotif] = useState<NftPriceData | null>(null);
  const [showNFTInventoryFromNotif, setShowNFTInventoryFromNotif] = useState(false);

  const priceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPriceTimer = () => {
    if (priceTimerRef.current) {
      clearTimeout(priceTimerRef.current);
      priceTimerRef.current = null;
    }
  };

  const dismissGift = () => {
    setNftGiftReceived(null);
    setShowNFTInventoryFromNotif(true);
  };

  const dismissPriceNotif = () => {
    setNftPriceNotif(null);
    clearPriceTimer();
  };

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNFTGiftReceived = (data: NftGiftData) => {
      setNftGiftReceived(data);
    };

    const handleNFTPriceChanged = (data: {
      cardId: string;
      cardName: string;
      oldPrice: number;
      newPrice: number;
      change: number;
    }) => {
      clearPriceTimer();
      setNftPriceNotif({
        cardName: data.cardName,
        change: data.change,
        newPrice: data.newPrice,
      });
      priceTimerRef.current = setTimeout(() => setNftPriceNotif(null), 5000);
    };

    const handleNFTSold = (data: {
      cardName: string;
      price: number;
      buyerId: string;
    }) => {
      clearPriceTimer();
      setNftPriceNotif({
        cardName: `${data.cardName} продана!`,
        change: 0,
        newPrice: data.price,
      });
      priceTimerRef.current = setTimeout(() => setNftPriceNotif(null), 5000);
    };

    socket.on('nft:gift_received', handleNFTGiftReceived);
    socket.on('nft:price_changed', handleNFTPriceChanged);
    socket.on('nft:sold', handleNFTSold);

    return () => {
      socket.off('nft:gift_received', handleNFTGiftReceived);
      socket.off('nft:price_changed', handleNFTPriceChanged);
      socket.off('nft:sold', handleNFTSold);
      clearPriceTimer();
    };
  }, []);

  return {
    nftGiftReceived,
    nftPriceNotif,
    showNFTInventoryFromNotif,
    dismissGift,
    dismissPriceNotif,
    setShowNFTInventoryFromNotif,
  };
}
