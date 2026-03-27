import { cn } from "@/lib/utils";

/**
 * Fixed z-[-1] blur küreleri — globals.css içindeki float animasyonları ile hareket eder.
 */
export function BackgroundOrbs() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden"
      aria-hidden
    >
      <div
        className={cn(
          "absolute h-[min(78vw,520px)] w-[min(78vw,520px)] rounded-full bg-[#C8A2C8] opacity-[0.35] sm:h-[min(85vw,640px)] sm:w-[min(85vw,640px)] md:h-[min(88vw,720px)] md:w-[min(88vw,720px)]",
          "blur-[120px] md:blur-[150px]",
          "float-orb-a -left-[15%] -top-[20%]"
        )}
      />
      <div
        className={cn(
          "absolute h-[min(74vw,480px)] w-[min(74vw,480px)] rounded-full bg-[#FBCFE8] opacity-[0.28] sm:h-[min(80vw,600px)] sm:w-[min(80vw,600px)] md:h-[min(85vw,680px)] md:w-[min(85vw,680px)]",
          "blur-[120px] md:blur-[150px]",
          "float-orb-b -bottom-[25%] -right-[10%]"
        )}
      />
    </div>
  );
}
