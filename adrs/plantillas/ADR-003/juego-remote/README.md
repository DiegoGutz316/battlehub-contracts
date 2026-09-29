# Plantilla de microfrontend de juego (ADR-003)

Proyecto base para los **Equipos 4, 5 y 6**. Ya viene configurado como remote de Module Federation
y probado contra el Shell: se carga dentro del Shell y también corre solo para desarrollar.

## Cómo usarla

1. Copien **todo el contenido de esta carpeta** a la raíz del repo de su juego
   (`battlehub-game-typing`, `battlehub-game-trivia` o `battlehub-game-memory`), o a una subcarpeta
   `frontend/` si el repo también tiene la API .NET.
2. Reemplacen los valores de su equipo (tabla de abajo).
3. Instalen y prueben:

```bash
npm install
npm start      # juego solo, en su puerto (modo desarrollo con botones start/pause/dispose)
npm test       # lint + pruebas del contrato
npm run build  # genera dist/remoteEntry.js
```

## Valores que cada equipo cambia

| Dónde | Equipo 4 (Typing) | Equipo 5 (Trivia) | Equipo 6 (Memory) |
|---|---|---|---|
| `webpack.config.js` → `REMOTE_NAME` | `typingGame` | `triviaGame` | `memoryGame` |
| `webpack.config.js` → `PORT` | `4001` | `4002` | `4003` |
| `package.json` → `name` | `battlehub-game-typing` | `battlehub-game-trivia` | `battlehub-game-memory` |
| `src/game-module.ts` → `name` del `@customElement` | `typing-game-module` | `trivia-game-module` | `memory-game-module` |
| `src/my-app.html` → etiqueta del componente | `<typing-game-module>` | `<trivia-game-module>` | `<memory-game-module>` |
| `src/my-app.ts` y `test/` → `gameType` | `'typing'` | `'trivia'` | `'memory'` |
| Prefijo de clases CSS (`.html` y `.css`) | `typing-game` | `trivia-game` | `memory-game` |

## Qué archivo hace qué

| Archivo | Para qué | ¿Se modifica? |
|---|---|---|
| `mf-shared.js` | Versión exacta de Aurelia compartida con el Shell | **No** |
| `webpack.config.js` | Module Federation, CORS, puerto | Solo `REMOTE_NAME` y `PORT` |
| `src/main.ts` | Límite asíncrono obligatorio | **No** |
| `src/game-contracts.ts` | Tipos `GameContext` y `GameModule` del contrato | **No** |
| `src/game-module.ts` / `.html` / `.css` | **Su juego.** Implementa `initialize`, `start`, `pause`, `dispose` | **Sí, aquí va todo su juego** |
| `src/bootstrap.ts`, `src/my-app.*` | Modo desarrollo sin Shell (contexto de prueba) | Opcional |
| `test/game-module.spec.ts` | Pruebas del ciclo de vida | Agreguen las suyas |
| `.github/workflows/ci.yml` | CI con Node 24 | Agreguen el job .NET si aplica |
| `.nvmrc` | Node 24 | **No** |

## Reglas del contrato que la plantilla ya cumple

- Exporta `GameModule` desde `./GameModule` con los 4 métodos.
- `initialize()` rechaza la promesa si el contexto es inválido (el Shell lo muestra como `LIFECYCLE_ERROR`).
- `dispose()` detiene temporizadores (ahí también se desconecta el hub de SignalR).
- Estilos con prefijo del juego: no tocan el layout del Shell.

## Probarla dentro del Shell

Con su juego corriendo (`npm start`), el Shell lo carga si su `remotes.config.json` apunta a
`http://localhost:<PORT>/remoteEntry.js`. Pueden usar la prueba de concepto del Shell
([battlehub-shell/poc](https://github.com/KeynerMC/battlehub-shell/tree/main/poc)) cambiando
`poc/shell/config/remotes.local.json` y el `gameType` de `poc/shell/src/my-app.ts`.
