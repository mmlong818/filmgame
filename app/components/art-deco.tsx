// Art Deco decorative components — Empire State Building geometric vocabulary

const BRIGHT = '#c87858'
const MID    = '#904030'
const DEEP   = '#5c1010'
const DOT    = '#c84040'

type Corner = 'tl' | 'tr' | 'bl' | 'br'

function cornerL(corner: Corner, W: number, H: number, count = 10, start = 28, step = 19) {
  const HL = 265, VL = 205
  return Array.from({ length: count }, (_, i) => {
    const o = start + i * step
    const hLen = Math.max(o + 8, HL - i * (HL / count / 1.1))
    const vLen = Math.max(o + 8, VL - i * (VL / count / 1.1))
    const a = (1 - (i / count) * 0.88).toFixed(2)
    const sw = i === 0 ? 2 : i === 1 ? 1.5 : 1
    let hx1: number, hy1: number, hx2: number
    let vx1: number, vy1: number, vy2: number
    if (corner === 'tl') {
      hx1 = o; hy1 = o; hx2 = hLen; vx1 = o; vy1 = o; vy2 = vLen
    } else if (corner === 'tr') {
      hx1 = W - o; hy1 = o; hx2 = W - hLen; vx1 = W - o; vy1 = o; vy2 = vLen
    } else if (corner === 'bl') {
      hx1 = o; hy1 = H - o; hx2 = hLen; vx1 = o; vy1 = H - o; vy2 = H - vLen
    } else {
      hx1 = W - o; hy1 = H - o; hx2 = W - hLen; vx1 = W - o; vy1 = H - o; vy2 = H - vLen
    }
    return [
      <line key={`h${i}`} x1={hx1} y1={hy1} x2={hx2} y2={hy1} stroke={BRIGHT} strokeWidth={sw} strokeOpacity={a} />,
      <line key={`v${i}`} x1={vx1} y1={vy1} x2={vx1} y2={vy2} stroke={BRIGHT} strokeWidth={sw} strokeOpacity={a} />,
    ]
  }).flat()
}

