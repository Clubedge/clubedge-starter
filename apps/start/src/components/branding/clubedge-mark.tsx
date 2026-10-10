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
    <img
      alt={alt}
      className={className}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      height={512}
      loading={priority ? "eager" : "lazy"}
      src="/.well-known/logo.svg"
      width={512}
    />
  );
}
