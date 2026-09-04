import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { iconAnimator, safeSetImage } from "../lib/icon-animator";
import { renderCardIcon, type CardIconModel } from "../lib/icon-render";
import { ACCENTS } from "../lib/theme";
import { getDeviceStatus, sendCommands, TuyaApiError, TuyaConfigError, TuyaGlobalSettings } from "../tuya/cloud";

/** Settings salvas por instância do botão (uma luz por botão). */
export interface LightToggleSettings extends JsonObject {
	deviceId?: string;
	/** Code do DP de liga/desliga na Tuya. A maioria das luminárias usa "switch_led". */
	switchCode?: string;
}

const DEFAULT_SWITCH_CODE = "switch_led";

const logger = streamDeck.logger.createScope("LightToggle");

function cardFor(isOn: boolean): CardIconModel {
	return {
		glyphId: "light-bulb",
		accent: isOn ? "amber" : "muted",
		label: isOn ? "LIGADA" : "DESLIGADA",
	};
}

@action({ UUID: "dev.tferrer.tuya-elgato.light-toggle" })
export class LightToggleAction extends SingletonAction<LightToggleSettings> {
	/** Último estado (ligada/desligada) desenhado por tecla — usado só pra decidir se a próxima troca pulsa ou desenha parado. */
	#lastOn = new Map<string, boolean>();

	override onWillDisappear(ev: WillDisappearEvent<LightToggleSettings>): void {
		this.#lastOn.delete(ev.action.id);
		iconAnimator.stop(ev.action.id);
	}

	/**
	 * Ao aparecer no Stream Deck, consulta o estado atual do dispositivo (se já
	 * configurado) para que o ícone reflita a realidade assim que o app abre,
	 * em vez de esperar o primeiro clique.
	 */
	override async onWillAppear(ev: WillAppearEvent<LightToggleSettings>): Promise<void> {
		const settings = ev.payload.settings;
		// Esta ação só declara Controllers: ["Keypad"] no manifest, então na
		// prática sempre será uma KeyAction; o guard satisfaz o TypeScript
		// (setImage do jeito usado aqui não existe em DialAction).
		if (!settings.deviceId || !ev.action.isKey()) {
			return;
		}
		try {
			const global = await streamDeck.settings.getGlobalSettings<TuyaGlobalSettings>();
			const isOn = await this.readIsOn(global, settings);
			this.#draw(ev.action.id, ev.action, isOn);
		} catch (error) {
			// Não interrompe a UI por causa disso; só loga e deixa o ícone estático
			// do manifest. O usuário vai ver o erro de fato quando clicar (showAlert).
			logger.warn("Falha ao consultar estado inicial:", error);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<LightToggleSettings>): Promise<void> {
		const settings = ev.payload.settings;

		if (!settings.deviceId) {
			logger.warn("Botão pressionado sem deviceId configurado.");
			await ev.action.showAlert();
			return;
		}

		let currentlyOn: boolean | undefined;
		try {
			const global = await streamDeck.settings.getGlobalSettings<TuyaGlobalSettings>();
			const switchCode = settings.switchCode || DEFAULT_SWITCH_CODE;

			currentlyOn = await this.readIsOn(global, settings);
			const nextValue = !currentlyOn;

			// Desenha o novo estado otimisticamente (feedback tátil imediato), com um
			// pulso na cor de destino — só confirma de fato depois que o comando Tuya
			// responder; em caso de erro, reverte pro estado anterior.
			this.#draw(ev.action.id, ev.action, nextValue);
			await sendCommands(global, settings.deviceId, [{ code: switchCode, value: nextValue }]);
		} catch (error) {
			if (currentlyOn !== undefined) {
				this.#draw(ev.action.id, ev.action, currentlyOn, { skipPulse: true });
			}
			this.logAndAlert(ev.action, error);
		}
	}

	/** Desenha o card do estado atual — pulsa se mudou desde a última vez visto, senão desenha parado. */
	#draw(actionId: string, action: { setImage(image?: string): Promise<void> }, isOn: boolean, opts?: { skipPulse: boolean }): void {
		const previous = this.#lastOn.get(actionId);
		this.#lastOn.set(actionId, isOn);
		const model = cardFor(isOn);

		if (!opts?.skipPulse && previous !== undefined && previous !== isOn) {
			const accentColor = ACCENTS[model.accent];
			iconAnimator.pulse(actionId, action, (strength) =>
				renderCardIcon(model, strength > 0.01 ? { color: accentColor, strength } : undefined),
			);
			return;
		}
		iconAnimator.stop(actionId);
		safeSetImage(action, renderCardIcon(model));
	}

	private async readIsOn(global: TuyaGlobalSettings, settings: LightToggleSettings): Promise<boolean> {
		const switchCode = settings.switchCode || DEFAULT_SWITCH_CODE;
		const status = await getDeviceStatus(global, settings.deviceId as string);
		const item = status.find((s) => s.code === switchCode);
		return Boolean(item?.value);
	}

	private logAndAlert(action: { showAlert: () => Promise<void> }, error: unknown): void {
		if (error instanceof TuyaConfigError) {
			logger.error(error.message);
		} else if (error instanceof TuyaApiError) {
			logger.error(`Erro da Tuya API (code ${error.code ?? "?"}):`, error.message);
		} else {
			logger.error("Erro inesperado ao controlar a luz:", error);
		}
		void action.showAlert();
	}
}
