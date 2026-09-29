# ADR-003: Integración de microfrontends con Module Federation (Webpack 5) en Aurelia 2

- **Estado**: Propuesto
- **Fecha**: 2026-09-28
- **Equipo/Autor**: Equipo 3 - Shell Application (Grupo 1)

## Contexto

### Problema

El documento `02-arquitectura-y-flujo.md` establece que el Shell (Equipo 3) debe cargar dinámicamente los microfrontends de los juegos (Typing, Trivia y Memory), todos construidos en **Aurelia**, usando **Module Federation**. El mismo documento deja como pendiente, a resolver con un ADR, los "detalles finos de la integración de Module Federation con Aurelia".

Sin una convención común, cada equipo de juego configuraría su remote de forma distinta (nombres, módulos expuestos, puertos, versiones de Aurelia y de Node), y el Shell no podría cargarlos de forma uniforme. Por eso esta decisión define tanto la herramienta como el contrato técnico de integración.

### Restricciones existentes en `battlehub-contracts`

- Frontend único: Aurelia en el Shell y en los tres microfrontends. No se permite mezclar otros frameworks.
- Cada microfrontend debe exponer un módulo que implemente la interfaz `GameModule` (`initialize`, `start`, `pause`, `dispose`), definida en `03-contratos-tecnicos.md`.
- El Shell entrega a cada juego el contexto `{ matchId, gameType, currentUser }`.
- El Shell es dueño del layout. Los juegos solo renderizan dentro del área asignada y no pueden alterar la navegación, el login ni el header/footer.
- El despliegue es manual en esta etapa, por lo que las URLs de los juegos pueden variar entre ambientes.

### Situación de las versiones

- Al momento de este ADR, la etiqueta `latest` del paquete `aurelia` en npm apunta a **`2.0.0-rc.2`**. No existe todavía una versión `2.0.0` estable publicada, por lo que usar rangos como `^2.0.0` no resuelve a ninguna versión.
- `aurelia@2.0.0-rc.2` exige Node `>=20.16.0`.
- Node 20 llegó al fin de su soporte en abril de 2026. La versión LTS activa es **Node 24**.

## Decisión

Se usará **Webpack 5 con su `ModuleFederationPlugin` nativo** para integrar el Shell (host) con los tres microfrontends de juego (remotes), todos en **Aurelia 2**, bajo las siguientes convenciones obligatorias.

### 1. Versiones obligatorias

| Herramienta | Versión | Cómo se fija |
|---|---|---|
| Node.js | **24 LTS** (`>=24.11.0 <25`) | Campo `engines` del `package.json`, archivo `.nvmrc` con `24` y `node-version: "24"` en el pipeline de CI |
| `aurelia` y todos los `@aurelia/*` | **`2.0.0-rc.2` exacta** | Sin `^` ni `~` en el `package.json` (`"aurelia": "2.0.0-rc.2"`) |
| Webpack | `5.x` | `webpack@^5` |

- Cualquier cambio de versión de Aurelia o de Node (por ejemplo, cuando se publique Aurelia `2.0.0` estable) se hará en los cuatro proyectos al mismo tiempo, mediante un nuevo ADR o una actualización de este.
- Esta decisión actualiza la versión de Node del esqueleto de pipeline de frontend de `05-cicd-testing-commits.md` (de `20` a `24`).

### 2. Nombres de los remotes y módulo expuesto

| Equipo | Nombre del remote (`name`) | Módulo expuesto | Puerto local |
|---|---|---|---|
| Equipo 3 (Shell, host) | `shell` | — | `4000` |
| Equipo 4 (Typing) | `typingGame` | `./GameModule` | `4001` |
| Equipo 5 (Trivia) | `triviaGame` | `./GameModule` | `4002` |
| Equipo 6 (Memory) | `memoryGame` | `./GameModule` | `4003` |

