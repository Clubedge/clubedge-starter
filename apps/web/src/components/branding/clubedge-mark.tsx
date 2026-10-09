import Image from "next/image";

type ClubedgeMarkProps = {
  alt?: string;
  className?: string;
  priority?: boolean;
};

export function ClubedgeMark({
  alt = "Clubedge",
  className = "size-10",
  priority = false,
}: ClubedgeMarkProps) {
  return (
    <Image
      alt={alt}
      className={className}
      height={512}
      priority={priority}
      src="/.well-known/logo.svg"
      unoptimized
      width={512}
    />
  );
}
