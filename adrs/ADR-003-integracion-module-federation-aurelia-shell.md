# ADR-003: Integración de microfrontends con Module Federation (Webpack 5) en Aurelia 2

- **Estado**: Propuesto
- **Fecha**: 2026-09-28 (UTC)
- **Equipo/Autor**: Equipo 3 - Shell Application (Grupo 1)

## Contexto

El documento `02-arquitectura-y-flujo.md` establece que el Shell (Equipo 3) debe cargar dinámicamente los microfrontends de los juegos (Typing, Trivia y Memory), todos construidos en **Aurelia**, usando **Module Federation**. El mismo documento deja como pendiente, a resolver con un ADR, los "detalles finos de la integración de Module Federation con Aurelia".

Restricciones que ya existen en `battlehub-contracts`:

- Frontend único: Aurelia en el Shell y en los tres microfrontends. No se permite mezclar otros frameworks.
- Cada microfrontend debe exponer un módulo que implemente la interfaz `GameModule` (`initialize`, `start`, `pause`, `dispose`), definida en `03-contratos-tecnicos.md`.
- El Shell entrega a cada juego el contexto `{ matchId, gameType, currentUser }`.
- El Shell es dueño del layout. Los juegos solo renderizan dentro del área asignada y no pueden alterar la navegación, el login ni el header/footer.
- CI de frontend con Node 20.

Sin una convención común, cada equipo de juego configuraría su remote de forma distinta (nombres, módulos expuestos, puertos, versiones de Aurelia), y el Shell no podría cargarlos de forma uniforme. Por eso esta decisión define tanto la herramienta como el contrato técnico de integración.

La documentación oficial de Aurelia 2 incluye una guía de micro-frontends con Module Federation que cubre Webpack 5, lo que confirma que la integración es viable.

## Decisión

Se usará **Webpack 5 con su `ModuleFederationPlugin` nativo** para integrar el Shell (host) con los tres microfrontends de juego (remotes), todos en **Aurelia 2**, bajo las siguientes convenciones obligatorias.

### 1. Nombres de los remotes y módulo expuesto

| Equipo | Nombre del remote (`name`) | Módulo expuesto | Puerto local |
|---|---|---|---|
| Equipo 3 (Shell, host) | `shell` | — | `4000` |
| Equipo 4 (Typing) | `typingGame` | `./GameModule` | `4001` |
| Equipo 5 (Trivia) | `triviaGame` | `./GameModule` | `4002` |
| Equipo 6 (Memory) | `memoryGame` | `./GameModule` | `4003` |

- Cada remote publica su punto de entrada como `remoteEntry.js`, en la raíz de su servidor. Ejemplo: `http://localhost:4001/remoteEntry.js`.
- El módulo `./GameModule` debe exportar (export nombrado `GameModule`) un componente de Aurelia 2 que implemente la interfaz `GameModule` de `03-contratos-tecnicos.md`.

### 2. Dependencias compartidas

Todos los proyectos (Shell y remotes) deben declarar como `shared`, con `singleton: true`, el paquete `aurelia` y los paquetes `@aurelia/*` que usen. Esto evita que se carguen dos instancias del framework.

Las versiones de Aurelia 2 deben coincidir entre los cuatro proyectos. El Shell publicará en su README la versión exacta que usa, como referencia.

Ejemplo de configuración de un remote:

```javascript
new ModuleFederationPlugin({
  name: 'triviaGame',
  filename: 'remoteEntry.js',
  exposes: {
    './GameModule': './src/game-module',
  },
  shared: {
    aurelia: { singleton: true, requiredVersion: '^2.0.0' },
  },
});
```

Ejemplo de configuración del Shell:

```javascript
new ModuleFederationPlugin({
  name: 'shell',
  remotes: {
    typingGame: `typingGame@${process.env.TYPING_REMOTE_URL}/remoteEntry.js`,
    triviaGame: `triviaGame@${process.env.TRIVIA_REMOTE_URL}/remoteEntry.js`,
    memoryGame: `memoryGame@${process.env.MEMORY_REMOTE_URL}/remoteEntry.js`,
  },
  shared: {
    aurelia: { singleton: true, requiredVersion: '^2.0.0' },
  },
});
```

Las URLs de los remotes se configuran mediante variables de entorno, sin valores quemados en el código, para poder apuntar a local o al despliegue manual sin modificar el código.