- Cada remote publica su punto de entrada como `remoteEntry.js`, en la raíz de su servidor. Ejemplo: `http://localhost:4001/remoteEntry.js`.
- El módulo `./GameModule` debe exportar, con el nombre `GameModule`, un componente de Aurelia 2 que implemente la interfaz `GameModule` de `03-contratos-tecnicos.md`.
- El punto de entrada de cada proyecto (`main.ts`) debe usar un límite asíncrono (`import('./bootstrap')`) para que Module Federation pueda resolver las dependencias compartidas antes de iniciar Aurelia.

### 3. Dependencias compartidas

Todos los proyectos declaran como `shared` el paquete `aurelia` y los paquetes `@aurelia/*` que usen, con `singleton: true`, `strictVersion: true` y la versión exacta. Así se garantiza una sola instancia del framework, y un desfase de versión se detecta de inmediato en lugar de fallar de forma silenciosa.

```javascript
// mf-shared.js (idéntico en los cuatro proyectos)
const AURELIA_VERSION = '2.0.0-rc.2';
const pkgs = [
  'aurelia', '@aurelia/kernel', '@aurelia/metadata', '@aurelia/platform',
  '@aurelia/platform-browser', '@aurelia/expression-parser',
  '@aurelia/template-compiler', '@aurelia/runtime', '@aurelia/runtime-html',
  // Agregar aquí cualquier otro @aurelia/* que se use (router, fetch-client, validation...).
];
module.exports = Object.fromEntries(pkgs.map(p => [p, {
  singleton: true, strictVersion: true, requiredVersion: AURELIA_VERSION,
}]));
```

Configuración de un remote (ejemplo del Equipo 5):

```javascript
new ModuleFederationPlugin({
  name: 'triviaGame',
  filename: 'remoteEntry.js',
  exposes: { './GameModule': './src/game-module' },
  shared: require('./mf-shared'),
});
```

Configuración del Shell. No declara `remotes` fijos, porque los carga en tiempo de ejecución (ver sección 4):

```javascript
new ModuleFederationPlugin({
  name: 'shell',
  shared: require('./mf-shared'),
});
```

#### Plantilla para los Equipos 4, 5 y 6 (copiar y pegar)

La plantilla completa y probada está en [`adrs/plantillas/ADR-003/juego-remote/`](plantillas/ADR-003/juego-remote/). Se puede copiar la carpeta entera al repo del juego, o seguir estos pasos sobre un proyecto nuevo. Fue probada cargándose dentro del Shell y también sola en modo desarrollo (sección 9).

**Paso 1. Generar el proyecto base de Aurelia con Webpack:**

```bash
npx makes aurelia battlehub-game-trivia -s app,latest,webpack,typescript,css,jest,app-min
cd battlehub-game-trivia
```

**Paso 2. Valores de cada equipo.** Son los únicos que cambian entre los tres juegos:

| Dónde | Equipo 4 (Typing) | Equipo 5 (Trivia) | Equipo 6 (Memory) |
|---|---|---|---|
| `webpack.config.js` → `REMOTE_NAME` | `typingGame` | `triviaGame` | `memoryGame` |
| `webpack.config.js` → `PORT` | `4001` | `4002` | `4003` |
| `@customElement` en `src/game-module.ts` | `typing-game-module` | `trivia-game-module` | `memory-game-module` |
| `gameType` del contexto | `'typing'` | `'trivia'` | `'memory'` |
| Prefijo de clases CSS | `typing-game` | `trivia-game` | `memory-game` |

**Paso 3. `package.json`:** reemplazar `"latest"` por la versión exacta en todos los paquetes de Aurelia y agregar `engines`:

```json
{
  "engines": { "node": ">=24.11.0 <25" },
  "dependencies": {
    "aurelia": "2.0.0-rc.2"
  },
  "devDependencies": {
    "@aurelia/testing": "2.0.0-rc.2",
    "@aurelia/ts-jest": "2.0.0-rc.2",
    "@aurelia/webpack-loader": "2.0.0-rc.2"
  }
}
```

