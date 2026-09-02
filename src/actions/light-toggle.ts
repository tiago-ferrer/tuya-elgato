import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { getDeviceStatus, sendCommands, TuyaApiError, TuyaConfigError, TuyaGlobalSettings } from "../tuya/cloud";

/** Settings salvas por instância do botão (uma luz por botão). */
export interface LightToggleSettings extends JsonObject {
	deviceId?: string;
	/** Code do DP de liga/desliga na Tuya. A maioria das luminárias usa "switch_led". */
	switchCode?: string;
}

const DEFAULT_SWITCH_CODE = "switch_led";

const logger = streamDeck.logger.createScope("LightToggle");

@action({ UUID: "dev.tferrer.tuya-elgato.light-toggle" })
export class LightToggleAction extends SingletonAction<LightToggleSettings> {
	/**
	 * Ao aparecer no Stream Deck, consulta o estado atual do dispositivo (se já
	 * configurado) para que o ícone reflita a realidade assim que o app abre,
	 * em vez de esperar o primeiro clique.
	 */
	override async onWillAppear(ev: WillAppearEvent<LightToggleSettings>): Promise<void> {
		const settings = ev.payload.settings;
		// Esta ação só declara Controllers: ["Keypad"] no manifest, então na
		// prática sempre será uma KeyAction; o guard satisfaz o TypeScript
		// (setState não existe em DialAction).
		if (!settings.deviceId || !ev.action.isKey()) {
			return;
		}
		try {
			const global = await streamDeck.settings.getGlobalSettings<TuyaGlobalSettings>();
			const isOn = await this.readIsOn(global, settings);
			await ev.action.setState(isOn ? 1 : 0);
		} catch (error) {
			// Não interrompe a UI por causa disso; só loga. O usuário vai ver o
			// erro de fato quando clicar (showAlert).
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

		try {
			const global = await streamDeck.settings.getGlobalSettings<TuyaGlobalSettings>();
			const switchCode = settings.switchCode || DEFAULT_SWITCH_CODE;

			const currentlyOn = await this.readIsOn(global, settings);
			const nextValue = !currentlyOn;

			await sendCommands(global, settings.deviceId, [{ code: switchCode, value: nextValue }]);
			await ev.action.setState(nextValue ? 1 : 0);
		} catch (error) {
			this.logAndAlert(ev.action, error);
		}
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
