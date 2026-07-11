export function FloatingBubbles({ variant = "dark" }) {
  const isDark = variant === "dark";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        className={`absolute -left-16 top-20 h-64 w-64 rounded-full blur-3xl animate-float-slow ${
          isDark ? "bg-neon-green/20" : "bg-neon-green/10"
        }`}
      />
      <div
        className={`absolute right-0 top-32 h-48 w-72 rounded-[3rem] blur-2xl animate-float-medium ${
          isDark ? "bg-white/5" : "bg-neon-green/8"
        }`}
      />
      <div
        className={`absolute bottom-20 left-1/4 h-40 w-56 rounded-full blur-3xl animate-float-fast ${
          isDark ? "bg-neon-green/15" : "bg-neon-green/10"
        }`}
      />
      <div
        className={`absolute -right-10 bottom-40 h-56 w-56 rounded-[2rem] blur-2xl animate-float-slow ${
          isDark ? "bg-neon-green/10" : "bg-white/30"
        }`}
      />
    </div>
  );
}