**Paso 4. `.nvmrc`** (archivo nuevo en la raíz):

```text
24
```

**Paso 5. `mf-shared.js`** (archivo nuevo en la raíz, idéntico en los cuatro proyectos):

```javascript
// ADR-003 §3 — Dependencias compartidas. Este archivo es IDÉNTICO en el Shell y en los 3 juegos: no lo modifiquen.
// Si usan otro paquete @aurelia/* (router, fetch-client, validation...), agréguenlo a la lista y avisen al Equipo 3.
const AURELIA_VERSION = '2.0.0-rc.2';
const pkgs = [
  'aurelia',
  '@aurelia/kernel',
  '@aurelia/metadata',
  '@aurelia/platform',
  '@aurelia/platform-browser',
  '@aurelia/expression-parser',
  '@aurelia/template-compiler',
  '@aurelia/runtime',
  '@aurelia/runtime-html',
];
module.exports = Object.fromEntries(pkgs.map(p => [p, {
  singleton: true,
  strictVersion: true,
  requiredVersion: AURELIA_VERSION,
}]));
```

**Paso 6. `webpack.config.js`** (reemplaza el generado; solo cambian `REMOTE_NAME` y `PORT`):

```javascript
/* eslint-disable @typescript-eslint/no-var-requires */
// ADR-003 — Configuración de Webpack para el microfrontend de un juego (remote).
// ÚNICO cambio necesario: los dos valores de "DATOS DEL EQUIPO" según la tabla de la sección 2 del ADR.

// ===================== DATOS DEL EQUIPO =====================
// Equipo 4: 'typingGame' / 4001 · Equipo 5: 'triviaGame' / 4002 · Equipo 6: 'memoryGame' / 4003
const REMOTE_NAME = 'typingGame';
const PORT = 4001;
// ============================================================

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const { ModuleFederationPlugin } = require('webpack').container;
const sharedDeps = require('./mf-shared');

module.exports = function (env) {
  const production = env.production || process.env.NODE_ENV === 'production';
  return {
    target: 'web',
    mode: production ? 'production' : 'development',
    devtool: production ? undefined : 'eval-source-map',
    entry: { entry: './src/main.ts' },
    output: {
      clean: true,
      path: path.resolve(__dirname, 'dist'),
      filename: production ? '[name].[contenthash].bundle.js' : '[name].bundle.js',
      publicPath: 'auto',          // ADR-003 §8: los chunks se piden a ESTE servidor, no al del Shell
      uniqueName: REMOTE_NAME,
    },
    resolve: {
      extensions: ['.ts', '.js'],
      modules: [path.resolve(__dirname, 'src'), 'node_modules'],
      // Sin alias de desarrollo: se deben resolver los mismos paquetes que se comparten.
    },
    devServer: {
      historyApiFallback: true,
      open: !process.env.CI,
      port: PORT,
      headers: { 'Access-Control-Allow-Origin': '*' }, // ADR-003 §8: CORS para que el Shell descargue remoteEntry.js
    },
    performance: { hints: false },
    module: {
      rules: [
        { test: /\.(png|svg|jpg|jpeg|gif)$/i, type: 'asset' },
        { test: /\.(woff|woff2|ttf|eot|svg|otf)(\?v=[0-9]\.[0-9]\.[0-9])?$/i, type: 'asset' },
        { test: /\.css$/i, use: ['style-loader', 'css-loader'] },
        { test: /\.ts$/i, use: ['ts-loader', '@aurelia/webpack-loader'], exclude: /node_modules/ },
        { test: /[/\\]src[/\\].+\.html$/i, use: '@aurelia/webpack-loader', exclude: /node_modules/ },
      ],
    },
    plugins: [
      new ModuleFederationPlugin({
        name: REMOTE_NAME,
        filename: 'remoteEntry.js',                          // ADR-003 §2
        exposes: { './GameModule': './src/game-module' },   // ADR-003 §2
        shared: sharedDeps,                                  // ADR-003 §3
      }),
      new HtmlWebpackPlugin({ template: 'index.html', favicon: 'favicon.ico' }),
      new Dotenv({ path: `./.env${production ? '' : '.' + (process.env.NODE_ENV || 'development')}` }),
    ],
  };
};
```

