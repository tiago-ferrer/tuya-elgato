import streamDeck from "@elgato/streamdeck";
import { CurtainControlAction } from "./actions/curtain-control";
import { LightToggleAction } from "./actions/light-toggle";
import { testConnection, TuyaApiError, TuyaConfigError, TuyaGlobalSettings } from "./tuya/cloud";

streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new LightToggleAction());
streamDeck.actions.registerAction(new CurtainControlAction());

/**
 * Handler único (não por ação) para o botão "Testar conexão" dos Property
 * Inspectors: tenta obter um access token da Tuya com as credenciais salvas
 * nas Global Settings e devolve o resultado pra UI mostrar.
 */
streamDeck.ui.onSendToPlugin<{ type?: string }, Record<string, never>>(async (ev) => {
	if (ev.payload?.type !== "testConnection") {
		return;
	}
	try {
		const global = await streamDeck.settings.getGlobalSettings<TuyaGlobalSettings>();
		await testConnection(global);
		await streamDeck.ui.sendToPropertyInspector({ type: "testConnectionResult", success: true });
	} catch (error) {
		let message: string;
		if (error instanceof TuyaConfigError) {
			message = error.message;
		} else if (error instanceof TuyaApiError) {
			message = `Erro da Tuya API (code ${error.code ?? "?"}): ${error.message}`;
		} else {
			message = error instanceof Error ? error.message : String(error);
		}
		await streamDeck.ui.sendToPropertyInspector({ type: "testConnectionResult", success: false, message });
	}
});

streamDeck.connect();
