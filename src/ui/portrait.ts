import type { Character } from '../core/characters';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
let uid = 0;

/** A stylised neon pilot portrait as an inline SVG string (100x100 viewBox). */
export function portrait(c: Character, size = 72): string {
  const col = hex(c.color);
  const id = `p${uid++}`;
  const parts: string[] = [];
  parts.push(`<defs><radialGradient id="${id}" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${col}" stop-opacity="0.35"/><stop offset="1" stop-color="#05060b"/></radialGradient></defs>`);
  parts.push(`<rect width="100" height="100" rx="14" fill="url(#${id})"/>`);
  // Shoulders / flight suit.
  parts.push(`<path d="M10 100 C14 76 30 70 50 70 C70 70 86 76 90 100 Z" fill="#0b0e1a" stroke="${col}" stroke-width="2"/>`);
  parts.push(`<path d="M50 70 L50 100 M36 74 L42 100 M64 74 L58 100" stroke="${col}" stroke-opacity="0.4" stroke-width="1.5"/>`);
  const human = c.head === 'headset' || c.head === 'shades';
  if (human) {
    // Face, hair and accessories for non-pilots.
    parts.push(`<rect x="45" y="58" width="10" height="14" fill="#2a2030"/>`);
    parts.push(`<ellipse cx="50" cy="44" rx="17" ry="20" fill="#3a2a34" stroke="${col}" stroke-width="1.5"/>`);
    if (c.head === 'headset') {
      parts.push(`<path d="M33 40 C33 18 67 18 67 40" fill="none" stroke="#c9d4e0" stroke-width="2.5"/>`);
      parts.push(`<path d="M32 30 C36 18 64 18 68 30 C62 24 40 24 32 30Z" fill="#c9d4e0" fill-opacity="0.85"/>`);
      parts.push(`<rect x="28" y="36" width="7" height="12" rx="3" fill="${col}"/><rect x="65" y="36" width="7" height="12" rx="3" fill="${col}"/>`);
      parts.push(`<path d="M31 48 Q34 58 46 57" fill="none" stroke="${col}" stroke-width="2"/><circle cx="46" cy="57" r="2.2" fill="${col}"/>`);
      parts.push(`<circle cx="43" cy="43" r="2" fill="#fff"/><circle cx="57" cy="43" r="2" fill="#fff"/><path d="M44 52 Q50 55 56 52" stroke="#fff" stroke-width="1.5" fill="none"/>`);
    } else {
      parts.push(`<path d="M32 36 C30 16 70 14 68 34 C64 26 52 22 42 26 C38 28 34 31 32 36Z" fill="${col}"/>`);
      parts.push(`<rect x="34" y="38" width="32" height="8" rx="4" fill="#05060b" stroke="${col}" stroke-width="1.5"/>`);
      parts.push(`<path d="M42 54 Q50 59 58 54" stroke="#fff" stroke-width="1.8" fill="none"/>`);
      parts.push(`<path d="M66 62 L80 50" stroke="#c9d4e0" stroke-width="2"/><rect x="77" y="42" width="8" height="12" rx="4" fill="${col}"/>`);
    }
  } else {
    // Helmet.
    parts.push(`<path d="M28 50 C28 22 72 22 72 50 L72 60 C72 66 66 70 60 70 L40 70 C34 70 28 66 28 60 Z" fill="#11142a" stroke="${col}" stroke-width="2"/>`);
    if (c.head === 'crest') parts.push(`<path d="M50 20 L54 30 L50 52 L46 30 Z" fill="${col}" fill-opacity="0.8"/>`);
    if (c.head === 'fin') parts.push(`<path d="M68 34 L84 22 L74 44 Z" fill="${col}" fill-opacity="0.75"/>`);
    if (c.head === 'horns') parts.push(`<path d="M32 34 L22 20 L38 30 Z M68 34 L78 20 L62 30 Z" fill="${col}"/>`);
    const glow = `fill="${col}" fill-opacity="0.85"`;
    switch (c.visor) {
      case 'band': parts.push(`<rect x="31" y="42" width="38" height="11" rx="5" ${glow}/>`); break;
      case 'round': parts.push(`<ellipse cx="50" cy="48" rx="16" ry="11" ${glow}/>`); break;
      case 'split': parts.push(`<path d="M31 42 L48 46 L48 54 L33 52 Z M69 42 L52 46 L52 54 L67 52 Z" ${glow}/>`); break;
      case 'slit': parts.push(`<rect x="32" y="46" width="36" height="4" rx="2" ${glow}/>`); break;
      default: break;
    }
    parts.push(`<path d="M36 44 L44 44" stroke="#fff" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round"/>`);
    parts.push(`<path d="M40 64 L60 64" stroke="${col}" stroke-opacity="0.5" stroke-width="2"/>`);
  }
  return `<svg class="portrait" viewBox="0 0 100 100" width="${size}" height="${size}" style="--c:${col}">${parts.join('')}</svg>`;
}