**Paso 7. `src/main.ts`** (reemplaza el generado):

```typescript
// ADR-003 §2 — Límite asíncrono obligatorio: permite que Module Federation
// resuelva las dependencias compartidas antes de iniciar Aurelia. No poner más código aquí.
import('./bootstrap');
```

**Paso 8. `src/bootstrap.ts`** (archivo nuevo; lo que antes hacía `main.ts`):

```typescript
// Arranque del juego EN MODO INDEPENDIENTE (npm start en el puerto del equipo).
// Sirve para desarrollar y probar el juego sin el Shell. El Shell NO usa este archivo:
// el Shell carga directamente ./GameModule a través de remoteEntry.js.
import Aurelia from 'aurelia';
import { MyApp } from './my-app';

Aurelia.app(MyApp).start();
```

**Paso 9. `src/game-contracts.ts`** (archivo nuevo, no se modifica):

```typescript
// Tipos del contrato 03-contratos-tecnicos.md (secciones 5 y 6). Copia idéntica en el Shell y en los juegos.
export interface GameContext {
  matchId: string;
  gameType: 'typing' | 'trivia' | 'memory';
  currentUser: { id: string; displayName: string };
}

export interface GameModule {
  initialize(context: GameContext): Promise<void>;
  start(): Promise<void>;
  pause(): Promise<void>;
  dispose(): Promise<void>;
}
```

**Paso 10. `src/game-module.ts`** (archivo nuevo; aquí va el juego). Ejemplo del Equipo 4:

```typescript
// ADR-003 §2 — Módulo que el Shell carga. Debe exportarse con el nombre "GameModule"
// e implementar los 4 métodos del contrato. Reemplacen el contenido de ejemplo por su juego.
import { customElement } from 'aurelia';
import template from './game-module.html';
import './game-module.css';
import type { GameContext, GameModule as IGameModule } from './game-contracts';

type GameState = 'created' | 'initialized' | 'running' | 'paused' | 'disposed';

@customElement({ name: 'typing-game-module', template }) // nombre con prefijo del juego
export class GameModule implements IGameModule {
  public context: GameContext | null = null;
  public state: GameState = 'created';
  public score = 0;

  private timer: ReturnType<typeof setInterval> | null = null;
  public secondsLeft = 60;

  /** Recibe el contexto del Shell y prepara el estado inicial. NO inicia la partida. */
  public async initialize(context: GameContext): Promise<void> {
    if (!context?.matchId || !context.currentUser?.id) {
      // ADR-003 §6: si el juego no puede iniciar, RECHAZAR la promesa. El Shell lo mostrará como LIFECYCLE_ERROR.
      throw new Error('Contexto inválido: falta matchId o currentUser');
    }
    this.context = context;
    this.state = 'initialized';
    // Aquí: cargar datos iniciales desde su API (/api/games/{game}/...), si hace falta.
  }

  /** Comienza la partida: conectar al hub propio, arrancar temporizadores, etc. */
  public async start(): Promise<void> {
    // Aquí: conectar a su hub de SignalR (/hubs/typing | /hubs/trivia | /hubs/memory).
    //   this.connection = new HubConnectionBuilder().withUrl(`${API_URL}/hubs/typing`).build();
    //   await this.connection.start();   // si falla, la excepción llega al Shell como LIFECYCLE_ERROR
    this.state = 'running';
    this.stopTimer();
    this.timer = setInterval(() => {
      if (this.secondsLeft > 0) this.secondsLeft--;
    }, 1000);
  }

  /** Pausa (el usuario salió del área del juego). El Shell puede volver a llamar start(). */
  public async pause(): Promise<void> {
    this.stopTimer();
    this.state = 'paused';
  }

  /** Libera TODO antes de que el Shell descargue el juego: timers, listeners, conexión al hub. */
  public async dispose(): Promise<void> {
    this.stopTimer();
    // Aquí: await this.connection?.stop();
    this.state = 'disposed';
  }

  /** Ejemplo de acción del juego. */
  public addPoint(): void {
    if (this.state === 'running') this.score++;
  }

  private stopTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }
}
```

