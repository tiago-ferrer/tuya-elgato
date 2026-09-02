# Plano: Plugin Elgato Stream Deck para controle de dispositivos Tuya

## Resposta direta: precisa de servidor remoto?

**Não precisa hospedar/manter um servidor remoto próprio de qualquer forma** — mas o requisito de funcionar **mesmo com a máquina em VPN / fora da rede de casa** muda qual dos dois caminhos "sem servidor próprio" usar como principal.

- **Controle local (LAN)** depende de broadcast/multicast UDP e de conseguir alcançar o IP `192.168.x.x` do dispositivo. Isso **não atravessa VPN de forma confiável**: broadcast/multicast normalmente não é roteado por túneis, e mesmo unicast falha se a rota padrão da máquina sair pelo túnel (a não ser que a VPN faça split-tunneling preservando a LAN local — não é garantido, e não é algo pra depender).
- **Tuya Cloud API** é HTTPS normal para os servidores da Tuya (`openapi.tuyaus.com`/`tuyaeu.com`/etc.). Enquanto a máquina tiver saída de internet — mesmo dentro de uma VPN — essa chamada funciona, porque não depende da rede local dos dispositivos.

**Conclusão: usar a Cloud API da Tuya como caminho principal**, não mais como fallback ocasional. Ainda assim, isso continua sendo "sem servidor remoto seu" — é o plugin local do Stream Deck chamando diretamente a nuvem que já existe e é operada pela Tuya.

| Abordagem | Servidor próprio? | Funciona em VPN/fora de casa? | Latência | Complexidade |
|---|---|---|---|---|
| **Cloud API (Tuya) — recomendado** | Não (usa a nuvem da Tuya) | **Sim** | Média (~200-800ms) | Baixa-média (setup do projeto Tuya) |
| Controle local (LAN) via `local_key` | Não | Não (quebra fora da LAN/VPN) | Baixa (~10-50ms) | Média |
| Híbrido (tenta local, cai pra cloud) | Não | Sim | Baixa quando em casa, média fora | Alta (mais um caso a manter) |

Um híbrido "tenta local primeiro, cai pra cloud" é possível depois, como otimização de latência quando a máquina está mesmo em casa — mas não é necessário pro requisito atual e adiciona complexidade (detectar se está na mesma rede, timeouts, etc.). Recomendo **começar só com Cloud API** e revisitar o híbrido depois se a latência incomodar no dia a dia.

---

## 1. Arquitetura do plugin (Elgato Stream Deck)

