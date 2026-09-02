# tuya-elgato

Plugin Elgato Stream Deck (`dev.tferrer.tuya-elgato`) para controlar luzes e cortinas Tuya via **Tuya Cloud API** — funciona mesmo com a máquina fora da rede local (VPN, 4G, etc.), já que não depende de controle local/LAN. Contexto completo da decisão de arquitetura em [PLANO.md](PLANO.md).

## Status

MVP funcional, ainda sem credenciais reais preenchidas:

- ✅ Scaffold do plugin (`@elgato/streamdeck` v2), build com esbuild, TypeScript sem erros.
- ✅ Cliente Tuya Cloud API implementado à mão (`src/tuya/cloud.ts`) — sem dependências externas (evita a vulnerabilidade conhecida do axios que vem fixada no SDK oficial `@tuya/tuya-connector-nodejs`).
- ✅ Ação **Light Toggle** — liga/desliga com ícone refletindo o estado.
- ✅ Ação **Curtain Control** — envia comando abrir/fechar/parar (uma ação, comando escolhido por botão no Property Inspector).
- ✅ Property Inspector com botão "Testar conexão" para validar Client ID/Secret/Região sem precisar apertar um botão físico.
- ✅ Plugin linkado e rodando no seu Stream Deck (v7.5.1) — visível como categoria **Tuya Home Control** na lista de ações.
- ⏳ Falta: você preencher as credenciais reais e os Device IDs (ver "Como configurar" abaixo).

## Estrutura

```
tuya-elgato/
├── PLANO.md                                # decisão de arquitetura (cloud vs. local vs. híbrido)
├── src/                                    # TypeScript, compilado para bin/plugin.js
│   ├── plugin.ts                           # entrypoint: registra ações + handler de "testar conexão"
│   ├── tuya/cloud.ts                       # cliente Tuya Cloud API (assinatura HMAC, token, commands/status)
│   └── actions/
│       ├── light-toggle.ts
│       └── curtain-control.ts
└── dev.tferrer.tuya-elgato.sdPlugin/       # o que o Stream Deck de fato carrega
    ├── manifest.json
    ├── bin/plugin.js                       # gerado por `npm run build` (git-ignored)
    ├── imgs/                               # ícones das ações — teclas de luz e cortina são GIFs animados
    └── ui/
        ├── common.js                       # protocolo WebSocket do Property Inspector
        ├── pi.css
        ├── light-inspector.html
        └── curtain-inspector.html
```

## Como configurar (passo a passo)

1. **Criar Cloud Project na Tuya** ([iot.tuya.com](https://iot.tuya.com/)) → anotar `Client ID` e `Client Secret`, e a região do data center escolhida. **Para o Brasil**: contas Smart Life/Tuya Smart criadas antes de 25/11/2025 ficam no data center **Western America** (`openapi.tuyaus.com`); contas mais novas ficam no **Eastern America** (`openapi-ueaz.tuyaus.com`) — a Tuya não migrou contas antigas automaticamente. O passo "Link Tuya App Account" (item 2 abaixo) confirma/expõe qual é o certo; se errar, é só recriar o Cloud Project no outro data center.
2. **Vincular sua conta Smart Life/Tuya Smart** ao projeto (QR code na aba "Devices" → "Link Tuya App Account").
3. **Achar os Device IDs**: aba "Devices" do Cloud Project lista os dispositivos vinculados com seus IDs. A aba **Debug Device** de cada um mostra os `codes` reais de comando (ex.: confirmar se sua luz usa `switch_led` e seu motor de cortina usa `control` com valores `open/close/stop`, ou outro code — varia por fabricante).
4. No app Stream Deck, arraste a ação **Light Toggle** ou **Curtain Control** (categoria "Tuya Home Control") para um botão.
5. No Property Inspector do botão, preencha Client ID / Client Secret / Região (é compartilhado entre todos os botões — só precisa preencher uma vez) e clique **Testar conexão**.
6. Preencha o Device ID (e o comando, no caso da cortina) daquele botão específico.

## Desenvolvimento

```bash
npm install       # instala dependências
npm run typecheck # valida TypeScript
npm run build      # gera dev.tferrer.tuya-elgato.sdPlugin/bin/plugin.js
npm run watch      # rebuild automático a cada alteração
```

Após alterar o código, rode `npm run build` e reinicie o plugin no Stream Deck:

```bash
npx @elgato/cli restart dev.tferrer.tuya-elgato
```

O plugin já está linkado (`npx @elgato/cli link dev.tferrer.tuya-elgato.sdPlugin`) — isso cria um symlink em `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`, então editar o código neste repo já reflete no Stream Deck após rebuild + restart.

## Ícones animados (GIF)

As teclas de **Light Toggle** (`key-on.gif`/`key-off.gif`) e **Curtain Control** (`key-open.gif`/`key-close.gif`/`key-stop.gif`) usam GIFs animados de 144×144px em vez de PNG estático:

- Light Toggle declara os dois GIFs diretamente nos `States` do `manifest.json` (estado 0/1, alternado por `setState`).
- Curtain Control é uma única ação com um só `State` no manifest (o comando — abrir/fechar/parar — é escolhido por botão no Property Inspector), então o GIF certo é aplicado em runtime via `action.setImage(...)` em `onWillAppear`/`onDidReceiveSettings` (ver `src/actions/curtain-control.ts`).

Para trocar os ícones no futuro, basta substituir os arquivos em `dev.tferrer.tuya-elgato.sdPlugin/imgs/actions/*/key-*.gif` (mesmo nome/tamanho) e reiniciar o plugin — não precisa mexer no manifest nem no código.

## Observação

Notei que você já tem o plugin de terceiros `de.perdoctus.streamdeck.homeassistant` instalado no seu Stream Deck. Se seus dispositivos Tuya já estiverem integrados ao Home Assistant, vale considerar usar esse caminho em vez de (ou além) deste plugin — evitaria duplicar a camada de autenticação com a Tuya. Fica a critério seu; este plugin continua sendo a opção mais direta (sem depender de você manter um Home Assistant rodando).
