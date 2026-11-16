import Image from "next/image";

/** Fills its parent (which must be position: relative and have a size). */
export default function Photo({
  src,
  alt,
  sizes = "100vw",
  priority = false,
}: {
  src: string;
  alt: string;
  sizes?: string;
  priority?: boolean;
}) {
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} style={{ objectFit: "cover" }} />;
}
