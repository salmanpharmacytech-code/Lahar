import { useEffect, useState } from "react";
import { getGiftUrl } from "../../lib/gifts";

export default function GiftOverlay({ giftEvent }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (giftEvent) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [giftEvent]);

  if (!visible || !giftEvent) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <video
        src={getGiftUrl(giftEvent.file)}
        autoPlay
        playsInline
        style={{ maxWidth: "100%", maxHeight: "100%" }}
      />
    </div>
  );
        }
