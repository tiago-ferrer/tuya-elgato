/**
 * Cliente mínimo para a Tuya Cloud API (sem dependências externas).
 *
 * Implementado à mão (em vez de usar o SDK oficial `@tuya/tuya-connector-nodejs`)
 * porque, no momento em que este plugin foi criado, esse pacote fixava uma versão
 * do `axios` com vulnerabilidades conhecidas (CVEs de SSRF/CSRF) sem fix disponível.
 * Usamos apenas `fetch` (nativo do Node 20+) e o módulo `crypto` embutido.
 *
 * Deliberadamente usa a Cloud API (HTTPS para os servidores da Tuya) em vez de
 * controle local (LAN/local_key): assim o plugin funciona mesmo com a máquina
 * fora da rede de casa (ex.: em VPN). Ver PLANO.md para a justificativa completa.
 */
import type { JsonObject } from "@elgato/utils";
import { createHash, createHmac } from "node:crypto";

export type TuyaRegion = "us-west" | "us-east" | "eu" | "eu-west" | "cn" | "in";

/** Credenciais e região configuradas nas Global Settings do plugin. */
export interface TuyaGlobalSettings extends JsonObject {
	clientId?: string;
	clientSecret?: string;
	region?: TuyaRegion;
}

// Referência: https://github.com/tuya/tuya-home-assistant/wiki/Correspondence-table-of-regions-and-data-centers
// Brasil: contas Smart Life/Tuya Smart criadas antes de 25/11/2025 caem em
// "us-west" (Western America); a partir dessa data, novas contas caem em
// "us-east" (Eastern America). Não dá para saber sem checar no Tuya IoT
// Platform ao vincular a conta — por isso expomos as duas opções.
const REGION_HOSTS: Record<TuyaRegion, string> = {
	"us-west": "https://openapi.tuyaus.com",
	"us-east": "https://openapi-ueaz.tuyaus.com",
	eu: "https://openapi.tuyaeu.com",
	"eu-west": "https://openapi-weaz.tuyaeu.com",
	cn: "https://openapi.tuyacn.com",
	in: "https://openapi.tuyain.com"
};

interface TuyaTokenResult {
	access_token: string;
	expire_time: number;
	refresh_token: string;
	uid: string;
}

interface TuyaApiResponse<T> {
	success: boolean;
	code?: number;
	msg?: string;
	result?: T;
}

interface CachedToken {
	accessToken: string;
	/** epoch ms em que o token deve ser considerado expirado. */
	expiresAt: number;
}

/** Erro de configuração (credenciais ausentes/incompletas). */
export class TuyaConfigError extends Error {}

/** Erro retornado pela Tuya Cloud API. */
export class TuyaApiError extends Error {
	constructor(
		message: string,
		public readonly code?: number
	) {
		super(message);
		this.name = "TuyaApiError";
	}
}

// Cache de token em memória do processo do plugin. Reaproveitado entre ações/botões
// para não gerar um token novo a cada clique (a Tuya limita a frequência de emissão).
let cachedToken: CachedToken | undefined;
let inFlightTokenRequest: Promise<string> | undefined;

/** Zera o cache de token e força uma nova autenticação na próxima chamada. */
export function resetTokenCache(): void {
	cachedToken = undefined;
	inFlightTokenRequest = undefined;
}

function requireConfig(settings: TuyaGlobalSettings): { host: string; clientId: string; clientSecret: string } {
	const { clientId, clientSecret, region } = settings;
	if (!clientId || !clientSecret) {
		throw new TuyaConfigError(
			"Credenciais da Tuya não configuradas. Abra o Property Inspector de qualquer botão e preencha Client ID / Client Secret / Região."
		);
	}
	return { host: REGION_HOSTS[region ?? "us-west"], clientId, clientSecret };
}

function sha256Hex(input: string): string {
	return createHash("sha256").update(input, "utf8").digest("hex");
}

function hmacSha256HexUpper(input: string, key: string): string {
	return createHmac("sha256", key).update(input, "utf8").digest("hex").toUpperCase();
}

/** Monta o `stringToSign` conforme o esquema de assinatura 2.0 da Tuya. */
function buildStringToSign(method: "GET" | "POST", pathWithQuery: string, body: string): string {
	const contentHash = sha256Hex(body);
	// Headers assinados: nenhum além dos obrigatórios -> terceira linha vazia.
	return [method, contentHash, "", pathWithQuery].join("\n");
}