### 3. Carga y ciclo de vida en el Shell

1. Cuando Matchmaking emite `MatchStarted`, el Shell importa dinámicamente el remote correspondiente al `gameType` de la partida (`import('triviaGame/GameModule')`).
2. El Shell renderiza el componente exportado **únicamente dentro del área del juego** del layout.
3. El Shell invoca `initialize(context)`, con el contexto definido en el contrato, y luego `start()`.
4. El Shell invoca `pause()` si el usuario navega fuera del área del juego, y `dispose()` antes de descargar el microfrontend. Por ejemplo, al terminar la partida o al volver al lobby.
5. Si el remote no se puede cargar (servidor caído o error de red), el Shell muestra un mensaje de error en el área del juego y permite regresar al lobby, sin afectar al resto de la aplicación.

### 4. Requisitos de los servidores de desarrollo de los remotes

- Deben responder con CORS habilitado (`Access-Control-Allow-Origin`) para que el Shell pueda descargar `remoteEntry.js` desde otro origen.
- Los estilos de cada juego deben limitarse a su propio componente, mediante clases con prefijo del juego o Shadow DOM. Así no alteran el layout global del Shell.

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Vite con un plugin de federación (`@originjs/vite-plugin-federation` o `@module-federation/vite`) | Es viable y Aurelia 2 lo documenta, pero la arquitectura del proyecto ya indica Webpack. Además, el soporte de federación en Vite depende de plugins de terceros. Con algunos plugins, los remotes deben compilarse (`build`) en lugar de correr en modo desarrollo, lo que complica el trabajo simultáneo de cuatro equipos. |
| `iframe` por juego | Da aislamiento total, pero dificulta cumplir el contrato visual (tamaños, layout controlado por el Shell). También obliga a pasar el contexto y el ciclo de vida `GameModule` mediante `postMessage`, lo que agrega complejidad y se aparta del contrato definido. |
| Web Components cargados por `<script>` sin federación | Cada juego empaquetaría su propia copia de Aurelia, lo que produce múltiples instancias del framework y un mayor peso de descarga. Tampoco hay manejo de versiones compartidas. |
| single-spa u otro orquestador de microfrontends | Agrega otro framework al frontend, lo que contradice la regla de no mezclar frameworks, y aumenta la curva de aprendizaje. |
| Integración en tiempo de compilación (juegos como paquetes npm del Shell) | Elimina el despliegue independiente de cada juego, que es uno de los objetivos de la arquitectura de microfrontends. |

## Consecuencias

- **Positivas**:
  - Los tres juegos se integran al Shell de la misma forma, con nombres, módulos y puertos predecibles.
  - Cada equipo de juego puede desarrollar y desplegar su microfrontend de forma independiente.
  - Aurelia se carga una sola vez, gracias a las dependencias compartidas como `singleton`.
  - La configuración por variables de entorno facilita pasar de local al despliegue manual.
  - Se sigue un enfoque documentado oficialmente por Aurelia 2.
- **Negativas / riesgos asumidos**:
  - Los cuatro proyectos deben mantener alineada la versión de Aurelia. Un desfase puede causar errores en tiempo de ejecución difíciles de diagnosticar.
  - Las URLs de los remotes se resuelven al compilar el Shell. Si cambia la URL de un juego desplegado, hay que recompilar el Shell. Si esto se vuelve un problema, se evaluará la carga de remotes en tiempo de ejecución mediante un nuevo ADR.
  - Los equipos deben aprender la configuración de Webpack y Module Federation, en lugar de usar el bundler por defecto de la plantilla de Aurelia.
  - Los detalles internos del renderizado del componente remoto dentro del Shell se validarán con una prueba de concepto. Si aparecen limitaciones, se documentarán con un ADR que reemplace o complemente a este.

## Impacto en otros equipos

**Sí.** Esta decisión define parte del contrato de microfrontends de `battlehub-contracts`, por lo que requiere aprobación del Tech Lead antes de implementarse.

- **Equipos 4, 5 y 6**: deben configurar su microfrontend como remote de Webpack 5 Module Federation. Deben usar el nombre, el módulo expuesto (`./GameModule`) y el puerto local de la tabla anterior, compartir Aurelia como `singleton` con la misma versión que el Shell, y habilitar CORS en su servidor de desarrollo.
- **Equipos 1 y 2**: sin impacto. Esta decisión no modifica contratos REST ni SignalR.