/** Full-page Art Deco frame — rose-copper geometric, ESB + Hollywood vocabulary */
export function ArtDecoHeroFrame({ className = '' }: { className?: string }) {
  const W = 1440, H = 810, cx = 720

  // Vertical line cluster for center top/bottom ornaments
  const vCluster = [-60, -48, -36, -24, -12, 0, 12, 24, 36, 48, 60]

  // Left/right horizontal accents: { y, x1, x2 }
  const leftAccents = [
    { y: 158, x1: 128, x2: 475 },
    { y: 242, x1: 102, x2: 520, dot2: 185 },
    { y: 292, x1:  90, x2: 558 },
    { y: 518, x1:  90, x2: 558 },
    { y: 568, x1: 102, x2: 520 },
    { y: 652, x1: 128, x2: 475 },
  ]

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="fgH" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor={DEEP} />
          <stop offset="35%"  stopColor={MID} />
          <stop offset="55%"  stopColor={BRIGHT} />
          <stop offset="100%" stopColor={DEEP} />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width={W} height={H} fill="#060408" />

      {/* ── CORNER L-SHAPES ── */}
      {cornerL('tl', W, H)}
      {cornerL('tr', W, H)}
      {cornerL('bl', W, H)}
      {cornerL('br', W, H)}

      {/* ── EDGE BANDS (top / bottom / left / right) ── */}
      {[2, 6, 10, 13, 16, 19, 22].map((d, i) => {
        const sw = i < 2 ? 2 : 1
        const op = (1 - i * 0.11).toFixed(2)
        return [
          <line key={`te${i}`} x1={0}   y1={d}   x2={W}   y2={d}   stroke={BRIGHT} strokeWidth={sw} strokeOpacity={op} />,
          <line key={`be${i}`} x1={0}   y1={H-d} x2={W}   y2={H-d} stroke={BRIGHT} strokeWidth={sw} strokeOpacity={op} />,
          <line key={`le${i}`} x1={d}   y1={0}   x2={d}   y2={H}   stroke={BRIGHT} strokeWidth={sw} strokeOpacity={op} />,
          <line key={`re${i}`} x1={W-d} y1={0}   x2={W-d} y2={H}   stroke={BRIGHT} strokeWidth={sw} strokeOpacity={op} />,
        ]
      }).flat()}

      {/* ── TOP CENTER ORNAMENT ── */}
      {/* Vertical parallel lines descending from top */}
      {vCluster.map((dx, i) => (
        <line key={`tv${i}`} x1={cx+dx} y1={0} x2={cx+dx} y2={152}
          stroke={BRIGHT} strokeWidth={1} strokeOpacity={(0.55 + (1 - Math.abs(dx)/60) * 0.35).toFixed(2)} />
      ))}
      {/* Nested downward chevrons */}
      <polyline points={`${cx-145},140 ${cx},225 ${cx+145},140`} fill="none" stroke={BRIGHT} strokeWidth={2} />
      <polyline points={`${cx-108},140 ${cx},198 ${cx+108},140`} fill="none" stroke={MID}    strokeWidth={1.5} />
      <polyline points={`${cx-72},140  ${cx},172 ${cx+72},140`}  fill="none" stroke={DEEP}   strokeWidth={1} />
      {/* Horizontal connector */}
      <line x1={cx-205} y1={140} x2={cx+205} y2={140} stroke={BRIGHT} strokeWidth={1} strokeOpacity="0.45" />

      {/* ── TOP HORIZONTAL ACCENT LINES ── */}
      {[80, 108, 128].map((y, i) => (
        <g key={`tha${i}`}>
          <line x1={28}      y1={y} x2={cx-165} y2={y} stroke={BRIGHT} strokeWidth={1} strokeOpacity={(0.48 - i * 0.1).toFixed(2)} />
          <line x1={cx+165}  y1={y} x2={W-28}   y2={y} stroke={BRIGHT} strokeWidth={1} strokeOpacity={(0.48 - i * 0.1).toFixed(2)} />
          {i === 0 && <><circle cx={340}   cy={y} r={3.5} fill={DOT} /><circle cx={W-340} cy={y} r={3.5} fill={DOT} /></>}
        </g>
      ))}

      {/* ── BOTTOM CENTER ORNAMENT ── */}
      {vCluster.map((dx, i) => (
        <line key={`bv${i}`} x1={cx+dx} y1={H} x2={cx+dx} y2={H-175}
          stroke={BRIGHT} strokeWidth={1} strokeOpacity={(0.55 + (1 - Math.abs(dx)/60) * 0.35).toFixed(2)} />
      ))}
      <polyline points={`${cx-145},${H-162} ${cx},${H-248} ${cx+145},${H-162}`} fill="none" stroke={BRIGHT} strokeWidth={2} />
      <polyline points={`${cx-108},${H-162} ${cx},${H-220} ${cx+108},${H-162}`} fill="none" stroke={MID}    strokeWidth={1.5} />
      <polyline points={`${cx-72},${H-162}  ${cx},${H-194} ${cx+72},${H-162}`}  fill="none" stroke={DEEP}   strokeWidth={1} />
      <line x1={cx-205} y1={H-162} x2={cx+205} y2={H-162} stroke={BRIGHT} strokeWidth={1} strokeOpacity="0.45" />

      {/* ── BOTTOM HORIZONTAL ACCENT LINES ── */}
      {[80, 108, 128].map((y, i) => (
        <g key={`bha${i}`}>
          <line x1={28}     y1={H-y} x2={cx-165} y2={H-y} stroke={BRIGHT} strokeWidth={1} strokeOpacity={(0.48 - i * 0.1).toFixed(2)} />
          <line x1={cx+165} y1={H-y} x2={W-28}   y2={H-y} stroke={BRIGHT} strokeWidth={1} strokeOpacity={(0.48 - i * 0.1).toFixed(2)} />
          {i === 0 && <><circle cx={340}   cy={H-y} r={3.5} fill={DOT} /><circle cx={W-340} cy={H-y} r={3.5} fill={DOT} /></>}
        </g>
      ))}

      {/* ── LEFT HORIZONTAL ACCENTS ── */}
      {leftAccents.map(({ y, x1, x2, dot2 }, i) => (
        <g key={`la${i}`}>
          <line x1={x1} y1={y} x2={x2} y2={y} stroke={BRIGHT} strokeWidth={1} strokeOpacity="0.65" />
          <circle cx={x2} cy={y} r={3.5} fill={DOT} />
          {dot2 && <circle cx={dot2} cy={y} r={3} fill={DOT} fillOpacity="0.7" />}
        </g>
      ))}

      {/* ── RIGHT HORIZONTAL ACCENTS (mirror) ── */}
      {leftAccents.map(({ y, x1, x2, dot2 }, i) => (
        <g key={`ra${i}`}>
          <line x1={W-x1} y1={y} x2={W-x2} y2={y} stroke={BRIGHT} strokeWidth={1} strokeOpacity="0.65" />
          <circle cx={W-x2} cy={y} r={3.5} fill={DOT} />
          {dot2 && <circle cx={W-dot2} cy={y} r={3} fill={DOT} fillOpacity="0.7" />}
        </g>
      ))}

      {/* ── EDGE DOTS ── */}
      {[118, 200, 405, 610, 692].map((y, i) => (
        <g key={`ed${i}`}>
          <circle cx={28}   cy={y} r={3.5} fill={DOT} />
          <circle cx={W-28} cy={y} r={3.5} fill={DOT} />
        </g>
      ))}

      {/* ── DIAMOND ACCENTS (left / right mid) ── */}
      <rect x={121} y={393} width={16} height={16} transform="rotate(45 129 401)" fill={DOT} />
      <rect x={W-137} y={393} width={16} height={16} transform={`rotate(45 ${W-129} 401)`} fill={DOT} />

      {/* ── TICK MARKS ── */}
      {[68, 398, 738].map((y, i) => (
        <g key={`tk${i}`}>
          <line x1={28}   y1={y} x2={28}   y2={y+14} stroke={BRIGHT} strokeWidth={2.5} strokeOpacity="0.8" />
          <line x1={W-28} y1={y} x2={W-28} y2={y+14} stroke={BRIGHT} strokeWidth={2.5} strokeOpacity="0.8" />
        </g>
      ))}
    </svg>
  )
}