function sign(clientId: string, clientSecret: string, accessToken: string | undefined, t: string, stringToSign: string): string {
	const base = clientId + (accessToken ?? "") + t + stringToSign;
	return hmacSha256HexUpper(base, clientSecret);
}

async function fetchNewAccessToken(settings: TuyaGlobalSettings): Promise<string> {
	const { host, clientId, clientSecret } = requireConfig(settings);
	const t = Date.now().toString();
	const path = "/v1.0/token?grant_type=1";
	const stringToSign = buildStringToSign("GET", path, "");
	const signature = sign(clientId, clientSecret, undefined, t, stringToSign);

	const res = await fetch(host + path, {
		method: "GET",
		headers: {
			client_id: clientId,
			sign: signature,
			t,
			sign_method: "HMAC-SHA256"
		}
	});

	const json = (await res.json()) as TuyaApiResponse<TuyaTokenResult>;
	if (!res.ok || !json.success || !json.result) {
		throw new TuyaApiError(`Falha ao obter token da Tuya: ${json.msg ?? res.statusText}`, json.code);
	}

	cachedToken = {
		accessToken: json.result.access_token,
		// Renova um pouco antes do vencimento real, por segurança.
		expiresAt: Date.now() + Math.max(json.result.expire_time - 120, 30) * 1000
	};
	return cachedToken.accessToken;
}

async function getAccessToken(settings: TuyaGlobalSettings): Promise<string> {
	if (cachedToken && cachedToken.expiresAt > Date.now()) {
		return cachedToken.accessToken;
	}
	// Evita disparar múltiplas renovações em paralelo se vários botões forem
	// pressionados quase ao mesmo tempo.
	if (!inFlightTokenRequest) {
		inFlightTokenRequest = fetchNewAccessToken(settings).finally(() => {
			inFlightTokenRequest = undefined;
		});
	}
	return inFlightTokenRequest;
}

async function request<T>(settings: TuyaGlobalSettings, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
	const { host, clientId, clientSecret } = requireConfig(settings);
	const accessToken = await getAccessToken(settings);
	const t = Date.now().toString();
	const bodyStr = body !== undefined ? JSON.stringify(body) : "";
	const stringToSign = buildStringToSign(method, path, bodyStr);
	const signature = sign(clientId, clientSecret, accessToken, t, stringToSign);

	const res = await fetch(host + path, {
		method,
		headers: {
			client_id: clientId,
			access_token: accessToken,
			sign: signature,
			t,
			sign_method: "HMAC-SHA256",
			...(body !== undefined ? { "Content-Type": "application/json" } : {})
		},
		body: body !== undefined ? bodyStr : undefined
	});

	const json = (await res.json()) as TuyaApiResponse<T>;
	if (!res.ok || !json.success) {
		// Códigos de token inválido/expirado do lado da Tuya: descarta o cache
		// para forçar re-autenticação na próxima tentativa.
		if (json.code === 1010 || json.code === 1011) {
			resetTokenCache();
		}
		throw new TuyaApiError(`Tuya API respondeu com erro: ${json.msg ?? res.statusText}`, json.code);
	}
	return json.result as T;
}

/**
 * Testa as credenciais/região configuradas tentando obter um access token
 * novo. Usado pelo botão "Testar conexão" do Property Inspector. Lança
 * `TuyaConfigError`/`TuyaApiError` em caso de falha.
 */
export async function testConnection(settings: TuyaGlobalSettings): Promise<void> {
	resetTokenCache();
	await fetchNewAccessToken(settings);
}

export interface TuyaDeviceStatusItem {
	code: string;
	value: boolean | number | string;
}

export interface TuyaCommand {
	code: string;
	value: boolean | number | string;
}

/** Consulta o estado atual (DPs) de um dispositivo. */
export async function getDeviceStatus(settings: TuyaGlobalSettings, deviceId: string): Promise<TuyaDeviceStatusItem[]> {
	return request<TuyaDeviceStatusItem[]>(settings, "GET", `/v1.0/devices/${encodeURIComponent(deviceId)}/status`);
}

/** Envia um ou mais comandos (DPs) para um dispositivo. */
export async function sendCommands(settings: TuyaGlobalSettings, deviceId: string, commands: TuyaCommand[]): Promise<void> {
	await request<unknown>(settings, "POST", `/v1.0/devices/${encodeURIComponent(deviceId)}/commands`, { commands });
}
