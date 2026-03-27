"use client";

import {
  ALBUM_PAGE_COUNT,
  DEFAULT_IMAGE_FRAME,
  type AlbumPageData,
} from "@/lib/album-types";
import { readAlbumPages, writeAlbumPages } from "@/lib/local-album";
import { cn } from "@/lib/utils";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Heart,
  ImagePlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SPREAD_COUNT = ALBUM_PAGE_COUNT / 2;

/** Ok / klavye ile tam sayfa çevirme */
const flipSpring = {
  type: "spring" as const,
  stiffness: 200,
  damping: 32,
  mass: 0.55,
};

/** Fare bırakınca — daha elastik, gerçek sayfa hissi */
const elasticRelease = {
  type: "spring" as const,
  stiffness: 220,
  damping: 24,
  mass: 0.48,
};

function rubberNext(angle: number) {
  const min = -180;
  const max = 0;
  const k = 0.14;
  if (angle < min) return min + (angle - min) * k;
  if (angle > max) return max + (angle - max) * k;
  return angle;
}

function rubberPrev(angle: number) {
  const min = 0;
  const max = 180;
  const k = 0.14;
  if (angle < min) return min + (angle - min) * k;
  if (angle > max) return max + (angle - max) * k;
  return angle;
}

const lilacFrame =
  "rounded-sm border-2 border-[#C8A2C8] bg-[#050506] p-[3px] shadow-[0_0_0_1px_rgba(200,162,200,0.12)]";

/** Omurga genişliği (px) — sarmal + flip katmanı aynı değeri kullanmalı */
const SPINE_W = 30;

