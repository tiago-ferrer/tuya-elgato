/**
 * Pictogramas do card dinâmico, em coordenadas 0–20 (mesmo viewBox usado no `icon.svg` estático
 * de cada action, só reaproveitados aqui pra desenhar dentro do chip do ícone dinâmico — mesmo
 * espírito do `glyphs.ts` do github-metrics). Cada função recebe a cor de traço e devolve só o
 * miolo (paths/lines/rect), sem `<svg>` — quem monta usa dentro de um `<g transform="...">` em
 * `icon-render.ts`.
 */
export type GlyphId = "light-bulb" | "curtain-open" | "curtain-close" | "curtain-stop";

const GLYPHS: Record<GlyphId, (color: string) => string> = {
	// Mesmo glyph pros dois estados da luz (ligada/desligada) — quem muda é a cor de destaque
	// do chip ao redor, não o desenho da lâmpada em si.
	"light-bulb": (c) => `
    <path d="M10 2.6 C6.4 2.6 4.4 5.4 4.4 8.4 C4.4 10.6 5.6 12.2 6.8 13.4 C7.4 14 7.7 14.5 7.7 15.2 V15.8 H12.3 V15.2 C12.3 14.5 12.6 14 13.2 13.4 C14.4 12.2 15.6 10.6 15.6 8.4 C15.6 5.4 13.6 2.6 10 2.6 Z" stroke="${c}"/>
    <line x1="7.9" y1="17.2" x2="12.1" y2="17.2" stroke="${c}"/>
    <line x1="8.3" y1="18.6" x2="11.7" y2="18.6" stroke="${c}"/>
    <path d="M8.6 7.2 L11.2 9.4 L8.9 10.4 L11.4 12.4" stroke="${c}" stroke-width="1.1"/>`,
	"curtain-open": (c) => `
    <path d="M10 16.5 V4.5" stroke="${c}"/>
    <path d="M4.5 9 L10 3.5 L15.5 9" stroke="${c}"/>`,
	"curtain-close": (c) => `
    <path d="M10 3.5 V15.5" stroke="${c}"/>
    <path d="M4.5 11 L10 16.5 L15.5 11" stroke="${c}"/>`,
	"curtain-stop": (c) => `
    <rect x="5.5" y="5.5" width="9" height="9" rx="1.4" stroke="${c}"/>`,
};

/** Desenha o pictograma (viewBox 0–20) com o traço na cor informada. */
export function glyph(id: GlyphId, color: string): string {
	return GLYPHS[id](color);
}
