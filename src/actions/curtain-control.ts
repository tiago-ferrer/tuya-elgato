import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";
import { iconAnimator, safeSetImage } from "../lib/icon-animator";
import { renderCardIcon, type CardIconModel } from "../lib/icon-render";
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
	/**
	 * Quando o motor foi instalado ao contrário (abrir fisicamente fecha e vice-versa): o
	 * ícone/rótulo do botão continua mostrando o comando configurado (`command`), mas o
	 * valor de fato enviado à Tuya é o oposto — abrir↔fechar. Não afeta "parar".
	 */
	reverse?: boolean;
}

/** Comando de fato enviado à Tuya — inverte abrir↔fechar quando `reverse` está ligado; "parar" nunca inverte. */
function effectiveCommand(command: CurtainCommand, reverse: boolean | undefined): CurtainCommand {
	if (!reverse || command === "stop") return command;
	return command === "open" ? "close" : "open";
}

const DEFAULT_CODE = "control";
const DEFAULT_COMMAND: CurtainCommand = "open";

/**
 * Como a ação é uma única definida no manifest (com um único State estático),
 * o ícone real de cada botão é escolhido em runtime a partir do `command`
 * configurado no Property Inspector — desenhado como card dinâmico (mesmo
 * estilo do Light Toggle), não mais como GIF/PNG pré-renderado.
 */
const CARD_BY_COMMAND: Record<CurtainCommand, CardIconModel> = {
	open: { glyphId: "curtain-open", accent: "teal", label: "ABRIR" },
	close: { glyphId: "curtain-close", accent: "orange", label: "FECHAR" },
	stop: { glyphId: "curtain-stop", accent: "indigo", label: "PARAR" },
};

const logger = streamDeck.logger.createScope("CurtainControl");

@action({ UUID: "dev.tferrer.tuya-elgato.curtain-control" })
export class CurtainControlAction extends SingletonAction<CurtainControlSettings> {
	/** Ao aparecer, garante que o ícone reflita o comando já configurado no botão. */
	override async onWillAppear(ev: WillAppearEvent<CurtainControlSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		this.#draw(ev.action, ev.payload.settings.command);
	}

	/** Troca o ícone assim que o usuário muda o comando no Property Inspector. */
	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<CurtainControlSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		this.#draw(ev.action, ev.payload.settings.command);
	}

	override onWillDisappear(ev: WillDisappearEvent<CurtainControlSettings>): void {
		iconAnimator.stop(ev.action.id);
	}

	/** Redesenha o card do comando configurado, parado (sem animação — é reconfiguração, não uma ação em andamento). */
	#draw(action: { id: string; setImage(image?: string): Promise<void> }, command?: CurtainCommand): void {
		iconAnimator.stop(action.id);
		safeSetImage(action, renderCardIcon(CARD_BY_COMMAND[command || DEFAULT_COMMAND]));
	}

	override async onKeyDown(ev: KeyDownEvent<CurtainControlSettings>): Promise<void> {
		const settings = ev.payload.settings;

		if (!settings.deviceId) {
			logger.warn("Botão pressionado sem deviceId configurado.");
			await ev.action.showAlert();
			return;
		}

		const code = settings.code || DEFAULT_CODE;
		const command = settings.command || DEFAULT_COMMAND;
		const commandToSend = effectiveCommand(command, settings.reverse);

		try {
			const global = await streamDeck.settings.getGlobalSettings<TuyaGlobalSettings>();
			await sendCommands(global, settings.deviceId, [{ code, value: commandToSend }]);
			// Flash branco de confirmação sobre o card do comando, no lugar do showOk() padrão.
			// Usa o ícone do comando configurado (não do efetivo) — é o que o botão representa pro usuário.
			const model = CARD_BY_COMMAND[command];
			iconAnimator.pulse(ev.action.id, ev.action, (strength) =>
				renderCardIcon(model, strength > 0.01 ? { color: "#FFFFFF", strength: strength * 0.55 } : undefined),
			);
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