Con su `src/game-module.html`:

```html
<!-- ADR-003 §8 / contrato visual §7: solo se dibuja dentro del área del juego.
     Estructura sugerida: área superior (juego, partida, tiempo), área central (el juego), lateral opcional. -->
<section class="typing-game">
  <header class="typing-game-top">
    <strong>Typing Battle</strong>
    <span>Partida: ${context.matchId}</span>
    <span>Tiempo: ${secondsLeft}s</span>
  </header>

  <main class="typing-game-center">
    <p>Jugador: <strong>${context.currentUser.displayName}</strong> · Estado: <strong data-testid="game-state">${state}</strong></p>
    <p>Puntos: <strong data-testid="score">${score}</strong></p>
    <button data-testid="point-btn" click.trigger="addPoint()" disabled.bind="state !== 'running'">+1 punto</button>
  </main>
</section>
```

Y su `src/game-module.css`:

```css
/* ADR-003 §8: TODAS las clases con el prefijo del juego (typing-game, trivia-game, memory-game)
   para no afectar el layout del Shell. Nunca estilos sobre body, html, header, * ni etiquetas sueltas. */
.typing-game {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 400px;
}

.typing-game-top {
  display: flex;
  gap: 24px;
  padding: 8px 12px;
  background: #eef2ff;
  border-radius: 6px;
}

.typing-game-center {
  padding: 12px;
}
```

**Paso 11. Verificar:**

```bash
npm install
npm test         # lint + pruebas
npm run build    # debe generar dist/remoteEntry.js
npm start        # el juego corre solo en su puerto
```

La plantilla también incluye un arnés de desarrollo (`src/my-app.*`) para probar el juego sin el Shell, pruebas del ciclo de vida (`test/game-module.spec.ts`) y el pipeline de CI con Node 24 (`.github/workflows/ci.yml`).

### 4. Configuración de URLs por ambiente

Las URLs de los remotes **no se compilan dentro del Shell**. El Shell las lee al iniciar desde un archivo JSON estático, `remotes.config.json`:

```json
{
  "typing": { "scope": "typingGame", "url": "http://localhost:4001/remoteEntry.js", "module": "./GameModule" },
  "trivia": { "scope": "triviaGame", "url": "http://localhost:4002/remoteEntry.js", "module": "./GameModule" },
  "memory": { "scope": "memoryGame", "url": "http://localhost:4003/remoteEntry.js", "module": "./GameModule" }
}
```

- El repositorio `battlehub-shell` versiona un archivo por ambiente: `config/remotes.local.json` y `config/remotes.production.json`. Las URLs no son secretos, así que pueden versionarse.
- Al compilar, se copia el archivo del ambiente indicado (por defecto `local`) como `remotes.config.json` dentro de `dist/`.
- Como es un archivo estático, en el despliegue manual se puede reemplazar sin volver a compilar el Shell. Si un juego cambia de URL, solo se edita ese archivo.
- Las claves del JSON coinciden con el `gameType` que envía Matchmaking (`typing`, `trivia`, `memory`).

### 5. Carga y ciclo de vida en el Shell

1. Cuando Matchmaking emite `MatchStarted`, el Shell busca en `remotes.config.json` el remote correspondiente al `gameType` de la partida.
2. El Shell descarga `remoteEntry.js`, inicializa el contenedor con las dependencias compartidas y obtiene `./GameModule`.
3. El Shell valida que el módulo exporte `GameModule` y que implemente los cuatro métodos del contrato.
4. El Shell invoca `initialize(context)`, renderiza el componente **únicamente dentro del área del juego** e invoca `start()`.
5. El Shell invoca `pause()` si el usuario navega fuera del área del juego, y `dispose()` antes de descargar el microfrontend. Por ejemplo, al terminar la partida o al volver al lobby.

