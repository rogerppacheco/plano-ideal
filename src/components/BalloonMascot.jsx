import mascotImg from "../assets/mascot-balloon.png";

const SIZE_CLASSES = {
  sm: "h-28 w-28 sm:h-32 sm:w-32",
  md: "h-40 w-40 sm:h-48 sm:w-48",
  lg: "h-52 w-52 sm:h-64 sm:w-64 md:h-72 md:w-72",
  xl: "h-64 w-64 sm:h-80 sm:w-80 md:h-96 md:w-96",
};

export function BalloonMascot({
  size = "lg",
  className = "",
  animate = true,
  label = "Mascote Fibra Aqui",
}) {
  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      role="img"
      aria-label={label}
    >
      <div
        className={`absolute inset-0 rounded-full bg-neon-green/20 blur-2xl ${
          animate ? "animate-pulse-neon" : ""
        }`}
        aria-hidden="true"
      />
      <img
        src={mascotImg}
        alt=""
        aria-hidden="true"
        className={`relative z-10 object-contain drop-shadow-[0_20px_40px_rgba(57,255,20,0.25)] ${
          SIZE_CLASSES[size] || SIZE_CLASSES.lg
        } ${animate ? "animate-float-medium" : ""}`}
      />
    </div>
  );
}
