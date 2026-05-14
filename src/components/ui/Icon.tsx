interface PrimeIconProps {
  name: string;
  className?: string;
}

export function PrimeIcon({ name, className }: PrimeIconProps) {
  return <div className={`pi pi-${name} ${className ?? ""}`} />;
}
