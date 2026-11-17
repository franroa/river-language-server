import {
  TextDocuments,
  ColorInformation,
  Color,
  ColorPresentation,
  DocumentColorParams,
  ColorPresentationParams,
  Range
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { BaseProvider } from "./baseProvider";

/**
 * Provides color information for Alloy configuration values
 * Shows color swatches for hex colors, RGB values, and named colors
 */
export class ColorProvider extends BaseProvider {
  constructor(documents: TextDocuments<TextDocument>) {
    super(documents);
  }

  /**
   * Find all color values in the document
   */
  async provideDocumentColors(
    params: DocumentColorParams
  ): Promise<ColorInformation[]> {
    return this.handleProviderError(
      await this.getDocumentColorsImpl(params),
      'provideDocumentColors',
      []
    );
  }

  /**
   * Provide color presentations for a color
   */
  async provideColorPresentations(
    params: ColorPresentationParams
  ): Promise<ColorPresentation[]> {
    return this.handleProviderError(
      await this.getColorPresentationsImpl(params),
      'provideColorPresentations',
      []
    );
  }

  private async getDocumentColorsImpl(
    params: DocumentColorParams
  ): Promise<ColorInformation[]> {
    const document = this.documents.get(params.textDocument.uri);
    if (!document) return [];

    const colorInformations: ColorInformation[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      // Find hex colors (#RRGGBB or #RGB)
      const hexColors = this.findHexColors(line, lineIndex);
      colorInformations.push(...hexColors);

      // Find RGB/RGBA colors
      const rgbColors = this.findRgbColors(line, lineIndex);
      colorInformations.push(...rgbColors);

      // Find HSL/HSLA colors
      const hslColors = this.findHslColors(line, lineIndex);
      colorInformations.push(...hslColors);

      // Find named colors (common CSS colors)
      const namedColors = this.findNamedColors(line, lineIndex);
      colorInformations.push(...namedColors);
    }

    return colorInformations;
  }

  private findHexColors(line: string, lineIndex: number): ColorInformation[] {
    const colors: ColorInformation[] = [];
    // Match hex colors: #RGB or #RRGGBB (with optional alpha)
    const hexRegex = /#([0-9a-fA-F]{3,8})\b/g;
    let match;

    while ((match = hexRegex.exec(line)) !== null) {
      const hexValue = match[1];
      const color = this.parseHexColor(hexValue);
      
      if (color) {
        const range: Range = {
          start: { line: lineIndex, character: match.index },
          end: { line: lineIndex, character: match.index + match[0].length }
        };

        colors.push({
          range,
          color
        });
      }
    }

    return colors;
  }

  private findRgbColors(line: string, lineIndex: number): ColorInformation[] {
    const colors: ColorInformation[] = [];
    
    // Match rgb(r, g, b) or rgba(r, g, b, a)
    const rgbRegex = /rgba?\(\s*(\d+(?:\.\d+)?%?)\s*,\s*(\d+(?:\.\d+)?%?)\s*,\s*(\d+(?:\.\d+)?%?)\s*(?:,\s*(\d+(?:\.\d+)?%?))?\s*\)/g;
    let match;

    while ((match = rgbRegex.exec(line)) !== null) {
      const [, r, g, b, a] = match;
      const color = this.parseRgbColor(r, g, b, a);
      
      if (color) {
        const range: Range = {
          start: { line: lineIndex, character: match.index },
          end: { line: lineIndex, character: match.index + match[0].length }
        };

        colors.push({
          range,
          color
        });
      }
    }

    return colors;
  }

  private findHslColors(line: string, lineIndex: number): ColorInformation[] {
    const colors: ColorInformation[] = [];
    
    // Match hsl(h, s%, l%) or hsla(h, s%, l%, a)
    const hslRegex = /hsla?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*(?:,\s*(\d+(?:\.\d+)?%?))?\s*\)/g;
    let match;

    while ((match = hslRegex.exec(line)) !== null) {
      const [, h, s, l, a] = match;
      const color = this.parseHslColor(parseFloat(h), parseFloat(s), parseFloat(l), a ? parseFloat(a) : 1);
      
      if (color) {
        const range: Range = {
          start: { line: lineIndex, character: match.index },
          end: { line: lineIndex, character: match.index + match[0].length }
        };

        colors.push({
          range,
          color
        });
      }
    }

    return colors;
  }

  private findNamedColors(line: string, lineIndex: number): ColorInformation[] {
    const colors: ColorInformation[] = [];
    const namedColors = this.getNamedColors();
    
    // Look for named colors in quotes (as they would appear in config values)
    const quotedColorRegex = /"([a-zA-Z]+)"/g;
    let match;

    while ((match = quotedColorRegex.exec(line)) !== null) {
      const colorName = match[1].toLowerCase();
      const color = namedColors[colorName];
      
      if (color) {
        const range: Range = {
          start: { line: lineIndex, character: match.index },
          end: { line: lineIndex, character: match.index + match[0].length }
        };

        colors.push({
          range,
          color
        });
      }
    }

    return colors;
  }

  private parseHexColor(hex: string): Color | null {
    let r: number, g: number, b: number, a: number = 1;

    if (hex.length === 3) {
      // #RGB -> #RRGGBB
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else if (hex.length === 4) {
      // #RGBA -> #RRGGBBAA
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
      a = parseInt(hex[3] + hex[3], 16) / 255;
    } else if (hex.length === 6) {
      // #RRGGBB
      r = parseInt(hex.substring(0, 2), 16) / 255;
      g = parseInt(hex.substring(2, 4), 16) / 255;
      b = parseInt(hex.substring(4, 6), 16) / 255;
    } else if (hex.length === 8) {
      // #RRGGBBAA
      r = parseInt(hex.substring(0, 2), 16) / 255;
      g = parseInt(hex.substring(2, 4), 16) / 255;
      b = parseInt(hex.substring(4, 6), 16) / 255;
      a = parseInt(hex.substring(6, 8), 16) / 255;
    } else {
      return null;
    }

    return { red: r, green: g, blue: b, alpha: a };
  }

  private parseRgbColor(r: string, g: string, b: string, a?: string): Color | null {
    const parseValue = (value: string): number => {
      if (value.endsWith('%')) {
        return parseFloat(value) / 100;
      }
      return parseFloat(value) / 255;
    };

    const red = parseValue(r);
    const green = parseValue(g);
    const blue = parseValue(b);
    const alpha = a ? parseValue(a) : 1;

    if (isNaN(red) || isNaN(green) || isNaN(blue) || isNaN(alpha)) {
      return null;
    }

    return { red, green, blue, alpha };
  }

  private parseHslColor(h: number, s: number, l: number, a: number): Color | null {
    // Convert HSL to RGB
    h = h / 360;
    s = s / 100;
    l = l / 100;

    const hue2rgb = (p: number, q: number, t: number): number => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l; // achromatic
    } else {
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    return { red: r, green: g, blue: b, alpha: a };
  }

  private getNamedColors(): Record<string, Color> {
    return {
      // Basic colors
      red: { red: 1, green: 0, blue: 0, alpha: 1 },
      green: { red: 0, green: 0.5, blue: 0, alpha: 1 },
      blue: { red: 0, green: 0, blue: 1, alpha: 1 },
      white: { red: 1, green: 1, blue: 1, alpha: 1 },
      black: { red: 0, green: 0, blue: 0, alpha: 1 },
      yellow: { red: 1, green: 1, blue: 0, alpha: 1 },
      cyan: { red: 0, green: 1, blue: 1, alpha: 1 },
      magenta: { red: 1, green: 0, blue: 1, alpha: 1 },
      orange: { red: 1, green: 0.65, blue: 0, alpha: 1 },
      purple: { red: 0.5, green: 0, blue: 0.5, alpha: 1 },
      pink: { red: 1, green: 0.75, blue: 0.8, alpha: 1 },
      gray: { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 },
      grey: { red: 0.5, green: 0.5, blue: 0.5, alpha: 1 },
      transparent: { red: 0, green: 0, blue: 0, alpha: 0 },
    };
  }

  private async getColorPresentationsImpl(
    params: ColorPresentationParams
  ): Promise<ColorPresentation[]> {
    const { color } = params;
    const presentations: ColorPresentation[] = [];

    // Hex presentation
    const hex = this.colorToHex(color);
    presentations.push({ label: hex });

    // RGB presentation
    const rgb = this.colorToRgb(color);
    presentations.push({ label: rgb });

    // HSL presentation
    const hsl = this.colorToHsl(color);
    presentations.push({ label: hsl });

    return presentations;
  }

  private colorToHex(color: Color): string {
    const toHex = (value: number): string => {
      const hex = Math.round(value * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };

    const r = toHex(color.red);
    const g = toHex(color.green);
    const b = toHex(color.blue);

    if (color.alpha < 1) {
      const a = toHex(color.alpha);
      return `#${r}${g}${b}${a}`;
    }

    return `#${r}${g}${b}`;
  }

  private colorToRgb(color: Color): string {
    const r = Math.round(color.red * 255);
    const g = Math.round(color.green * 255);
    const b = Math.round(color.blue * 255);

    if (color.alpha < 1) {
      return `rgba(${r}, ${g}, ${b}, ${color.alpha.toFixed(2)})`;
    }

    return `rgb(${r}, ${g}, ${b})`;
  }

  private colorToHsl(color: Color): string {
    const { red: r, green: g, blue: b } = color;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h: number, s: number;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        default: h = 0;
      }
      h /= 6;
    }

    const hDeg = Math.round(h * 360);
    const sPercent = Math.round(s * 100);
    const lPercent = Math.round(l * 100);

    if (color.alpha < 1) {
      return `hsla(${hDeg}, ${sPercent}%, ${lPercent}%, ${color.alpha.toFixed(2)})`;
    }

    return `hsl(${hDeg}, ${sPercent}%, ${lPercent}%)`;
  }
}

/**
 * Main entry point for document color requests
 */
export async function provideDocumentColors(
  params: DocumentColorParams,
  documents: TextDocuments<TextDocument>
): Promise<ColorInformation[]> {
  const provider = new ColorProvider(documents);
  return provider.provideDocumentColors(params);
}

/**
 * Main entry point for color presentation requests
 */
export async function provideColorPresentations(
  params: ColorPresentationParams,
  documents: TextDocuments<TextDocument>
): Promise<ColorPresentation[]> {
  const provider = new ColorProvider(documents);
  return provider.provideColorPresentations(params);
}