/** Horizontal gold rule — three-layer nested diamond center */
export function ArtDecoRule({ className = '' }: { className?: string }) {
  return (
    <div className={`relative flex items-center gap-4 ${className}`}>
      <div className="flex-1" style={{ height: '2px', background: 'linear-gradient(90deg, transparent 0%, var(--gold-dim) 20%, var(--gold-mid) 60%, var(--gold-bright) 100%)' }} />
      <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
        <rect x="1" y="1" width="22" height="22" transform="rotate(45 12 12)"
          fill="none" stroke="var(--gold-bright)" strokeWidth="1.5" />
        <rect x="4.5" y="4.5" width="15" height="15" transform="rotate(45 12 12)"
          fill="none" stroke="var(--gold-mid)" strokeWidth="1" />
        <rect x="7.5" y="7.5" width="9" height="9" transform="rotate(45 12 12)"
          fill="var(--gold-mid)" fillOpacity="0.85" />
      </svg>
      <div className="flex-1" style={{ height: '2px', background: 'linear-gradient(90deg, var(--gold-bright) 0%, var(--gold-mid) 40%, var(--gold-dim) 80%, transparent 100%)' }} />
    </div>
  )
}

/** Stepped L-corner — Empire State Building setback silhouette */
export function ArtDecoStepCorner({
  corner,
  size = 200,
  steps = 9,
  opacity = 0.55,
  className = '',
}: {
  corner: 'tl' | 'tr' | 'bl' | 'br'
  size?: number
  steps?: number
  opacity?: number
  className?: string
}) {
  const gap = size / (steps + 1)
  const rotations = { tl: 0, tr: 90, br: 180, bl: 270 }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ opacity, transform: `rotate(${rotations[corner]}deg)` }}
      className={`absolute pointer-events-none ${className}`}
    >
      {Array.from({ length: steps }, (_, i) => {
        const o = i * gap
        const len = size - i * gap
        const strokeWidth = i === 0 ? 2 : i === 1 ? 1.5 : 1
        const strokeOpacity = 1 - (i / steps) * 0.88
        return (
          <g key={i}>
            <line x1={o} y1={o} x2={len} y2={o}
              stroke="var(--gold-bright)" strokeWidth={strokeWidth} strokeOpacity={strokeOpacity} />
            <line x1={o} y1={o} x2={o} y2={len}
              stroke="var(--gold-bright)" strokeWidth={strokeWidth} strokeOpacity={strokeOpacity} />
          </g>
        )
      })}
    </svg>
  )
}

