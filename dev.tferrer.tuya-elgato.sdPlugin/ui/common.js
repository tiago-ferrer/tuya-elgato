/**
 * Helper mínimo de comunicação do Property Inspector com o plugin, usando o
 * protocolo clássico via WebSocket que o app Stream Deck injeta ao carregar
 * esta página (chamando `connectElgatoStreamDeckSocket`).
 *
 * Sem dependências externas de propósito: a Property Inspector deve abrir
 * mesmo sem internet.
 */
(function (global) {
	let websocket = null;
	let uuid = null;
	let actionInfo = null;

	const settingsListeners = [];
	const globalSettingsListeners = [];
	const pluginMessageListeners = [];

	function connectElgatoStreamDeckSocket(inPort, inUUID, inRegisterEvent, inInfo, inActionInfo) {
		uuid = inUUID;
		actionInfo = JSON.parse(inActionInfo);

		websocket = new WebSocket("ws://127.0.0.1:" + inPort);

		websocket.onopen = () => {
			websocket.send(JSON.stringify({ event: inRegisterEvent, uuid: inUUID }));
			websocket.send(JSON.stringify({ event: "getSettings", context: inUUID }));
			websocket.send(JSON.stringify({ event: "getGlobalSettings", context: inUUID }));
		};

		websocket.onmessage = (evt) => {
			let msg;
			try {
				msg = JSON.parse(evt.data);
			} catch (err) {
				return;
			}
			if (msg.event === "didReceiveSettings") {
				const settings = (msg.payload && msg.payload.settings) || {};
				settingsListeners.forEach((fn) => fn(settings));
			} else if (msg.event === "didReceiveGlobalSettings") {
				const settings = (msg.payload && msg.payload.settings) || {};
				globalSettingsListeners.forEach((fn) => fn(settings));
			} else if (msg.event === "sendToPropertyInspector") {
				pluginMessageListeners.forEach((fn) => fn(msg.payload || {}));
			}
		};
	}

	function setSettings(settings) {
		if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
		websocket.send(JSON.stringify({ event: "setSettings", context: uuid, payload: settings }));
	}

	function setGlobalSettings(settings) {
		if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
		websocket.send(JSON.stringify({ event: "setGlobalSettings", context: uuid, payload: settings }));
	}

	/** Envia uma mensagem arbitrária para o plugin (chega em `onSendToPlugin`). */
	function sendToPlugin(payload) {
		if (!websocket || websocket.readyState !== WebSocket.OPEN) return;
		websocket.send(JSON.stringify({ event: "sendToPlugin", action: actionInfo && actionInfo.action, context: uuid, payload }));
	}

	function onSettings(fn) {
		settingsListeners.push(fn);
	}

	function onGlobalSettings(fn) {
		globalSettingsListeners.push(fn);
	}

	/** Mensagens que o plugin envia de volta via `streamDeck.ui.sendToPropertyInspector`. */
	function onPluginMessage(fn) {
		pluginMessageListeners.push(fn);
	}

	// Exposto globalmente porque o app Stream Deck chama esta função pelo nome
	// diretamente na `window` ao carregar a página.
	global.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;

	global.TuyaPI = {
		setSettings,
		setGlobalSettings,
		sendToPlugin,
		onSettings,
		onGlobalSettings,
		onPluginMessage,
		getActionInfo: () => actionInfo
	};
})(window);
