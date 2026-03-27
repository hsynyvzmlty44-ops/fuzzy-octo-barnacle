"use client";

import { cn } from "@/lib/utils";
import { useEffect, useId, useState } from "react";

/** 11.02.2026 23:09 (Türkiye saati) */
const START_MS = new Date("2026-02-11T23:09:00+03:00").getTime();

function calendarDiff(startMs: number, endMs: number) {
  if (endMs <= startMs) {
    return {
      years: 0,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    };
  }
  const s = new Date(startMs);
  const e = new Date(endMs);
  let years = e.getFullYear() - s.getFullYear();
  let months = e.getMonth() - s.getMonth();
  let days = e.getDate() - s.getDate();
  let hours = e.getHours() - s.getHours();
  let minutes = e.getMinutes() - s.getMinutes();
  let seconds = e.getSeconds() - s.getSeconds();

  if (seconds < 0) {
    minutes--;
    seconds += 60;
  }
  if (minutes < 0) {
    hours--;
    minutes += 60;
  }
  if (hours < 0) {
    days--;
    hours += 24;
  }
  if (days < 0) {
    months--;
    days += new Date(e.getFullYear(), e.getMonth(), 0).getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days, hours, minutes, seconds };
}

/** Kalp yolu — sadece kontur (Audi halkası gibi) */
const HEART_PATH =
  "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

const ringStroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.15,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
};

function NestedHeartsMonogram() {
  const maskId = useId().replace(/:/g, "");
  const cutMaskId = `heart-cut-${maskId}`;

  const titleClass = cn(
    "select-none text-3xl font-light leading-none tracking-tight text-[#C8A2C8] sm:text-4xl md:text-5xl lg:text-6xl"
  );

  const smallHeartTransform = (
    <g transform="translate(11.5 0.5)">
      <g transform="translate(12 12) scale(0.78) translate(-12 -12)">
        <path d={HEART_PATH} fill="black" />
      </g>
    </g>
  );

  return (
    <div className="flex w-full flex-col items-center">
      <h2 className="sr-only">H ve M</h2>
      <div
        className={cn(
          "flex w-full flex-row flex-wrap items-center justify-center gap-x-1 sm:gap-x-1.5"
        )}
      >
        <span className={titleClass}>H</span>
        <div className="relative aspect-[40/24] h-[1.9rem] w-auto max-w-[3.85rem] shrink-0 sm:h-[2.1rem] sm:max-w-[4.25rem] md:h-[2.65rem] md:max-w-[5.35rem] lg:h-[3.1rem] lg:max-w-[6.25rem]">
          <svg
            aria-hidden
            className="h-full w-full overflow-visible"
            viewBox="0 0 40 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <mask
                id={cutMaskId}
                maskUnits="userSpaceOnUse"
                x="0"
                y="0"
                width="40"
                height="24"
              >
                <rect width="40" height="24" fill="white" />
                {smallHeartTransform}
              </mask>
            </defs>
            {/* Büyük kalp: küçüğün içinden geçen çizgi parçaları maskelenir */}
            <path
              d={HEART_PATH}
              {...ringStroke}
              mask={`url(#${cutMaskId})`}
              className="text-[#C8A2C8]/75"
            />
            {/* Küçük kalp (üstte) */}
            <g transform="translate(11.5 0.5)">
              <g transform="translate(12 12) scale(0.78) translate(-12 -12)">
                <path
                  d={HEART_PATH}
                  {...ringStroke}
                  strokeWidth={1.05}
                  className="text-[#C8A2C8]"
                />
              </g>
            </g>
          </svg>
        </div>
        <span className={cn(titleClass, "-ml-[7px] sm:-ml-[9px] md:-ml-[11px] lg:-ml-[13px]")}>M</span>
      </div>
    </div>
  );
}

export function BizCounter() {
  /** Sunucu ile ilk istemci metninin aynı olması için zaman sadece mount sonrası */
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const ready = nowMs !== null;
  const d = ready ? calendarDiff(START_MS, nowMs!) : null;
  const notStarted = ready ? nowMs! < START_MS : false;
  const heartbeatKey = ready && !notStarted ? Math.floor(nowMs! / 1000) : "idle";

  const outerBox = cn(
    "relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-gradient-to-br from-white/[0.08] to-white/[0.02]",
    "p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_40px_-12px_rgba(15,23,42,0.65)]",
    "ring-1 ring-white/5 sm:p-8 md:rounded-[2rem] md:p-10"
  );

  const innerCounterBox = cn(
    "relative mt-6 overflow-hidden rounded-2xl border border-white/12 bg-[#0F172A]/35",
    "px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:px-5 sm:py-5 md:px-6 md:py-6",
    "ring-1 ring-inset ring-white/[0.06]"
  );

  return (
    <div className="mb-8 text-center">
      <div className={outerBox}>
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#C8A2C8]/12 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-12 -left-12 h-32 w-32 rounded-full bg-pink-300/8 blur-3xl"
          aria-hidden
        />

        <div className="relative">
          <NestedHeartsMonogram />
        </div>

        <div
          key={heartbeatKey}
          className={cn(
            innerCounterBox,
            ready && !notStarted && "counter-heartbeat"
          )}
        >
          <div
            className="pointer-events-none absolute right-0 top-1/2 h-20 w-24 -translate-y-1/2 rounded-full bg-[#C8A2C8]/8 blur-2xl"
            aria-hidden
          />
          {!ready ? (
            <p className="relative text-sm text-white/45">Sayaç yükleniyor…</p>
          ) : notStarted ? (
            <p className="relative text-sm text-white/55">
              Sayaç 11 Şubat 2026, 23:09&apos;da başlayacak.
            </p>
          ) : (
            d && (
              <p className="relative font-mono text-sm leading-relaxed sm:text-base md:text-lg">
                {d.years > 0 && (
                  <>
                    <span className="font-semibold text-[#C8A2C8]">{d.years}</span>
                    <span className="font-semibold text-white/85"> yıl </span>
                  </>
                )}
                <span className="font-semibold text-[#C8A2C8]">{d.months}</span>
                <span className="font-semibold text-white/85"> ay </span>
                <span className="font-semibold text-[#C8A2C8]">{d.days}</span>
                <span className="font-semibold text-white/85"> gün </span>
                <span className="font-semibold text-[#C8A2C8]">{d.hours}</span>
                <span className="font-semibold text-white/85"> saat </span>
                <span className="font-semibold text-[#C8A2C8]">{d.minutes}</span>
                <span className="font-semibold text-white/85"> dakika </span>
                <span className="font-semibold text-[#C8A2C8]">{d.seconds}</span>
                <span className="font-semibold text-white/85"> saniye</span>
              </p>
            )
          )}
        </div>

        <div className="relative mt-6 flex justify-center">
          <div className="w-full max-w-[260px] overflow-hidden rounded-2xl border border-white/12 ring-1 ring-inset ring-white/[0.06] sm:max-w-[300px] md:max-w-[360px] lg:max-w-[400px]">
            <img
              src="/couple-photo.png"
              alt=""
              width={560}
              height={840}
              className="block h-auto w-full object-cover object-top"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
