export default function F1Car({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M50,80 L30,75 L20,70 L15,65 L20,55 L40,50 L80,45 L120,40 L160,38 L200,36 L280,35 L320,36 L350,40 L370,45 L380,50 L385,55 L380,65 L370,72 L350,78 L320,80 Z" fill="currentColor" opacity="0.9"/>
      <path d="M15,65 L5,62 L2,60 L5,58 L15,55 L20,55 L15,65Z" fill="currentColor" opacity="0.8"/>
      <path d="M370,30 L385,28 L390,30 L390,45 L385,48 L375,45 L370,40Z" fill="currentColor" opacity="0.85"/>
      <path d="M5,62 L0,60 L0,55 L5,53 L20,55 L15,65 L5,62Z" fill="currentColor" opacity="0.7"/>
      <path d="M160,38 L165,28 L175,24 L195,24 L205,28 L210,38" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.6"/>
      <ellipse cx="90" cy="78" rx="18" ry="18" fill="currentColor" opacity="0.95"/>
      <ellipse cx="90" cy="78" rx="10" ry="10" fill="black" opacity="0.5"/>
      <ellipse cx="320" cy="78" rx="20" ry="20" fill="currentColor" opacity="0.95"/>
      <ellipse cx="320" cy="78" rx="11" ry="11" fill="black" opacity="0.5"/>
    </svg>
  );
}
