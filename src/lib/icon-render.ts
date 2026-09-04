import { glyph, type GlyphId } from "./glyphs";
import { ACCENTS, type AccentKey, escapeXml, FONT_STACK, THEME } from "./theme";

/** Cor + intensidade (0–1) do anel de destaque ao redor do cartão — ver `icon-animator.ts`. */
export type Chrome = { color: string; strength: number };

export type CardIconModel = {
	glyphId: GlyphId;
	accent: AccentKey;
	/** Texto grande centralizado (ex.: "LIGADA", "ABRIR"). */
	label: string;
	/** Legenda pequena e discreta abaixo do rótulo (opcional — ex.: nome do device). */
	scopeLabel?: string;
};

function shell(content: string, chrome: Chrome | undefined): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
  <rect width="144" height="144" fill="${THEME.canvas}"/>
  <rect x="4" y="4" width="136" height="136" rx="22" fill="${THEME.card}" stroke="${THEME.border}"/>
  ${glowChrome(chrome)}
  ${content}
</svg>`;
}

function glowChrome(chrome: Chrome | undefined): string {
	if (!chrome || chrome.strength <= 0.003) return "";
	const strength = Math.max(0, Math.min(1, chrome.strength));
	const tintOpacity = (0.14 * strength).toFixed(3);
	const ringOpacity = (0.85 * strength).toFixed(3);
	const width = (1.8 + strength * 2.6).toFixed(2);
	return `
  <rect x="4" y="4" width="136" height="136" rx="22" fill="${chrome.color}" fill-opacity="${tintOpacity}"/>
  <rect x="4.6" y="4.6" width="134.8" height="134.8" rx="21.4" fill="none" stroke="${chrome.color}" stroke-opacity="${ringOpacity}" stroke-width="${width}"/>`;
}

function glyphChip(glyphId: GlyphId, color: string, cx: number, cy: number): string {
	const scale = 1.5;
	const translateX = (cx - 10 * scale).toFixed(2);
	const translateY = (cy - 10 * scale).toFixed(2);
	// Sem `vector-effect="non-scaling-stroke"` (suporte irregular no renderizador da tecla
	// física) — compensa a escala do `<g>` diminuindo o traço base, pra sair ~1.5 depois de
	// escalado.
	const strokeWidth = (1.5 / scale).toFixed(2);
	return `
  <circle cx="${cx}" cy="${cy}" r="26" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-opacity="0.55" stroke-width="1.6"/>
  <g transform="translate(${translateX} ${translateY}) scale(${scale})" fill="none" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
    ${glyph(glyphId, color)}
  </g>`;
}

/**
 * Único formato de ícone dinâmico deste plugin: chip com o pictograma, rótulo grande do estado
 * (ex.: "LIGADA", "ABRIR") e legenda pequena opcional. Usado tanto pelo Light Toggle (luz
 * ligada/desligada) quanto pelo Curtain Control (comando configurado no botão).
 */
export function renderCardIcon(model: CardIconModel, chrome?: Chrome): string {
	const accentColor = ACCENTS[model.accent];
	const chip = glyphChip(model.glyphId, accentColor, 72, 56);
	const label = `<text x="72" y="104" fill="${THEME.text}" font-family="${FONT_STACK}" font-size="20" font-weight="650" text-anchor="middle">${escapeXml(model.label)}</text>`;
	const scope = model.scopeLabel
		? `<text x="72" y="122" fill="${THEME.textSecondary}" font-family="${FONT_STACK}" font-size="12" text-anchor="middle">${escapeXml(model.scopeLabel)}</text>`
		: "";
	return shell(`${chip}\n  ${label}\n  ${scope}`, chrome);
}
