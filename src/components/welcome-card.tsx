"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const MotionLink = motion.create(Link);

const heartHoverTransition = {
  duration: 1.15,
  repeat: Infinity,
  ease: [0.42, 0, 0.58, 1] as const,
};

export function WelcomeCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "w-full max-w-[min(100%,28rem)] rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-2xl sm:max-w-md sm:rounded-[2.25rem] sm:p-8 md:max-w-lg md:rounded-[2.5rem] md:p-10 lg:max-w-xl lg:p-12",
        "text-center"
      )}
    >
      <p
        className={cn(
          "mb-6 text-xl font-medium tracking-tight sm:text-2xl md:text-3xl",
          "bg-gradient-to-r from-[#e9d5ff] via-[#f5e6ff] to-[#fbcfe8] bg-clip-text text-transparent"
        )}
      >
        Beraber her şeye ...
      </p>
      <MotionLink
        href="/login"
        whileHover={{
          scale: [1, 1.07, 1, 1.055, 1, 1.04, 1],
          opacity: [1, 0.94, 1, 0.97, 1, 0.98, 1],
          boxShadow: [
            "0 10px 28px rgba(15, 23, 42, 0.18), 0 0 0 rgba(200, 162, 200, 0)",
            "0 0 36px rgba(200, 162, 200, 0.55), 0 0 56px rgba(200, 162, 200, 0.35)",
            "0 10px 28px rgba(15, 23, 42, 0.16), 0 0 0 rgba(200, 162, 200, 0)",
            "0 0 44px rgba(200, 162, 200, 0.65), 0 0 72px rgba(200, 162, 200, 0.4)",
            "0 10px 28px rgba(15, 23, 42, 0.18), 0 0 0 rgba(200, 162, 200, 0)",
            "0 0 32px rgba(200, 162, 200, 0.5), 0 0 52px rgba(200, 162, 200, 0.3)",
            "0 10px 28px rgba(15, 23, 42, 0.18), 0 0 0 rgba(200, 162, 200, 0)",
          ],
        }}
        whileTap={{ scale: 0.97 }}
        transition={{
          scale: heartHoverTransition,
          opacity: heartHoverTransition,
          boxShadow: heartHoverTransition,
        }}
        className={cn(
          "inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-[#0F172A] sm:py-4 sm:text-base",
          "bg-gradient-to-r from-[#C8A2C8] via-[#d4b8e8] to-[#e9d5ff]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C8A2C8]"
        )}
      >
        Başla
        <ArrowRight className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
      </MotionLink>
    </motion.div>
  );
}