/** Corner fan — kept for narrower contexts */
export function ArtDecoCornerFan({
  corner,
  size = 80,
  opacity = 0.55,
  className = '',
}: {
  corner: 'tl' | 'tr' | 'bl' | 'br'
  size?: number
  opacity?: number
  className?: string
}) {
  const rotations = { tl: 0, tr: 90, br: 180, bl: 270 }
  const r = size - 6
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ opacity, transform: `rotate(${rotations[corner]}deg)` }}
      className={`absolute pointer-events-none ${className}`}
    >
      {[0, 18, 36, 54, 72, 90].map((angle, i) => {
        const rad = (angle * Math.PI) / 180
        const x2 = (Math.cos(rad) * r).toFixed(1)
        const y2 = (Math.sin(rad) * r).toFixed(1)
        return (
          <line key={i} x1="0" y1="0" x2={x2} y2={y2}
            stroke="var(--gold-bright)" strokeWidth="1.5" />
        )
      })}
      <path d={`M ${r},0 A ${r},${r} 0 0 1 0,${r}`}
        fill="none" stroke="var(--gold-bright)" strokeWidth="2" />
      <path d={`M ${r * 0.6},0 A ${r * 0.6},${r * 0.6} 0 0 1 0,${r * 0.6}`}
        fill="none" stroke="var(--gold-dim)" strokeWidth="1" />
    </svg>
  )
}

/** Wordmark — the brand centerpiece */
export function ShellWordmark({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  if (size === 'sm') {
    return (
      <div className="flex items-center gap-2.5">
        <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
          <rect x="0.5" y="0.5" width="19" height="15" stroke="var(--gold-mid)" strokeWidth="1.5"/>
          <rect x="2" y="2" width="3" height="3" fill="var(--gold-mid)" fillOpacity="0.8"/>
          <rect x="2" y="6.5" width="3" height="3" fill="var(--gold-mid)" fillOpacity="0.8"/>
          <rect x="2" y="11" width="3" height="3" fill="var(--gold-mid)" fillOpacity="0.8"/>
          <rect x="15" y="2" width="3" height="3" fill="var(--gold-mid)" fillOpacity="0.8"/>
          <rect x="15" y="6.5" width="3" height="3" fill="var(--gold-mid)" fillOpacity="0.8"/>
          <rect x="15" y="11" width="3" height="3" fill="var(--gold-mid)" fillOpacity="0.8"/>
          <rect x="7" y="2.5" width="6" height="11" rx="0.5" fill="var(--gold-dim)" fillOpacity="0.3"/>
        </svg>
        <span className="text-sm font-bold tracking-[0.2em] uppercase" style={{ color: 'var(--shell-fg)' }}>
          猫叔影游
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width="52" height="40" viewBox="0 0 52 40" fill="none">
        <rect x="1" y="1" width="50" height="38" stroke="var(--gold-mid)" strokeWidth="2"/>
        <rect x="3.5" y="4" width="7" height="7" fill="var(--gold-mid)" fillOpacity="0.8"/>
        <rect x="3.5" y="16.5" width="7" height="7" fill="var(--gold-mid)" fillOpacity="0.8"/>
        <rect x="3.5" y="29" width="7" height="7" fill="var(--gold-mid)" fillOpacity="0.8"/>
        <rect x="41.5" y="4" width="7" height="7" fill="var(--gold-mid)" fillOpacity="0.8"/>
        <rect x="41.5" y="16.5" width="7" height="7" fill="var(--gold-mid)" fillOpacity="0.8"/>
        <rect x="41.5" y="29" width="7" height="7" fill="var(--gold-mid)" fillOpacity="0.8"/>
        <rect x="14" y="5" width="24" height="30" rx="1" fill="var(--gold-dim)" fillOpacity="0.2"/>
        <rect x="14" y="5" width="24" height="30" rx="1" stroke="var(--gold-dim)" strokeWidth="1"/>
      </svg>
      <div className="text-center">
        <div
          className="text-4xl font-bold tracking-[0.35em] uppercase"
          style={{ color: 'var(--shell-fg)', letterSpacing: '0.35em' }}
        >
          猫叔的互动影游创作系统
        </div>
        <div style={{ height: '2px', marginTop: '8px', background: 'linear-gradient(90deg, transparent, var(--gold-mid), var(--gold-bright), var(--gold-mid), transparent)' }} />
        <div
          className="text-xs tracking-[0.4em] uppercase mt-2"
          style={{ color: 'var(--gold-mid)' }}
        >
          Interactive Film Game Studio
        </div>
      </div>
    </div>
  )
}

/** Thick gold horizontal band */
export function GoldBar({ className = '' }: { className?: string }) {
  return (
    <div
      className={className}
      style={{
        height: '3px',
        background: 'linear-gradient(90deg, transparent 0%, var(--gold-dim) 10%, var(--gold-mid) 30%, var(--gold-bright) 50%, var(--gold-mid) 70%, var(--gold-dim) 90%, transparent 100%)',
      }}
    />
  )
}