- SDK oficial: [`@elgato/streamdeck`](https://www.npmjs.com/package/@elgato/streamdeck) (Node.js/TypeScript). O Stream Deck app se comunica com o plugin via WebSocket local — tudo roda na máquina do usuário.
- Estrutura padrão de um plugin `.sdPlugin`:
  - `manifest.json` — metadados, ações (Actions), ícones, plataformas suportadas (mac/win).
  - `bin/plugin.js` (compilado do TS) — lógica principal.
  - `ui/` — **Property Inspector** (HTML/CSS/JS) exibido no configurador de cada botão, para escolher o dispositivo Tuya, o tipo de ação (abrir/fechar/parar cortina, ligar/desligar luz, toggle, definir brilho) e credenciais.
- Ações a implementar:
  1. **Light Toggle** — liga/desliga uma luz (estado refletido no ícone: aceso/apagado).
  2. **Light Dial/Brightness** (opcional, para Stream Deck +) — ajusta brilho.
  3. **Curtain Open/Close/Stop** — 3 ações distintas ou uma ação com 3 estados (curto/duplo clique ou dial).
  4. **Device Status Poller** — atualiza o ícone do botão conforme o estado real do dispositivo (polling local ou pulsar/websocket).

## 2. Integração com Tuya

### 2.1 Setup único (uma vez, feito por você/usuário)
1. Criar conta no [Tuya IoT Platform](https://iot.tuya.com/).
2. Criar um **Cloud Project** (Smart Home PaaS), anotar `Client ID` e `Client Secret`.
3. Vincular a conta do app **Smart Life / Tuya Smart** (QR code) para autorizar acesso aos dispositivos já pareados.
4. Assinatura: como agora a Cloud API é o caminho **principal** (usada a cada clique no Stream Deck, não só ocasionalmente), vale checar o volume de chamadas coberto pelo tier gratuito/trial do projeto. Uso pessoal (alguns comandos por dia) normalmente cabe folgado no tier básico, mas confirme os limites do plano ao criar o projeto — se estourar, o plano pago "Flexible" é cobrado por uso e costuma ser barato para esse volume.
5. Consultar via Cloud API (`/v1.0/devices/{device_id}`) o `device_id` de cada dispositivo (luzes e motores de cortina) e os **DPs** (Data Points) que cada um expõe — via aba "Debug Device" do IoT Platform, que já mostra os comandos disponíveis (liga/desliga, abrir/fechar/parar) sem precisar adivinhar.

### 2.2 Controle no dia a dia (runtime do plugin)
- Chamadas HTTPS diretas à **Tuya Cloud API** (`/v1.0/devices/{device_id}/commands`), usando o SDK oficial `@tuya/tuya-connector-nodejs` (cuida de assinatura HMAC das requisições, renovação de token, etc.) — evita reimplementar a autenticação da Tuya na mão.
- Cada ação do Stream Deck chama a API, ex.: `POST /v1.0/devices/{id}/commands` com `{ commands: [{ code: 'switch_led', value: true }] }` para ligar luz, ou código específico do motor de cortina (`control: open/close/stop` — varia por modelo, confirmado no passo 2.1.5).
- **Leitura de estado**: `GET /v1.0/devices/{id}/status` para saber se a luz está ligada / cortina aberta, e refletir isso no ícone do botão.
- Latência típica de 200–800ms por comando (rede + Tuya Cloud) — perceptível mas aceitável para um botão físico; se incomodar, dá pra revisitar controle local como otimização quando a máquina estiver comprovadamente na mesma LAN (fase futura, opcional).

### 2.3 Atualização de estado em tempo real (opcional, fase futura)
- Em vez de fazer polling do `GET /status`, a Tuya oferece um serviço de mensageria (Pulsar-based Cloud Development / Message Service) que envia push quando o estado de um dispositivo muda — funciona pela nuvem, então também não depende de LAN. Fica como melhoria depois do MVP; no início, polling simples a cada N segundos (ou só ao focar a página do Stream Deck) resolve.

## 3. Stack técnica sugerida

- **Linguagem**: TypeScript
- **SDK**: `@elgato/streamdeck`
- **Tuya**: `@tuya/tuya-connector-nodejs` (SDK oficial da Cloud API — assinatura de requisições, tokens, endpoints regionais)
- **Build**: `esbuild`/`rollup` (o CLI do Elgato já traz template com Rollup)
- **CLI de scaffolding**: `@elgato/cli` (`streamdeck create`)

## 4. Estrutura de projeto proposta

```
tuya-elgato/
├── com.<voce>.tuya.sdPlugin/
│   ├── manifest.json
│   ├── bin/plugin.js          (compilado)
│   ├── imgs/                  (ícones das ações e estados)
│   └── ui/
│       ├── light-inspector.html
│       └── curtain-inspector.html
├── src/
│   ├── plugin.ts               (entrypoint, registra ações)
│   ├── actions/
│   │   ├── light-toggle.ts
│   │   ├── curtain-control.ts
│   │   └── device-status.ts
│   ├── tuya/
│   │   ├── cloud.ts            (wrapper @tuya/tuya-connector-nodejs, auth/token)
│   │   ├── commands.ts         (envio de comandos por device_id + code)
│   │   └── devices.ts          (mapeamento nome -> device_id/codes)
│   └── config/
│       └── devices.json        (ou armazenado via settings do Stream Deck, criptografado)
├── package.json
├── rollup.config.mjs
└── PLANO.md
```

## 5. Roadmap (fases)

1. **Fase 0 – Setup Tuya**: criar projeto no IoT Platform, vincular app, identificar `device_id` e os `codes`/DPs de comando (via "Debug Device") de 1 luz + 1 motor de cortina para testar.
2. **Fase 1 – MVP**: scaffold do plugin com `streamdeck create`, uma ação "Light Toggle" hardcoded chamando a Cloud API (`@tuya/tuya-connector-nodejs`) — testar explicitamente com a máquina fora da rede de casa (ex.: em VPN ou 4G) pra validar o requisito.
3. **Fase 2 – Cortina**: ação de abrir/fechar/parar, mapear `codes` corretos do motor.
4. **Fase 3 – Property Inspector**: UI para selecionar dispositivo (lista dinâmica vinda de `devices.json` ou de `GET /v1.0/users/{uid}/devices`) sem precisar editar código a cada dispositivo novo.
5. **Fase 4 – Estado em tempo real**: polling via Cloud API a cada N segundos (ou ao abrir a página do Stream Deck) para refletir estado real no ícone (luz ligada = ícone aceso, cortina aberta/fechada/parcial). Avaliar mensageria Pulsar depois, se polling gerar muitas chamadas.
6. **Fase 5 – Robustez**: tratamento de erro/retry em falha de rede, renovação de token, rate limiting do lado do plugin (evitar estourar cota da Tuya em cliques repetidos).
7. **Fase 6 – Empacotamento/distribuição**: gerar `.streamDeckPlugin`, testar em macOS (e Windows se relevante), documentar instalação.

## 6. Riscos e pontos de atenção

- **Codes/DPs variam por fabricante/modelo** de motor de cortina — nem todo motor usa o mesmo `code` para abrir/fechar/parar; inspecionar via aba "Debug Device" do Tuya IoT Platform antes de codar a ação.
- **Custo/cota da Cloud API**: agora é o caminho usado a cada clique, não mais ocasional — confirmar o limite de chamadas do tier do projeto (trial/gratuito costuma bastar para uso pessoal, mas vale monitorar; planos "Flexible" pagos são baratos por chamada se precisar).
- **Dependência de internet**: sem Cloud API não há controle — se a internet cair (em casa ou onde a máquina estiver), o plugin para de funcionar. É a troca aceita pelo requisito de funcionar em VPN/fora de casa.
- **Latência perceptível**: 200-800ms por comando é normal em chamada de nuvem; se isso incomodar no uso do dia a dia dentro de casa, o híbrido (tentar local primeiro) pode ser revisitado como otimização futura, não como requisito inicial.
- **Renovação de token**: a Cloud API usa token de acesso com expiração curta — o SDK oficial (`@tuya/tuya-connector-nodejs`) já cuida disso, mas vale testar o comportamento em uso prolongado (token expirado no meio de uma sessão).
- **Segurança**: `Client ID`/`Client Secret` do projeto Tuya dão acesso à conta — armazenar nas settings do Stream Deck (isoladas por plugin) e nunca versionar em texto puro (adicionar `devices.json`/credenciais ao `.gitignore`).
- **Multi-plataforma**: Stream Deck roda em macOS e Windows — chamadas HTTPS puras funcionam igual nos dois, então não há dependência de SO aqui (diferente do controle local, que dependeria de rede local em cada máquina).

## 7. Próximos passos imediatos

1. Confirmar quais dispositivos Tuya você tem (marca/modelo do motor de cortina e das luzes) — isso muda os `codes`/DPs disponíveis.
2. Criar conta e Cloud Project no Tuya IoT Platform e vincular o app Smart Life/Tuya Smart.
3. Usar a aba "Debug Device" do IoT Platform para inspecionar os `codes` de comando de um dispositivo de cada tipo (luz e cortina) e anotar os `device_id`.
4. Fazer scaffold do plugin (`npx @elgato/cli create`), instalar `@tuya/tuya-connector-nodejs` e validar o primeiro toggle de luz via Cloud API — testando explicitamente com a máquina fora da rede de casa antes de seguir.
