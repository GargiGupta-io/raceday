import Image from "next/image";

/**
 * Full-width image strip used as a visual break between content sections.
 * Fades at top and bottom to blend into the dark background.
 */
export default function SectionDivider({
  src,
  alt,
  height = "h-48",
}: {
  src: string;
  alt: string;
  height?: string;
}) {
  return (
    <div className={`relative w-full ${height} my-16 overflow-hidden`}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover object-center opacity-30"
        sizes="100vw"
      />
      {/* Top + bottom fade */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#08080c] via-transparent to-[#08080c]" />
    </div>
  );
}