### 6. Manejo de errores de carga

**Responsable de la pantalla de error: el Shell (Equipo 3).** El Shell detecta los errores de carga e inicialización y muestra la pantalla de error dentro del área del juego, con el header y el footer intactos. Los equipos de juego no implementan pantallas de error de carga.

Los errores que ocurran **dentro del juego después de `start()`** (por ejemplo, una desconexión de su propio hub de SignalR) son responsabilidad de cada equipo de juego, que los muestra dentro de su área.

Errores contemplados:

| Código | Qué lo provoca | Quién lo detecta y lanza | ¿Reintentable? |
|---|---|---|---|
| `REMOTE_CONFIG_ERROR` | No se puede leer `remotes.config.json` | Shell, al cargar la configuración | Sí |
| `REMOTE_NOT_REGISTERED` | El `gameType` recibido no existe en `remotes.config.json` | Shell, al buscar el remote | No |
| `REMOTE_UNREACHABLE` | `remoteEntry.js` o sus chunks no descargan (servidor del juego caído, error de red, CORS) | Shell, al descargar el script | Sí |
| `REMOTE_TIMEOUT` | La carga del remote excede 10 segundos | Shell, con un temporizador | Sí |
| `INVALID_MODULE` | El remote no exporta `GameModule` o no implementa `initialize`, `start`, `pause` o `dispose` | Shell, al validar el módulo | No |
| `LIFECYCLE_ERROR` | `initialize()` o `start()` rechazan su promesa o lanzan una excepción | El juego lanza el error y el Shell lo captura | No |

Para que el Shell pueda detectar `LIFECYCLE_ERROR`, los juegos deben **rechazar la promesa** de `initialize()` o `start()` cuando no puedan iniciar, en lugar de ignorar el error.

### 7. Lógica de reintento

- **Reintento automático:** solo para los errores reintentables. Se hacen hasta **2 reintentos automáticos** (3 intentos en total), con esperas de 1 y 2 segundos. La pantalla muestra "Cargando juego... (intento N)".
- **Reintento manual:** si los intentos automáticos se agotan, la pantalla de error muestra los botones **"Reintentar"** y **"Volver al lobby"**.
- **Errores no reintentables:** solo se muestra "Volver al lobby", porque reintentar no cambiaría el resultado.
- **Detalle técnico:** antes de cada reintento, el Shell elimina el `<script>` y el contenedor del intento fallido y vuelve a pedir `remoteEntry.js`. La prueba de concepto demostró que el `import('remote/Modulo')` estático de Webpack guarda el fallo en caché y no permite reintentar, por eso el Shell usa carga dinámica de contenedores.

### 8. Requisitos de los servidores de los remotes

- Deben responder con CORS habilitado (`Access-Control-Allow-Origin`) para que el Shell pueda descargar `remoteEntry.js` desde otro origen.
- `output.publicPath` debe ser `'auto'`, para que los chunks se descarguen desde el servidor del juego y no desde el del Shell.
- Los estilos de cada juego deben limitarse a su propio componente, mediante clases con prefijo del juego o Shadow DOM, para no alterar el layout global del Shell.

### 9. Validación: prueba de concepto

Se construyó una prueba de concepto con un Shell (puerto 4000) y un juego de prueba `demoGame` (puerto 4001), ambos en Aurelia `2.0.0-rc.2` con Webpack `5.111.1`, compilados con Node `24.11.0`, y se ejecutó en Chromium a una resolución de 1366×768. El código de la prueba de concepto está en el repositorio `battlehub-shell`, carpeta `poc/`, y las capturas en `adrs/evidencias/ADR-003/`.

