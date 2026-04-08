/**
 * PawWatermark — patinha SVG decorativa em baixa opacidade para uso
 * como marca d'água nos cards do PETMOL.
 *
 * O container pai deve ter `relative overflow-hidden` para que o
 * recorte funcione corretamente quando size grande é usado.
 */

interface PawWatermarkProps {
  /** Tamanho em px. Default: 100 */
  size?: number;
  /** Opacidade de 0 a 100. Default: 6 */
  opacity?: number;
  /** Rotação em graus. Default: -20 */
  rotate?: number;
  /** Classes extras (e.g. `"text-amber-500"` para herdar cor do pai). Default: `"text-current"` */
  className?: string;
  /** Posicionamento via Tailwind. Default: bottom-0 right-0 */
  position?: string;
}

export function PawWatermark({
  size = 100,
  opacity = 6,
  rotate = -20,
  className = '',
  position = 'bottom-0 right-0',
}: PawWatermarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
      className={`absolute pointer-events-none select-none ${position} ${className}`}
      style={{
        opacity: opacity / 100,
        transform: `rotate(${rotate}deg) translate(22%, 22%)`,
      }}
    >
      {/* ── 4 almofadas dos dedos ─────────────────────────────── */}
      <ellipse cx="22" cy="27" rx="11" ry="13" />   {/* dedo esq. ext. */}
      <ellipse cx="42" cy="15" rx="12" ry="14" />   {/* dedo esq. int. */}
      <ellipse cx="63" cy="15" rx="12" ry="14" />   {/* dedo dir. int. */}
      <ellipse cx="83" cy="27" rx="11" ry="13" />   {/* dedo dir. ext. */}

      {/* ── Almofada principal (arredondada / formato coração inv.) */}
      <path d="
        M50,43
        C34,43 20,53 18,67
        C16,79 24,92 38,93
        C43,94 47,89 50,89
        C53,89 57,94 62,93
        C76,92 84,79 82,67
        C80,53 66,43 50,43 Z
      " />
    </svg>
  );
}
