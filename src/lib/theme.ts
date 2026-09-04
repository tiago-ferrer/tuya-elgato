/**
 * Paleta escura fixa (não detecta claro/escuro do sistema — decisão deliberada: combina com o
 * hardware do Stream Deck, que já é preto, e funciona igual em mac/Windows). Inspirado no estilo
 * de ícone dinâmico do github-metrics (`theme.ts`), simplificado pro nosso caso (sem números,
 * sem métricas — só o card do estado atual de uma luz ou de um comando de cortina).
 */
/**
 * Cores sólidas (sem `rgba()`/transparência no valor) — o renderizador de SVG usado pela tecla
 * física (bem mais limitado que um navegador; a Property Inspector sim roda num Chromium
 * completo) costuma rejeitar `rgba()` em silêncio, sem erro nenhum, deixando a tecla presa na
 * imagem estática do manifest. `border` já é a cor final pré-misturada com o fundo do cartão
 * (`card`), em vez de branco translúcido.
 */
export const THEME = Object.freeze({
	canvas: "#000000",
	card: "#141414",
	border: "#2B2B2B",
	text: "#F2F6FA",
	textSecondary: "#B7BEC7",
});

/** Uma cor de destaque por estado/comando — dá identidade visual própria a cada card. */
export const ACCENTS = Object.freeze({
	amber: "#F5A524",
	muted: "#7A828C",
	teal: "#2DD4BF",
	orange: "#FB923C",
	indigo: "#818CF8",
	red: "#FF6B6B",
});

export type AccentKey = keyof typeof ACCENTS;

/**
 * Sem nomes internos (`.AppleSystemUIFont`) nem palavras-chave só de navegador (`-apple-system`)
 * — o renderizador da tecla física não é um navegador, então usa nomes de fonte concretos que
 * existem de verdade tanto no mac quanto no Windows.
 */
export const FONT_STACK = "'Helvetica Neue', Helvetica, 'Segoe UI', Arial, sans-serif";

export function escapeXml(value: string): string {
	return value.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c);
}
