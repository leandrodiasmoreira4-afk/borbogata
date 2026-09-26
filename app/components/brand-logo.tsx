import Image from "next/image";

type BrandLogoProps = {
  variant?: "purple" | "lime" | "white";
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className = "", priority = false }: BrandLogoProps) {
  return (
    <span className={`official-logo ${className}`}>
      <Image src="/brand/borbogata-oficial.png" alt="Borbogata modas — seu estilo, nossa história" width={1200} height={1200} priority={priority} unoptimized />
    </span>
  );
}
