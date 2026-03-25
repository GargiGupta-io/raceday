import Image from "next/image";

/**
 * Full-bleed hero image with gradient overlay that fades into the dark background.
 * Used behind hero sections and as page-level atmosphere.
 */
export default function HeroImage({
  src,
  alt,
  height = "h-[70vh]",
  opacity = "opacity-40",
  position = "object-center",
}: {
  src: string;
  alt: string;
  height?: string;
  opacity?: string;
  position?: string;
}) {
  return (
    <div className={`absolute inset-0 ${height} overflow-hidden pointer-events-none select-none`}>
      <Image
        src={src}
        alt={alt}
        fill
        className={`${opacity} ${position} object-cover`}
        sizes="100vw"
        priority
      />
      {/* Bottom fade to dark background */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#08080c] via-[#08080c]/60 to-transparent" />
      {/* Side fades */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#08080c]/40 via-transparent to-[#08080c]/40" />
    </div>
  );
}
