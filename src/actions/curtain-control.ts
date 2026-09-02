import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { sendCommands, TuyaApiError, TuyaConfigError, TuyaGlobalSettings } from "../tuya/cloud";

export type CurtainCommand = "open" | "close" | "stop";

/**
 * Uma única ação reutilizável para cortina: cada botão configura, via
 * Property Inspector, qual dispositivo controla e qual comando envia
 * (abrir / fechar / parar). Assim dá pra criar 3 botões (um por comando)
 * sem precisar de 3 ações distintas no manifest.
 */
export interface CurtainControlSettings extends JsonObject {
	deviceId?: string;
	command?: CurtainCommand;
	/** Code do DP de controle na Tuya. A maioria dos motores usa "control". */
	code?: string;
}

const DEFAULT_CODE = "control";
const DEFAULT_COMMAND: CurtainCommand = "open";

const logger = streamDeck.logger.createScope("CurtainControl");

@action({ UUID: "dev.tferrer.tuya-elgato.curtain-control" })
export class CurtainControlAction extends SingletonAction<CurtainControlSettings> {
	override async onKeyDown(ev: KeyDownEvent<CurtainControlSettings>): Promise<void> {
		const settings = ev.payload.settings;

		if (!settings.deviceId) {
			logger.warn("Botão pressionado sem deviceId configurado.");
			await ev.action.showAlert();
			return;
		}

		const code = settings.code || DEFAULT_CODE;
		const command = settings.command || DEFAULT_COMMAND;

		try {
			const global = await streamDeck.settings.getGlobalSettings<TuyaGlobalSettings>();
			await sendCommands(global, settings.deviceId, [{ code, value: command }]);
			await ev.action.showOk();
		} catch (error) {
			if (error instanceof TuyaConfigError) {
				logger.error(error.message);
			} else if (error instanceof TuyaApiError) {
				logger.error(`Erro da Tuya API (code ${error.code ?? "?"}):`, error.message);
			} else {
				logger.error("Erro inesperado ao controlar a cortina:", error);
			}
			await ev.action.showAlert();
		}
	}
}
