"use client";

import { Heart } from "lucide-react";
import { useMemo } from "react";

const COUNT = 52;

/** Sunucu / istemci aynı çıktı üretsin diye deterministik yerleşim */
function buildHearts() {
  return Array.from({ length: COUNT }, (_, i) => {
    const seed = (i + 1) * 7919;
    const left = 10 + (seed % 8200) / 100; // 10–92%
    const duration = 9 + ((seed * 7) % 70) / 10; // 9–16s
    /** Negatif delay: animasyon zaten bir süredir çalışıyormuş gibi başlar — yenilemede kalpler hemen görünür */
    const delaySec = -((seed % 1000) / 1000) * duration;
    const size = 14 + (seed % 4) * 4; // 14–26px
    const wobble = ((seed * 13) % 60) - 30; // -30..+30 px yatay süzülme
    return {
      id: i,
      left: `${left}%`,
      delay: `${delaySec}s`,
      duration: `${duration}s`,
      size,
      wobble,
    };
  });
}

export function FloatingHearts() {
  const hearts = useMemo(() => buildHearts(), []);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[5] overflow-hidden"
      aria-hidden
    >
      {hearts.map((h) => (
        <div
          key={h.id}
          className="heart-rise absolute bottom-0 text-[#C8A2C8]"
          style={{
            left: h.left,
            animationDelay: h.delay,
            animationDuration: h.duration,
            ["--heart-wobble" as string]: `${h.wobble}px`,
          }}
        >
          <Heart
            className="drop-shadow-[0_0_10px_rgba(200,162,200,0.45)]"
            fill="currentColor"
            strokeWidth={0}
            style={{ width: h.size, height: h.size }}
          />
        </div>
      ))}
    </div>
  );
}