| Escenario | Resultado |
|---|---|
| 1. El servidor del juego está apagado y se inicia la partida | 3 intentos automáticos y luego la pantalla de error del Shell con código `REMOTE_UNREACHABLE` y botones "Reintentar" y "Volver al lobby" (`01-remote-caido-error.png`) |
| 2. Se enciende el servidor del juego y se presiona "Reintentar" | El juego se carga dentro del área del juego, recibe el contexto (`match-001`, `Francisco`) y su *binding* funciona (3 clics registrados) (`02-juego-cargado.png`) |
| 3. El Shell invoca `pause()` | El juego pasa a estado `paused` (`03-pausado.png`) |
| 4. El Shell invoca `dispose()` | El juego libera recursos y el Shell vuelve al lobby (`04-lobby-tras-dispose.png`) |
| 5. La plantilla de juego (`juego-remote`, configurada como `typingGame` en el puerto 4001) se carga dentro del Shell | El juego recibe el contexto, responde a la interacción y `dispose()` regresa al lobby (`05-plantilla-en-shell.png`) |
| 6. La plantilla corre sola con `npm start` | El arnés de desarrollo simula el Shell y el juego pasa a `running` (`06-plantilla-modo-independiente.png`) |
| Instancia única de Aurelia | El contenedor de inyección de dependencias de Aurelia es el mismo objeto en el Shell y en el juego. El Shell solo descargó del remote `remoteEntry.js`, el chunk del juego y `tslib`, ninguna copia de Aurelia |

Si durante la implementación real aparecen limitaciones no cubiertas por esta prueba, se documentarán con un ADR que reemplace o complemente a este.

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Vite con un plugin de federación (`@originjs/vite-plugin-federation` o `@module-federation/vite`) | Es viable y Aurelia 2 lo documenta, pero la arquitectura del proyecto ya indica Webpack. Además, el soporte de federación en Vite depende de plugins de terceros. Con algunos plugins, los remotes deben compilarse (`build`) en lugar de correr en modo desarrollo, lo que complica el trabajo simultáneo de cuatro equipos. |
| Remotes fijos en la configuración del Shell (`remotes: { ... }`) con URLs por variable de entorno | Las URLs quedan compiladas dentro del Shell, así que cada cambio de ambiente o de URL obliga a recompilar. Además, la prueba de concepto mostró que un fallo de carga queda en caché y no se puede reintentar sin recargar la página. |
| `iframe` por juego | Da aislamiento total, pero dificulta cumplir el contrato visual (tamaños, layout controlado por el Shell). También obliga a pasar el contexto y el ciclo de vida `GameModule` mediante `postMessage`, lo que agrega complejidad y se aparta del contrato definido. |
| Web Components cargados por `<script>` sin federación | Cada juego empaquetaría su propia copia de Aurelia, lo que produce múltiples instancias del framework y un mayor peso de descarga. Tampoco hay manejo de versiones compartidas. |
| single-spa u otro orquestador de microfrontends | Agrega otro framework al frontend, lo que contradice la regla de no mezclar frameworks, y aumenta la curva de aprendizaje. |
| Integración en tiempo de compilación (juegos como paquetes npm del Shell) | Elimina el despliegue independiente de cada juego, que es uno de los objetivos de la arquitectura de microfrontends. |

## Consecuencias

- **Positivas**:
  - Los tres juegos se integran al Shell de la misma forma, con nombres, módulos, puertos y versiones predecibles.
  - Cada equipo de juego puede desarrollar y desplegar su microfrontend de forma independiente.
  - Aurelia se carga una sola vez, lo que se comprobó en la prueba de concepto.
  - Cambiar la URL de un juego o de ambiente no requiere recompilar el Shell.
  - Si un juego no está disponible, el resto de la plataforma sigue funcionando y el usuario puede reintentar o volver al lobby.
