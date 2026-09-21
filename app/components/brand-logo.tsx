import Image from "next/image";

type BrandLogoProps = {
  variant?: "purple" | "lime" | "white";
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ variant = "purple", className = "", priority = false }: BrandLogoProps) {
  return (
    <Image
      src={`/brand/borbogata-logo-${variant}.svg`}
      alt="Borbogata — Ousada e sem limites"
      width={721}
      height={181}
      className={className}
      priority={priority}
    />
  );
}