/** Fotoğraf kutunun içi — dönüşüm kutunun kendisinde; görsel sadece doldurur */
function AlbumPhotoFill({
  image,
  className,
}: {
  image: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative h-full w-full overflow-hidden bg-[#0a0a0c]", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        decoding="sync"
        fetchPriority="high"
        className="pointer-events-none h-full w-full select-none object-cover object-center"
      />
    </div>
  );
}

function pointerAngleDeg(cx: number, cy: number, px: number, py: number) {
  return (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
}

function unwrapAngleDelta(delta: number) {
  let d = delta;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function normRotationDeg(deg: number) {
  let x = deg % 360;
  if (x > 180) x -= 360;
  if (x < -180) x += 360;
  return x;
}

const FRAME_PAN_CLAMP = 42;

type SheetFrameDrag =
  | {
      kind: "pan";
      startX: number;
      startY: number;
      startPanX: number;
      startPanY: number;
    }
  | {
      kind: "scale";
      startScale: number;
      startDist: number;
    }
  | {
      kind: "rotate";
      startRot: number;
      startPointerAngle: number;
    };

function SheetPhotoFrame({
  data,
  interactive,
  /** Kalemle açılan sürükle / köşe / döndürme tutamaçları */
  frameToolsActive,
  onPatch,
  compact,
  onRequestDelete,
}: {
  data: AlbumPageData;
  interactive: boolean;
  frameToolsActive: boolean;
  onPatch: (p: Partial<AlbumPageData>) => void;
  compact?: boolean;
  onRequestDelete?: () => void;
}) {
  const toolsOn = interactive && frameToolsActive;
  const canvasRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<SheetFrameDrag | null>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 200, h: 220 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setCanvasSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const panX = data.imagePanX ?? DEFAULT_IMAGE_FRAME.imagePanX;
  const panY = data.imagePanY ?? DEFAULT_IMAGE_FRAME.imagePanY;
  const rot = data.imageRotation ?? DEFAULT_IMAGE_FRAME.imageRotation;
  const sc = data.imageScale ?? DEFAULT_IMAGE_FRAME.imageScale;
  const src = data.image!;

  const baseW = Math.min(220, Math.max(96, canvasSize.w * 0.88));
  const baseH = baseW * (5 / 4);
  const frameW = baseW * sc;
  const frameH = baseH * sc;

  const tx = (panX / 100) * canvasSize.w;
  const ty = (panY / 100) * canvasSize.h;

  const clearDrag = useCallback((e: React.PointerEvent) => {
    dragRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      const canvas = canvasRef.current;
      const frameEl = frameRef.current;
      if (!d || !canvas || !frameEl) return;
      const cRect = canvas.getBoundingClientRect();

      if (d.kind === "pan") {
        const dx = ((e.clientX - d.startX) / Math.max(1, cRect.width)) * 100;
        const dy = ((e.clientY - d.startY) / Math.max(1, cRect.height)) * 100;
        onPatch({
          imagePanX: Math.max(
            -FRAME_PAN_CLAMP,
            Math.min(FRAME_PAN_CLAMP, d.startPanX + dx)
          ),
          imagePanY: Math.max(
            -FRAME_PAN_CLAMP,
            Math.min(FRAME_PAN_CLAMP, d.startPanY + dy)
          ),
        });
        return;
      }

      const fr = frameEl.getBoundingClientRect();
      const cx = fr.left + fr.width / 2;
      const cy = fr.top + fr.height / 2;

      if (d.kind === "scale") {
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy);
        const ratio = dist / Math.max(20, d.startDist);
        onPatch({
          imageScale: Math.max(0.35, Math.min(3.5, d.startScale * ratio)),
        });
        return;
      }

      const curAng = pointerAngleDeg(cx, cy, e.clientX, e.clientY);
      const delta = unwrapAngleDelta(curAng - d.startPointerAngle);
      onPatch({ imageRotation: normRotationDeg(d.startRot + delta) });
    },
    [onPatch]
  );

  const onPanDown = useCallback(
    (e: React.PointerEvent) => {
      if (!toolsOn) return;
      if ((e.target as HTMLElement).closest("[data-frame-handle]")) return;
      e.preventDefault();
      e.stopPropagation();
      canvasRef.current?.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "pan",
        startX: e.clientX,
        startY: e.clientY,
        startPanX: panX,
        startPanY: panY,
      };
    },
    [toolsOn, panX, panY]
  );

  const onCornerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!toolsOn) return;
      e.preventDefault();
      e.stopPropagation();
      const frameEl = frameRef.current;
      if (!frameEl) return;
      const fr = frameEl.getBoundingClientRect();
      const startDist = Math.hypot(
        e.clientX - (fr.left + fr.width / 2),
        e.clientY - (fr.top + fr.height / 2)
      );
      canvasRef.current?.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "scale",
        startScale: sc,
        startDist: Math.max(28, startDist),
      };
    },
    [toolsOn, sc]
  );

  const onRotateDown = useCallback(
    (e: React.PointerEvent) => {
      if (!toolsOn) return;
      e.preventDefault();
      e.stopPropagation();
      const frameEl = frameRef.current;
      if (!frameEl) return;
      const fr = frameEl.getBoundingClientRect();
      const cx = fr.left + fr.width / 2;
      const cy = fr.top + fr.height / 2;
      canvasRef.current?.setPointerCapture(e.pointerId);
      dragRef.current = {
        kind: "rotate",
        startRot: rot,
        startPointerAngle: pointerAngleDeg(cx, cy, e.clientX, e.clientY),
      };
    },
    [toolsOn, rot]
  );

  /** Çerçeve dikey ortada kalınca üst/alt taşmasın (üstte döndürme ~28px + köşe 8px payı) */
  const minCanvasPx = useMemo(() => {
    const handleAndCornerReserve = toolsOn ? 64 : 24;
    return Math.max(compact ? 248 : 268, Math.ceil(frameH + handleAndCornerReserve));
  }, [compact, frameH, toolsOn]);

  return (
    <div
      ref={canvasRef}
      className="relative mx-auto h-full min-h-0 w-full touch-none select-none overflow-hidden"
      style={{ minHeight: minCanvasPx }}
      onPointerMove={toolsOn ? onCanvasPointerMove : undefined}
      onPointerUp={toolsOn ? clearDrag : undefined}
      onPointerCancel={toolsOn ? clearDrag : undefined}
    >
      <div
        ref={frameRef}
        className="absolute box-border"
        style={{
          left: "50%",
          top: "50%",
          width: frameW,
          height: frameH,
          transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(${rot}deg)`,
          transformOrigin: "center center",
        }}
      >
        {toolsOn && (
          <button
            type="button"
            data-frame-handle
            aria-label="Kutuyu döndür"
            onPointerDown={onRotateDown}
            className="absolute left-1/2 top-0 z-30 h-5 w-5 -translate-x-1/2 -translate-y-[calc(100%+8px)] cursor-grab rounded-full border border-[#C8A2C8]/75 bg-[#0c0c0e]/95 shadow-md ring-1 ring-black/50 active:cursor-grabbing"
          />
        )}
        <div className={cn(lilacFrame, "relative h-full w-full")}>
          <div className="relative h-full w-full overflow-hidden bg-[#0a0a0c]">
            <AlbumPhotoFill image={src} className="h-full w-full" />
            {toolsOn && (
              <div
                role="presentation"
                className="absolute inset-0 z-[4] cursor-grab active:cursor-grabbing"
                onPointerDown={onPanDown}
              />
            )}
            {interactive && onRequestDelete && (
              <button
                type="button"
                data-frame-handle
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestDelete();
                }}
                className="absolute bottom-1.5 right-1.5 z-10 rounded-md bg-black/25 p-1.5 text-zinc-500/45 opacity-70 backdrop-blur-[2px] transition hover:bg-black/40 hover:text-zinc-400/90 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C8A2C8]/50"
                aria-label="Fotoğrafı sil"
              >
                <Trash2
                  className={cn(
                    "h-3.5 w-3.5",
                    !compact && "sm:h-4 sm:w-4"
                  )}
                  strokeWidth={1.75}
                />
              </button>
            )}
          </div>
        </div>
        {toolsOn &&
          (
            [
              [
                "tl",
                "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
              ],
              [
                "tr",
                "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
              ],
              [
                "bl",
                "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
              ],
              [
                "br",
                "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
              ],
            ] as const
          ).map(([key, pos]) => (
            <button
              key={key}
              type="button"
              data-frame-handle
              aria-label="Kutu boyutunu köşeden ayarla"
              onPointerDown={onCornerDown}
              className={cn(
                "absolute z-10 h-4 w-4 rounded-full border border-[#C8A2C8]/70 bg-[#0c0c0e]/95 shadow-md ring-1 ring-black/50",
                pos
              )}
            />
          ))}
      </div>
    </div>
  );
}

function SpiralSpine() {
  const rings = 26;
  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col justify-between overflow-hidden px-[5px] py-2"
      aria-hidden
    >
      {/* Kanal: defter sırtı — boydan boya */}
      <div
        className="pointer-events-none absolute inset-y-0 left-1/2 w-[22px] -translate-x-1/2 rounded-[3px] bg-gradient-to-r from-[#050508] via-[#101018] to-[#050508] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04),inset_3px_0_12px_rgba(0,0,0,0.75),inset_-3px_0_12px_rgba(0,0,0,0.55)]"
      />
      {/* Orta tel hattı — süreklilik */}
      <div className="pointer-events-none absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-zinc-500/25 to-transparent" />

      {Array.from({ length: rings }).map((_, i) => (
        <div
          key={i}
          className="relative z-[1] mx-auto flex h-[12px] w-[19px] shrink-0 items-center justify-center"
        >
          <div className="h-[11px] w-full rounded-full border border-zinc-400/30 bg-gradient-to-b from-zinc-200 via-zinc-500 to-zinc-900 shadow-[inset_0_2px_3px_rgba(255,255,255,0.4),inset_0_-2px_2px_rgba(0,0,0,0.55),0_2px_4px_rgba(0,0,0,0.65),0_0_0_1px_rgba(0,0,0,0.35)]" />
          <div className="pointer-events-none absolute inset-x-[3px] top-px h-[3px] rounded-full bg-white/35 blur-[0.5px]" />
        </div>
      ))}
    </div>
  );
}

function PageSheet({
  data,
  compact,
  pageNumber,
  onRequestUpload,
  onRequestDelete,
  onRequestFrameEdit,
  frameToolsActive = false,
  /** Kalem: fotoğraf alanına göre yatay konum (sol sayfa sağda, sağ sayfa solda — sayfa çevirme şeridiyle çakışmasın) */
  frameEditPencilSide = "right",
  onUpdate,
  interactive = true,
}: {
  data: AlbumPageData;
  compact?: boolean;
  /** 1 tabanlı sayfa numarası */
  pageNumber: number;
  onRequestUpload: () => void;
  /** Verilmezse çöp kutusu gösterilmez */
  onRequestDelete?: () => void;
  /** Verilmezse kalem (çerçeve düzenleme) gösterilmez */
  onRequestFrameEdit?: () => void;
  /** Kalem açıkken sürükle / köşe / döndürme */
  frameToolsActive?: boolean;
  frameEditPencilSide?: "left" | "right";
  onUpdate: (p: Partial<AlbumPageData>) => void;
  interactive?: boolean;
}) {
  const invisibleTextarea =
    "max-h-[3.25rem] min-h-[2.35rem] w-full shrink-0 resize-none overflow-y-auto border-0 bg-transparent p-0 text-[11px] leading-snug text-zinc-300/85 caret-zinc-400 outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none placeholder:text-transparent disabled:opacity-50";

  const firstPageTextarea =
    "w-full resize-none overflow-y-auto border-0 bg-transparent px-2 py-2 text-center text-[22px] leading-snug text-zinc-200/95 caret-[#C8A2C8] outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none placeholder:text-transparent disabled:opacity-50 sm:text-[26px] sm:leading-snug md:text-[28px] lg:text-[30px]";

  if (pageNumber === 1) {
    return (
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
        {/* Kaydırılabilir alan: içerik uzun olunca üst (isimler, şiir) kesilmesin */}
        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
          <div className="flex min-h-full flex-col items-center justify-center px-3 py-6 text-center sm:px-5 sm:py-8 md:px-8 lg:px-8">
            <div className="flex w-full max-w-[min(100%,28rem)] flex-col items-center gap-5 sm:gap-6 md:max-w-[min(100%,34rem)] md:gap-7 lg:max-w-[min(100%,38rem)]">
              <div className="flex w-full flex-col items-center gap-4 sm:gap-5">
                <div
                  className="flex shrink-0 items-center justify-center gap-3.5 sm:gap-4 md:gap-5"
                  aria-hidden
                >
                  <span className="text-2xl font-medium tracking-tight text-[#C8A2C8] sm:text-3xl md:text-4xl lg:text-5xl">
                    Hüseyin
                  </span>
                  <Heart
                    className="h-9 w-9 shrink-0 text-[#d8b0e0] sm:h-11 sm:w-11 md:h-12 md:w-12 lg:h-14 lg:w-14"
                    fill="currentColor"
                    strokeWidth={0}
                    aria-hidden
                  />
                  <span className="text-2xl font-medium tracking-tight text-[#C8A2C8] sm:text-3xl md:text-4xl lg:text-5xl">
                    Mine
                  </span>
                </div>
                <div
                  className="max-w-[min(100%,22rem)] shrink-0 px-1 [font-family:var(--font-poem),Georgia,serif] text-base italic leading-[1.65] tracking-wide text-zinc-300/95 sm:text-lg sm:leading-[1.7] md:max-w-xl md:text-xl md:leading-[1.75] lg:text-2xl"
                >
                  <p className="whitespace-pre-line">
                    {`En güzel günlerimiz,\nhenüz yaşamadıklarımız.`}
                  </p>
                </div>
              </div>
              <textarea
                value={data.quote}
                disabled={!interactive}
                onChange={(e) => onUpdate({ quote: e.target.value })}
                placeholder=""
                rows={8}
                className={cn(
                  firstPageTextarea,
                  "min-h-[10rem] max-h-[min(40dvh,320px)] sm:min-h-[12rem] sm:max-h-[min(42dvh,360px)] md:max-h-[min(44dvh,400px)] lg:max-h-[min(46dvh,440px)]"
                )}
              />
            </div>
          </div>
        </div>
        <p
          className="pointer-events-none shrink-0 py-1.5 text-center text-[10px] font-medium tabular-nums tracking-wide text-zinc-500"
          aria-label={`Sayfa ${pageNumber}`}
        >
          {pageNumber}
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col gap-2 overflow-hidden",
        compact && "gap-1.5"
      )}
    >
      <div className="relative mx-auto min-h-0 w-full flex-1 overflow-hidden">
        {data.image ? (
          <>
            {interactive && onRequestFrameEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onRequestFrameEdit();
                }}
                className={cn(
                  "absolute top-1 z-40 rounded-md p-1.5 backdrop-blur-[2px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#C8A2C8]/50",
                  frameEditPencilSide === "right" ? "right-1" : "left-1",
                  frameToolsActive
                    ? "bg-[#C8A2C8]/20 text-[#C8A2C8]/95 ring-1 ring-[#C8A2C8]/35"
                    : "bg-black/25 text-zinc-500/45 opacity-80 hover:bg-black/40 hover:text-[#C8A2C8]/85 hover:opacity-100"
                )}
                aria-label={
                  frameToolsActive
                    ? "Çerçeve düzenlemeyi kapat"
                    : "Çerçeveyi düzenle"
                }
                aria-pressed={frameToolsActive}
              >
                <Pencil
                  className={cn(
                    "h-3.5 w-3.5",
                    !compact && "sm:h-4 sm:w-4"
                  )}
                  strokeWidth={1.75}
                />
              </button>
            )}
            <SheetPhotoFrame
              data={data}
              interactive={!!interactive}
              frameToolsActive={!!frameToolsActive}
              onPatch={onUpdate}
              compact={compact}
              onRequestDelete={interactive ? onRequestDelete : undefined}
            />
          </>
        ) : (
          <div className="mx-auto w-full max-w-[min(100%,220px)]">
            <div className={lilacFrame}>
              <div
                className={cn(
                  "overflow-hidden bg-[#0a0a0c]",
                  compact ? "aspect-[4/5]" : "aspect-[4/5] min-h-[120px]"
                )}
              >
                <button
                  type="button"
                  onClick={interactive ? onRequestUpload : undefined}
                  disabled={!interactive}
                  className="flex h-full min-h-[100px] w-full items-center justify-center bg-[#0a0a0a] text-[#C8A2C8]/50 disabled:cursor-default"
                  aria-label="Fotoğraf yükle"
                >
                  <ImagePlus className={cn(compact ? "h-8 w-8" : "h-9 w-9")} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <textarea
        value={data.quote}
        disabled={!interactive}
        onChange={(e) => onUpdate({ quote: e.target.value })}
        placeholder=""
        rows={2}
        className={invisibleTextarea}
      />
      <p
        className="pointer-events-none shrink-0 text-center text-[10px] font-medium tabular-nums tracking-wide text-zinc-500"
        aria-label={`Sayfa ${pageNumber}`}
      >
        {pageNumber}
      </p>
    </div>
  );
}

export function AlbumCorner() {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [pages, setPages] = useState<AlbumPageData[]>(() =>
    Array.from({ length: ALBUM_PAGE_COUNT }, () => ({
      date: "",
      quote: "",
      image: null,
    }))
  );
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTargetIdx, setDeleteTargetIdx] = useState<number | null>(null);
  /** Hangi sayfada çerçeve tutamaçları (kalem) açık */
  const [frameEditIdx, setFrameEditIdx] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const editSideRef = useRef<"left" | "right">("left");
  const pagesRef = useRef(pages);
  pagesRef.current = pages;

  const spreadElRef = useRef<HTMLDivElement>(null);
  const rotateNextMV = useMotionValue(0);
  const rotatePrevMV = useMotionValue(0);
  const opacityNextMV = useTransform(rotateNextMV, (v) =>
    Math.min(1, Math.abs(v) / 10)
  );
  const opacityPrevMV = useTransform(rotatePrevMV, (v) =>
    Math.min(1, Math.abs(v) / 10)
  );

  const [hideRightBase, setHideRightBase] = useState(false);
  const [hideLeftBase, setHideLeftBase] = useState(false);
  useMotionValueEvent(rotateNextMV, "change", (v) => {
    setHideRightBase(Math.abs(v) > 0.8);
  });
  useMotionValueEvent(rotatePrevMV, "change", (v) => {
    setHideLeftBase(Math.abs(v) > 0.8);
  });

  const dragNextRef = useRef<{
    startX: number;
    lastX: number;
    lastT: number;
  } | null>(null);
  const dragPrevRef = useRef<{
    startX: number;
    lastX: number;
    lastT: number;
  } | null>(null);

  const leftIdx = spreadIndex * 2;
  const rightIdx = spreadIndex * 2 + 1;
  const leftPage = pages[leftIdx]!;
  const rightPage = pages[rightIdx]!;

  /** Sadece görsel URL’leri — alıntı yazarken effect tetiklenmesin */
  const imageSig = pages.map((p) => p.image ?? "").join("\0");

  const nextLeftIdx = (spreadIndex + 1) * 2;
  /** Çevirince sağda görünecek sayfa — flip sırasında altta önceden gösterilir */
  const nextRightIdx = (spreadIndex + 1) * 2 + 1;
  /** Geri çevirince solda görünecek sayfa — flip sırasında altta önceden gösterilir */
  const prevLeftIdx = (spreadIndex - 1) * 2;
  const prevRightIdx = (spreadIndex - 1) * 2 + 1;

  useEffect(() => {
    setPages(readAlbumPages());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setUploadModalOpen(false);
      setDeleteModalOpen(false);
      setDeleteTargetIdx(null);
      setFrameEditIdx(null);
    }
  }, [open]);

  useEffect(() => {
    setFrameEditIdx(null);
  }, [spreadIndex]);

  const scheduleSave = useCallback((next: AlbumPageData[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      writeAlbumPages(next);
    }, 450);
  }, []);

  const updatePageAt = useCallback(
    (idx: number, patch: Partial<AlbumPageData>) => {
      setPages((prev) => {
        const copy = [...prev];
        copy[idx] = { ...copy[idx]!, ...patch };
        scheduleSave(copy);
        return copy;
      });
    },
    [scheduleSave]
  );

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      e.target.value = "";
      return;
    }
    const idx = editSideRef.current === "left" ? leftIdx : rightIdx;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result;
      if (typeof data === "string") {
        updatePageAt(idx, {
          image: data,
          ...DEFAULT_IMAGE_FRAME,
        });
        setUploadModalOpen(false);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const openUploadModal = useCallback((side: "left" | "right") => {
    editSideRef.current = side;
    setUploadModalOpen(true);
  }, []);

  const pageHalfWidth = useCallback(() => {
    const el = spreadElRef.current;
    if (!el) return 200;
    return Math.max(120, (el.clientWidth - SPINE_W) / 2);
  }, []);

  useEffect(() => {
    rotateNextMV.set(0);
    rotatePrevMV.set(0);
    setHideRightBase(false);
    setHideLeftBase(false);
  }, [spreadIndex, rotateNextMV, rotatePrevMV]);

  const flipCompleteLock = useRef(false);

  const completeNext = useCallback(() => {
    if (flipCompleteLock.current) return;
    flipCompleteLock.current = true;
    setSpreadIndex((s) => Math.min(SPREAD_COUNT - 1, s + 1));
    rotateNextMV.set(0);
    setAnimating(false);
    queueMicrotask(() => {
      flipCompleteLock.current = false;
    });
  }, [rotateNextMV]);

  const completePrev = useCallback(() => {
    if (flipCompleteLock.current) return;
    flipCompleteLock.current = true;
    setSpreadIndex((s) => Math.max(0, s - 1));
    rotatePrevMV.set(0);
    setAnimating(false);
    queueMicrotask(() => {
      flipCompleteLock.current = false;
    });
  }, [rotatePrevMV]);

  const goNext = useCallback(() => {
    if (animating || spreadIndex >= SPREAD_COUNT - 1) return;
    setAnimating(true);
    animate(rotateNextMV, -180, {
      ...flipSpring,
      onComplete: completeNext,
    });
  }, [animating, spreadIndex, rotateNextMV, completeNext]);

  const goPrev = useCallback(() => {
    if (animating || spreadIndex <= 0) return;
    setAnimating(true);
    animate(rotatePrevMV, 180, {
      ...flipSpring,
      onComplete: completePrev,
    });
  }, [animating, spreadIndex, rotatePrevMV, completePrev]);

  const onNextEdgePointerDown = (e: React.PointerEvent) => {
    if (animating || spreadIndex >= SPREAD_COUNT - 1) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const t = performance.now();
    dragNextRef.current = {
      startX: e.clientX,
      lastX: e.clientX,
      lastT: t,
    };
  };

  const onNextEdgePointerMove = (e: React.PointerEvent) => {
    const d = dragNextRef.current;
    if (!d) return;
    e.preventDefault();
    const w = pageHalfWidth();
    const dx = e.clientX - d.startX;
    let angle = (dx / w) * 180;
    angle = rubberNext(angle);
    rotateNextMV.set(angle);
    const now = performance.now();
    d.lastX = e.clientX;
    d.lastT = now;
  };

  const onNextEdgePointerUp = (e: React.PointerEvent) => {
    const d = dragNextRef.current;
    dragNextRef.current = null;
    if (!d) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const v = rotateNextMV.get();
    const dt = Math.max(1, performance.now() - d.lastT);
    const vel = (e.clientX - d.lastX) / dt;
    const strongFlick = vel < -0.45;
    const pastHalf = v < -90;
    if (pastHalf || strongFlick) {
      setAnimating(true);
      animate(rotateNextMV, -180, {
        ...elasticRelease,
        onComplete: completeNext,
      });
    } else {
      animate(rotateNextMV, 0, elasticRelease);
    }
  };

  const onPrevEdgePointerDown = (e: React.PointerEvent) => {
    if (animating || spreadIndex <= 0) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const t = performance.now();
    dragPrevRef.current = {
      startX: e.clientX,
      lastX: e.clientX,
      lastT: t,
    };
  };

  const onPrevEdgePointerMove = (e: React.PointerEvent) => {
    const d = dragPrevRef.current;
    if (!d) return;
    e.preventDefault();
    const w = pageHalfWidth();
    const dx = e.clientX - d.startX;
    let angle = (dx / w) * 180;
    angle = rubberPrev(angle);
    rotatePrevMV.set(angle);
    const now = performance.now();
    d.lastX = e.clientX;
    d.lastT = now;
  };

  const onPrevEdgePointerUp = (e: React.PointerEvent) => {
    const d = dragPrevRef.current;
    dragPrevRef.current = null;
    if (!d) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const v = rotatePrevMV.get();
    const dt = Math.max(1, performance.now() - d.lastT);
    const vel = (e.clientX - d.lastX) / dt;
    const strongFlick = vel > 0.45;
    const pastHalf = v > 90;
    if (pastHalf || strongFlick) {
      setAnimating(true);
      animate(rotatePrevMV, 180, {
        ...elasticRelease,
        onComplete: completePrev,
      });
    } else {
      animate(rotatePrevMV, 0, elasticRelease);
    }
  };

  /** Albüm açıkken tüm görselleri decode et (flip arka yüzü gecikmesin) */
  useEffect(() => {
    if (!ready || !open) return;
    const list = pagesRef.current;
    for (let i = 0; i < list.length; i++) {
      const src = list[i]?.image;
      if (!src) continue;
      const im = new Image();
      im.src = src;
      void im.decode?.().catch(() => {});
    }
  }, [ready, open, imageSig]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
      if (animating) return;
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, animating, goNext, goPrev]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-[280] flex flex-col items-center gap-1 rounded-2xl border-2 border-[#C8A2C8]/90 bg-[#C8A2C8]/12 p-1.5 shadow-[0_14px_44px_-8px_rgba(200,162,200,0.5),0_8px_24px_-6px_rgba(15,23,42,0.3)] transition hover:scale-[1.04] hover:border-[#d8c0e8] hover:bg-[#C8A2C8]/20 hover:shadow-[0_18px_48px_-6px_rgba(200,162,200,0.6)] active:scale-[0.98] sm:right-4 sm:top-4 md:right-6 md:top-6"
          aria-label="Albüm köşesini aç"
        >
          <div className="flex h-[68px] w-[68px] items-center justify-center rounded-lg bg-[#faf0f8] shadow-[inset_0_1px_2px_rgba(200,162,200,0.15)] ring-1 ring-[#C8A2C8]/20 sm:h-[80px] sm:w-[80px] md:h-[88px] md:w-[88px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/album-corner-thumb.png"
              alt=""
              className="max-h-full max-w-full object-contain object-center p-1.5"
            />
          </div>
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[400] flex items-center justify-center p-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] sm:p-2 md:p-3 lg:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-[#0f172a]/65 backdrop-blur-sm"
              aria-label="Kapat"
              onClick={() => setOpen(false)}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="album-title"
              className="relative z-10 flex max-h-[min(96dvh,920px)] w-full max-w-[min(99vw,1040px)] flex-col overflow-hidden [perspective:2200px] md:max-h-[min(95dvh,960px)] lg:max-w-[min(96vw,1180px)] xl:max-w-[min(94vw,1280px)]"
              initial={{ scale: 0.38, rotateX: 22, rotateY: -28, opacity: 0 }}
              animate={{ scale: 1, rotateX: 0, rotateY: 0, opacity: 1 }}
              exit={{ scale: 0.45, rotateX: 12, rotateY: -18, opacity: 0 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 26,
                mass: 0.65,
              }}
              style={{ transformOrigin: "85% 15%" }}
            >
              <h2 id="album-title" className="sr-only">
                Albüm
              </h2>
              <div className="pointer-events-none absolute -inset-3 rounded-[1.75rem] bg-[#C8A2C8]/15 blur-2xl" />

              <div className="relative flex min-h-0 max-h-full flex-col overflow-hidden rounded-2xl border border-[#C8A2C8]/25 bg-[#08080a] shadow-[0_28px_70px_-18px_rgba(0,0,0,0.85)] ring-1 ring-white/[0.06]">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                  className="absolute right-2 top-2 z-[60] rounded-full border border-[#C8A2C8]/20 bg-[#0a0a0c]/90 p-1.5 text-zinc-400 shadow-sm backdrop-blur-sm transition hover:border-[#C8A2C8]/40 hover:bg-[#121214] hover:text-zinc-100"
                  aria-label="Kapat"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>

                <div
                  className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#0a0a0c] px-2 pb-2 pt-10 sm:px-2.5 sm:pb-2.5 md:px-4 md:pb-3 lg:px-5"
                  style={{ perspective: "2200px" }}
                >
                  {!ready ? (
                    <div
                      className="flex min-h-[200px] items-center justify-center py-16"
                      role="status"
                      aria-live="polite"
                    >
                      <span className="sr-only">Yükleniyor</span>
                      <div className="h-12 w-12 animate-pulse rounded-lg bg-zinc-800/60" />
                    </div>
                  ) : (
                    <>
                      <div
                        ref={spreadElRef}
                        className="relative flex min-h-[min(68dvh,520px)] items-stretch gap-0 sm:min-h-[min(70dvh,580px)] md:min-h-[min(72dvh,640px)] lg:min-h-[min(74dvh,680px)]"
                      >
                        {spreadIndex > 0 && (
                          <div
                            role="presentation"
                            className="absolute left-2 top-2 z-[25] w-14 touch-none cursor-grab active:cursor-grabbing select-none sm:w-16 bottom-24"
                            aria-hidden
                            onPointerDown={onPrevEdgePointerDown}
                            onPointerMove={onPrevEdgePointerMove}
                            onPointerUp={onPrevEdgePointerUp}
                            onPointerCancel={onPrevEdgePointerUp}
                          />
                        )}
                        {spreadIndex < SPREAD_COUNT - 1 && (
                          <div
                            role="presentation"
                            className="absolute right-2 top-2 z-[25] w-14 touch-none cursor-grab active:cursor-grabbing select-none sm:w-16 bottom-24"
                            aria-hidden
                            onPointerDown={onNextEdgePointerDown}
                            onPointerMove={onNextEdgePointerMove}
                            onPointerUp={onNextEdgePointerUp}
                            onPointerCancel={onNextEdgePointerUp}
                          />
                        )}
                        {/* Sol sayfa — flip sırasında gizli */}
                        <div
                          className={cn(
                            "relative z-0 flex min-w-0 flex-1 flex-col rounded-l-lg border border-r-0 border-[#C8A2C8]/20 bg-[#0c0c0e] p-3 sm:p-4",
                            hideLeftBase && "invisible"
                          )}
                        >
                          <PageSheet
                            data={leftPage}
                            compact
                            pageNumber={leftIdx + 1}
                            interactive
                            onRequestUpload={() => openUploadModal("left")}
                            onRequestDelete={() => {
                              setDeleteTargetIdx(leftIdx);
                              setDeleteModalOpen(true);
                            }}
                            frameToolsActive={frameEditIdx === leftIdx}
                            frameEditPencilSide="right"
                            onRequestFrameEdit={() =>
                              setFrameEditIdx((cur) =>
                                cur === leftIdx ? null : leftIdx
                              )
                            }
                            onUpdate={(p) => updatePageAt(leftIdx, p)}
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[40] flex justify-start pb-1.5 pl-1 pt-6">
                            <button
                              type="button"
                              disabled={spreadIndex <= 0 || animating}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                goPrev();
                              }}
                              aria-label="Önceki yayın"
                              className="pointer-events-auto relative z-[41] inline-flex items-center gap-1 rounded-full border border-[#C8A2C8]/35 bg-[#0a0a0c]/92 py-1 pl-1.5 pr-2.5 text-[11px] text-[#C8A2C8] shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-sm transition hover:border-[#C8A2C8]/55 hover:bg-[#141418] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <ChevronLeft
                                className="h-4 w-4 shrink-0"
                                strokeWidth={2}
                              />
                              <span className="hidden pr-0.5 sm:inline">
                                Geri
                              </span>
                            </button>
                          </div>
                        </div>

                        {/* Önceki yayının sol sayfası: geri çevirmede flip kartının altında (z-15) */}
                        {spreadIndex > 0 && (
                          <div
                            className="absolute inset-y-2 left-2 z-[15] flex max-w-[50%] flex-col overflow-hidden rounded-l-lg border border-r-0 border-[#C8A2C8]/20 bg-[#0c0c0e] p-3 sm:p-4"
                            style={{
                              width: `calc((100% - ${SPINE_W}px) / 2)`,
                              opacity: hideLeftBase ? 1 : 0,
                              pointerEvents: "none",
                            }}
                            aria-hidden
                          >
                            <PageSheet
                              data={pages[prevLeftIdx]!}
                              compact
                              pageNumber={prevLeftIdx + 1}
                              interactive={false}
                              onRequestUpload={() => {}}
                              onUpdate={() => {}}
                            />
                          </div>
                        )}

                        <div
                          className="relative z-[5] flex min-h-0 shrink-0 self-stretch"
                          style={{ width: SPINE_W }}
                        >
                          <SpiralSpine />
                        </div>

                        {/* Sağ sayfa */}
                        <div
                          className={cn(
                            "relative z-0 flex min-w-0 flex-1 flex-col rounded-r-lg border border-l-0 border-[#C8A2C8]/20 bg-[#0c0c0e] p-3 sm:p-4",
                            hideRightBase && "invisible"
                          )}
                        >
                          <PageSheet
                            data={rightPage}
                            compact
                            pageNumber={rightIdx + 1}
                            interactive
                            onRequestUpload={() => openUploadModal("right")}
                            onRequestDelete={() => {
                              setDeleteTargetIdx(rightIdx);
                              setDeleteModalOpen(true);
                            }}
                            frameToolsActive={frameEditIdx === rightIdx}
                            frameEditPencilSide="left"
                            onRequestFrameEdit={() =>
                              setFrameEditIdx((cur) =>
                                cur === rightIdx ? null : rightIdx
                              )
                            }
                            onUpdate={(p) => updatePageAt(rightIdx, p)}
                          />
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[40] flex justify-end pb-1.5 pr-1 pt-6">
                            <button
                              type="button"
                              disabled={
                                spreadIndex >= SPREAD_COUNT - 1 || animating
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                goNext();
                              }}
                              aria-label="Sonraki yayın"
                              className="pointer-events-auto relative z-[41] inline-flex items-center gap-1 rounded-full border border-[#C8A2C8]/35 bg-[#0a0a0c]/92 py-1 pl-2.5 pr-1.5 text-[11px] text-[#C8A2C8] shadow-[0_4px_16px_rgba(0,0,0,0.45)] backdrop-blur-sm transition hover:border-[#C8A2C8]/55 hover:bg-[#141418] disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              <span className="hidden pl-0.5 sm:inline">
                                İleri
                              </span>
                              <ChevronRight
                                className="h-4 w-4 shrink-0"
                                strokeWidth={2}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Sonraki yayının sağ sayfası: flip kartının altında (z-15); çevirmeye başlayınca hemen görünür */}
                        {spreadIndex < SPREAD_COUNT - 1 && (
                          <div
                            className="absolute inset-y-2 right-2 z-[15] flex max-w-[50%] flex-col overflow-hidden rounded-r-lg border border-l-0 border-[#C8A2C8]/20 bg-[#0c0c0e] p-3 sm:p-4"
                            style={{
                              width: `calc((100% - ${SPINE_W}px) / 2)`,
                              opacity: hideRightBase ? 1 : 0,
                              pointerEvents: "none",
                            }}
                            aria-hidden
                          >
                            <PageSheet
                              data={pages[nextRightIdx]!}
                              compact
                              pageNumber={nextRightIdx + 1}
                              interactive={false}
                              onRequestUpload={() => {}}
                              onUpdate={() => {}}
                            />
                          </div>
                        )}

                        {/* İleri çevir: DOM’da sürekli (idle’da opacity 0) — arka yüz decode gecikmesin */}
                        {spreadIndex < SPREAD_COUNT - 1 && (
                          <motion.div
                            className="absolute inset-y-2 right-2 z-20 flex max-w-[50%] origin-left will-change-transform [transform-style:preserve-3d]"
                            style={{
                              width: `calc((100% - ${SPINE_W}px) / 2)`,
                              transformStyle: "preserve-3d",
                              backfaceVisibility: "visible",
                              rotateY: rotateNextMV,
                              opacity: opacityNextMV,
                              pointerEvents: hideRightBase ? "auto" : "none",
                            }}
                          >
                            <div
                              className="absolute inset-0 flex flex-col rounded-r-lg border border-[#C8A2C8]/20 bg-[#0c0c0e] p-3 sm:p-4"
                              style={{
                                backfaceVisibility: "hidden",
                                WebkitBackfaceVisibility: "hidden",
                                transform: "rotateY(0deg)",
                              }}
                            >
                              <PageSheet
                                data={rightPage}
                                compact
                                pageNumber={rightIdx + 1}
                                interactive={false}
                                onRequestUpload={() => {}}
                                onUpdate={() => {}}
                              />
                            </div>
                            <div
                              className="absolute inset-0 flex flex-col rounded-l-lg border border-[#C8A2C8]/20 bg-[#0c0c0e] p-3 sm:p-4"
                              style={{
                                backfaceVisibility: "hidden",
                                WebkitBackfaceVisibility: "hidden",
                                transform: "rotateY(180deg)",
                              }}
                            >
                              <PageSheet
                                data={pages[nextLeftIdx]!}
                                compact
                                pageNumber={nextLeftIdx + 1}
                                interactive={false}
                                onRequestUpload={() => {}}
                                onUpdate={() => {}}
                              />
                            </div>
                          </motion.div>
                        )}

                        {spreadIndex > 0 && (
                          <motion.div
                            className="absolute inset-y-2 left-2 z-20 flex max-w-[50%] origin-right will-change-transform [transform-style:preserve-3d]"
                            style={{
                              width: `calc((100% - ${SPINE_W}px) / 2)`,
                              transformStyle: "preserve-3d",
                              rotateY: rotatePrevMV,
                              opacity: opacityPrevMV,
                              pointerEvents: hideLeftBase ? "auto" : "none",
                            }}
                          >
                            <div
                              className="absolute inset-0 flex flex-col rounded-l-lg border border-[#C8A2C8]/20 bg-[#0c0c0e] p-3 sm:p-4"
                              style={{
                                backfaceVisibility: "hidden",
                                WebkitBackfaceVisibility: "hidden",
                                transform: "rotateY(0deg)",
                              }}
                            >
                              <PageSheet
                                data={leftPage}
                                compact
                                pageNumber={leftIdx + 1}
                                interactive={false}
                                onRequestUpload={() => {}}
                                onUpdate={() => {}}
                              />
                            </div>
                            <div
                              className="absolute inset-0 flex flex-col rounded-r-lg border border-[#C8A2C8]/20 bg-[#0c0c0e] p-3 sm:p-4"
                              style={{
                                backfaceVisibility: "hidden",
                                WebkitBackfaceVisibility: "hidden",
                                transform: "rotateY(180deg)",
                              }}
                            >
                              <PageSheet
                                data={pages[prevRightIdx]!}
                                compact
                                pageNumber={prevRightIdx + 1}
                                interactive={false}
                                onRequestUpload={() => {}}
                                onUpdate={() => {}}
                              />
                            </div>
                          </motion.div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPickFile}
      />

      <AnimatePresence>
        {open && uploadModalOpen && (
          <motion.div
            key="album-upload"
            role="dialog"
            aria-modal="true"
            aria-labelledby="album-upload-title"
            className="fixed inset-0 z-[500] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-[3px]"
              aria-label="Kapat"
              onClick={() => setUploadModalOpen(false)}
            />
            <motion.div
              className="relative z-[1] w-full max-w-[300px] rounded-xl border border-[#C8A2C8]/35 bg-[#0a0a0c]/92 px-5 py-5 shadow-[0_24px_72px_-12px_rgba(0,0,0,0.75)] ring-1 ring-[#C8A2C8]/12"
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
            >
              <h3
                id="album-upload-title"
                className="text-center text-sm font-medium tracking-wide text-[#C8A2C8]"
              >
                Fotoğraf yükle
              </h3>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-zinc-500">
                Cihazından bir görsel seç; dosya penceresi yalnızca aşağıdaki
                düğmeye basınca açılır.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-[#C8A2C8]/45 bg-[#C8A2C8]/12 py-2.5 text-sm font-medium text-[#C8A2C8] transition hover:border-[#C8A2C8]/65 hover:bg-[#C8A2C8]/20"
                >
                  Dosyadan seç
                </button>
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="rounded-lg py-2 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300"
                >
                  İptal
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && deleteModalOpen && deleteTargetIdx != null && (
          <motion.div
            key="album-delete"
            role="dialog"
            aria-modal="true"
            aria-labelledby="album-delete-title"
            className="fixed inset-0 z-[500] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-[3px]"
              aria-label="Kapat"
              onClick={() => {
                setDeleteModalOpen(false);
                setDeleteTargetIdx(null);
              }}
            />
            <motion.div
              className="relative z-[1] w-full max-w-[300px] rounded-xl border border-[#C8A2C8]/35 bg-[#0a0a0c]/92 px-5 py-5 shadow-[0_24px_72px_-12px_rgba(0,0,0,0.75)] ring-1 ring-[#C8A2C8]/12"
              initial={{ opacity: 0, scale: 0.94, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 6 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
            >
              <h3
                id="album-delete-title"
                className="text-center text-sm font-medium tracking-wide text-[#C8A2C8]"
              >
                Fotoğrafı sil?
              </h3>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-zinc-500">
                Bu işlem geri alınamaz. Silmek istediğine emin misin?
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    updatePageAt(deleteTargetIdx, {
                      image: null,
                      ...DEFAULT_IMAGE_FRAME,
                    });
                    setDeleteModalOpen(false);
                    setDeleteTargetIdx(null);
                  }}
                  className="rounded-lg border border-red-900/50 bg-red-950/35 py-2.5 text-sm font-medium text-red-300/90 transition hover:border-red-800/60 hover:bg-red-950/50"
                >
                  Sil
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteModalOpen(false);
                    setDeleteTargetIdx(null);
                  }}
                  className="rounded-lg py-2 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-300"
                >
                  İptal
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
