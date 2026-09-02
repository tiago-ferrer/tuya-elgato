// Bundle o plugin (TypeScript, decorators incluídos) num único CommonJS
// executável dentro do .sdPlugin, para não precisar distribuir node_modules.
import { build } from "esbuild";

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const options = {
	entryPoints: ["src/plugin.ts"],
	outfile: "dev.tferrer.tuya-elgato.sdPlugin/bin/plugin.js",
	bundle: true,
	platform: "node",
	target: "node20",
	format: "cjs",
	// SDK 2 do Stream Deck usa decorators (experimentalDecorators) — o esbuild
	// já lida com isso lendo o tsconfig.json.
	sourcemap: true,
	minify: false,
	logLevel: "info"
};

if (watch) {
	const { context } = await import("esbuild");
	const ctx = await context(options);
	await ctx.watch();
	console.log("Observando alterações...");
} else {
	await build(options);
}
