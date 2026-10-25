// Imported, so the build carries the logo in its own files: a folder whose name starts with a dot,
// such as .well-known, never reaches the mobile app, since Android leaves those out of an app.
import logo from "../../../public/.well-known/logo.svg";

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
      src={logo}
      width={512}
    />
  );
}