- **Negativas / riesgos asumidos**:
  - Aurelia `2.0.0-rc.2` es una versión candidata, no estable. Se acepta porque es la versión `latest` publicada en npm. El cambio a `2.0.0` estable deberá coordinarse entre los cuatro equipos.
  - Los cuatro proyectos deben mantener la misma versión exacta de Aurelia. Con `strictVersion` un desfase provoca un error inmediato al cargar el juego.
  - La carga dinámica de contenedores agrega código propio en el Shell (unas 60 líneas), en lugar de usar solo la configuración de Webpack.
  - Los equipos deben configurar Webpack y Module Federation, en lugar de usar la plantilla por defecto de Aurelia.

## Impacto en otros equipos

**Sí.** Esta decisión define parte del contrato de microfrontends de `battlehub-contracts`, por lo que requiere aprobación del Tech Lead antes de implementarse.

- **Equipos 4, 5 y 6** (la plantilla de la sección 3 ya cumple todo esto; ver también el checklist al final):
  - Usar Node 24 LTS y Aurelia `2.0.0-rc.2` exacta.
  - Configurar su microfrontend como remote de Webpack 5 Module Federation, con el nombre, el módulo expuesto (`./GameModule`) y el puerto local de la tabla de la sección 2.
  - Usar el archivo `mf-shared.js` común y el límite asíncrono en `main.ts`.
  - Habilitar CORS y `publicPath: 'auto'`.
  - Rechazar la promesa de `initialize()` o `start()` cuando el juego no pueda iniciar.
  - Informar al Equipo 3 la URL de su `remoteEntry.js` en cada ambiente.
- **Equipos 1 y 2**: sin impacto. Esta decisión no modifica contratos REST ni SignalR.
- **`05-cicd-testing-commits.md`**: la versión de Node del esqueleto de pipeline de frontend pasa de `20` a `24`.

### Checklist de implementación para los Equipos 4, 5 y 6

**Configuración del proyecto**

- [ ] Node 24 instalado (`node -v`) y archivo `.nvmrc` con `24`.
- [ ] `aurelia` y todos los `@aurelia/*` en `2.0.0-rc.2` exacta en `package.json` (sin `^` ni `latest`).
- [ ] `mf-shared.js` copiado sin cambios.
- [ ] `webpack.config.js` con el `REMOTE_NAME` y el `PORT` de su equipo.
- [ ] `src/main.ts` contiene solo `import('./bootstrap');`.

**Contrato del juego**

- [ ] `src/game-module.ts` exporta una clase llamada `GameModule`.
- [ ] Implementa `initialize(context)`, `start()`, `pause()` y `dispose()`, y todos devuelven una promesa.
- [ ] `initialize()` no inicia la partida; solo guarda el contexto y prepara el estado.
- [ ] `initialize()` o `start()` rechazan la promesa si el juego no puede iniciar.
- [ ] `dispose()` detiene temporizadores, quita listeners y cierra la conexión al hub de SignalR.
- [ ] `pause()` detiene el juego y `start()` lo puede reanudar.

**Contrato visual**

- [ ] Todas las clases CSS llevan el prefijo del juego; no hay estilos sobre `body`, `html`, `header` ni `*`.
- [ ] El juego no modifica la navegación, el login, el header ni el footer del Shell.
- [ ] El juego se ve bien en el área asignada (mínimo 1024 × 700 px, resolución 1366 × 768).

**Verificación**

- [ ] `npm test` pasa (lint + pruebas).
- [ ] `npm run build` genera `dist/remoteEntry.js`.
- [ ] Con `npm start`, `http://localhost:<PORT>/remoteEntry.js` responde en el navegador.
- [ ] El juego se carga dentro del Shell (con la prueba de concepto de `battlehub-shell/poc` o el Shell real).
- [ ] CI configurado con Node 24 y en verde.

**Coordinación**

- [ ] URL del `remoteEntry.js` de cada ambiente informada al Equipo 3.
- [ ] Cualquier paquete `@aurelia/*` adicional que usen, informado al Equipo 3 para agregarlo a `mf-shared.js`.

