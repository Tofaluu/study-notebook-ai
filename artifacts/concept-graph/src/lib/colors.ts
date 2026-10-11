export function hexToHsl(hex: string): string {
  // Remove hash if present
  hex = hex.replace(/^#/, '');
  
  // Handle 3-digit hex
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }

  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  // shadcn/ui expects HSL as raw numbers separated by spaces: "h s% l%"
  // We use Math.round to keep things clean
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return "#" + f(0) + f(8) + f(4);
}

export function getCssVariableHex(variableName: string): string {
  if (typeof window === 'undefined') return '#000000';
  const val = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  if (!val) return '#000000';
  
  const parts = val.replace(/%/g, '').split(' ').filter(Boolean);
  if (parts.length >= 3) {
    return hslToHex(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
  }
  return '#000000';
}

