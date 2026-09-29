# ADR-004: Ciclo de vida, heartbeat y limpieza automática de salas de Matchmaking

- **Estado**: Propuesto
- **Fecha**: 2026-09-28 (UTC)
- **Equipo/Autor**: Equipo 2 - Matchmaking & Lobby Service

## Contexto

Los contratos de `battlehub-contracts` ya fijan para Matchmaking el backend en .NET 10, MongoDB, la base URL `/api/matches`, el hub `/hubs/lobby`, los endpoints oficiales, los eventos SignalR oficiales y el uso de timestamps UTC. También establecen que Matchmaking administra el ciclo de vida de las salas, pero no implementa lógica específica de los juegos ni persiste sus resultados. Estas decisiones no se revisan ni se modifican en este ADR.

Los contratos exigen la limpieza automática de salas vacías, abandonadas, sin heartbeat o expiradas. Sin embargo, todavía no definen el mecanismo que ejecutará esa limpieza, cómo se representará la actividad de una sala, cómo se utilizará el heartbeat para detectar abandono, qué estados internos necesita la sala para gestionar su ciclo de vida ni cómo se configurarán los umbrales de tiempo.

## Decisión

Se utilizará un `BackgroundService` de .NET, registrado como servicio hospedado (`IHostedService`), para ejecutar periódicamente la limpieza automática de salas. Este worker se ejecutará dentro del proceso del Matchmaking Service; el intervalo de ejecución se obtendrá de la configuración del servicio.

Cada instancia del Matchmaking Service podrá ejecutar su propio worker. En esta versión no se utilizarán elección de líder ni lock distribuido. La concurrencia se resolverá mediante operaciones MongoDB atómicas, condicionales e idempotentes, como se detalla en la sección de seguridad con múltiples instancias.

Cada sala mantendrá conceptualmente timestamps suficientes para determinar su actividad, incluyendo `createdAt` y `lastActivityAt`. Cada participante mantendrá `joinedAt` y `lastHeartbeatAt`. Todos serán generados por el servidor y se manejarán y almacenarán en UTC. Estos nombres describen el modelo interno necesario para la implementación y no crean ni modifican un contrato REST.

### Máquina de estados

Los estados de una sala son:

- `Waiting`
- `Starting`
- `Started`
- `Finished`
- `Cancelled`

Estos estados representan el ciclo interno necesario para implementar el campo `status` ya existente y los eventos SignalR definidos por `battlehub-contracts`. No se incorporan estados adicionales mediante este ADR.

| Estado actual | Disparador | Nuevo estado | Evento |
|---|---|---|---|
| No existe | Creación correcta de la partida | `Waiting` | `MatchCreated` |
| `Waiting` | `POST /api/matches/{matchId}/join` correcto | `Waiting` | `PlayerJoined` |
| `Waiting` | `POST /api/matches/{matchId}/leave` correcto | `Waiting` | `PlayerLeft` |
| `Waiting` | `POST /api/matches/{matchId}/start` solicitado por el owner | `Starting` | `MatchStarting` |
| `Starting` | Matchmaking completa correctamente el procesamiento de inicio | `Started` | `MatchStarted` |
| `Started` | Matchmaking recibe una notificación válida de fin del juego | `Finished` | `MatchFinished` |
| `Waiting` | `DELETE /api/matches/{matchId}` solicitado por el owner | `Cancelled` | `MatchDeleted` al completarse la cancelación lógica |
| `Starting` | `DELETE /api/matches/{matchId}` solicitado por el owner | `Cancelled` | `MatchDeleted` al completarse la cancelación lógica |

Al crear correctamente una partida, su estado inicial será `Waiting`, `createdAt` será el UTC actual del servidor y `lastActivityAt` tendrá el mismo valor. Se emitirá `MatchCreated`.

El ingreso mediante `POST /api/matches/{matchId}/join` solo aplica mientras el estado permita el ingreso; para este ADR, el ingreso ocurre en `Waiting`. No cambia el estado. Cuando el ingreso es correcto, `joinedAt` y `lastHeartbeatAt` reciben el UTC actual del servidor y `lastActivityAt` de la sala se actualiza con el UTC actual del servidor. Se emite `PlayerJoined`.

Mientras la sala está en `Waiting`, un participante puede salir mediante `POST /api/matches/{matchId}/leave`. Una salida correcta no cambia el estado, actualiza `lastActivityAt` con el UTC actual del servidor y emite `PlayerLeft`.

El inicio mediante `POST /api/matches/{matchId}/start` solo puede solicitarse desde `Waiting` y por el owner o creador de la sala: la identidad autenticada debe corresponder a `createdBy`. Una solicitud correcta realiza la transición `Waiting` -> `Starting`, actualiza `lastActivityAt` con el UTC actual del servidor y emite `MatchStarting`. Cuando Matchmaking completa correctamente su procesamiento de inicio, realiza la transición `Starting` -> `Started`, vuelve a actualizar `lastActivityAt` con el UTC actual del servidor y emite `MatchStarted`. Este ADR no define lógica específica de ningún juego.

Una sala `Started` pasa de `Started` -> `Finished` cuando Matchmaking recibe una notificación válida de que el juego terminó. La transición actualiza `lastActivityAt` con el UTC actual del servidor y emite `MatchFinished`. El mecanismo Game Service -> Matchmaking para entregar esa notificación queda fuera del alcance de este ADR.

El owner puede cancelar mediante `DELETE /api/matches/{matchId}` una sala que todavía no haya comenzado. Se permiten las transiciones `Waiting` -> `Cancelled` y `Starting` -> `Cancelled`; ambas actualizan `lastActivityAt` con el UTC actual del servidor. Una transición exitosa a `Cancelled` emite el evento existente `MatchDeleted` en el momento de la cancelación lógica y la sala deja de aparecer como sala activa del lobby. No se permite cancelar desde `Finished` y este ADR no define la cancelación de una partida `Started`. No se introduce un evento `MatchCancelled`.

`Finished` y `Cancelled` son estados terminales persistidos y no tienen transiciones posteriores de negocio. Una sala en cualquiera de esos estados puede mantenerse almacenada hasta que venza `terminal-state retention`. Su eliminación física posterior por cleanup es únicamente una operación de persistencia y retención: no constituye otro estado ni vuelve a emitir un evento ya emitido por la transición de negocio. En particular, eliminar físicamente una sala `Cancelled` no vuelve a emitir `MatchDeleted`.

### Timestamps de actividad

`lastActivityAt` se actualizará con UTC generado por el servidor cuando ocurra correctamente cualquiera de estas acciones:

- creación de la sala;
- join;
- leave;
- heartbeat válido;
- transición `Waiting` -> `Starting`;
- transición `Starting` -> `Started`;
- transición `Started` -> `Finished`;
- transición a `Cancelled`.

Una ejecución del worker que solamente inspeccione una sala no actualizará `lastActivityAt`. Una operación rechazada tampoco actualizará `lastActivityAt` ni ningún timestamp asociado a esa operación.

### Ownership

`createdBy` identifica al owner o creador de la sala. Las operaciones que modifican el ciclo global de la sala, `start` y `cancel`, requieren que la identidad autenticada coincida con `createdBy`.

Heartbeat no requiere que el usuario sea owner, sino que sea participante actual de la sala. Join y leave mantienen la semántica del contrato existente y este ADR no añade decisiones de autorización para esas operaciones más allá de lo necesario para definir el ciclo de vida descrito.

### Heartbeat e identidad

Se mantiene exactamente el contrato existente `Heartbeat(matchId)`; no se agrega `userId`. Su procesamiento seguirá estas reglas:

1. El usuario debe estar autenticado.
2. La identidad se obtiene del contexto autenticado o JWT mediante un identificador estable del usuario, por ejemplo el claim `subject`/`sub`; no se depende de un `userId` enviado por el cliente.
3. Matchmaking busca la sala indicada por `matchId`.
4. El usuario autenticado debe aparecer actualmente entre los participantes de esa sala.
5. Si el usuario no pertenece a la sala, el heartbeat se rechaza y no cambian `lastHeartbeatAt` ni `lastActivityAt`.
6. Si `matchId` no existe, el heartbeat se rechaza y no se modifica ningún timestamp.
7. El timestamp no se recibe desde el cliente; el servidor genera el UTC actual al procesar el heartbeat.
8. Para un heartbeat válido, `participant.lastHeartbeatAt` y `match.lastActivityAt` se actualizan con el UTC del servidor.
9. Para impedir regresiones temporales por concurrencia entre instancias, estas actualizaciones serán monotónicas. Conceptualmente, MongoDB actualizará cada timestamp solo si el nuevo valor es posterior al almacenado, o mediante una operación atómica equivalente. Este ADR no prescribe todavía una implementación concreta.

Recibir un heartbeat y evaluar un heartbeat almacenado que ya venció son hechos distintos. Un heartbeat válido recibido actualiza los timestamps indicados. Para cleanup, una sala con participantes será candidata por «sin heartbeat» solamente cuando ninguno de sus participantes tenga un `lastHeartbeatAt` dentro de la ventana válida definida por `heartbeat timeout`.

Un único participante con heartbeat vencido no provocará por sí solo la eliminación de toda la sala cuando existan otros participantes activos. Las políticas de expulsión individual por heartbeat vencido quedan fuera del alcance.

### Categorías de cleanup

El `heartbeat timeout`, el `inactivity timeout`, la expiración de la partida (`match expiration`), el intervalo de limpieza (`cleanup interval`) y la retención de estados terminales (`terminal-state retention`) serán configuración externa del servicio, no constantes codificadas. Este ADR no fija segundos ni minutos concretos.

El worker evaluará conceptualmente estas categorías:

- **Sala `Waiting` vacía**: está en `Waiting`, no tiene participantes y su `lastActivityAt` ha superado el `inactivity timeout` configurado.
- **Sala `Waiting` inactiva**: está en `Waiting` y su `lastActivityAt` ha superado el `inactivity timeout`.
- **Sala sin heartbeat válido**: tiene participantes y ninguno posee un `lastHeartbeatAt` dentro de la ventana de `heartbeat timeout`.
- **Sala expirada**: ha superado el `match expiration` configurado según las reglas aplicables.
- **Sala terminal**: está en `Finished` o `Cancelled` y su `lastActivityAt` ha superado `terminal-state retention`.

Estas categorías determinan candidatas; antes de modificar o eliminar una sala, el worker volverá a comprobar atómicamente las condiciones que justificaron la candidatura.

### Seguridad con múltiples instancias

Varias réplicas del Matchmaking Service pueden ejecutar sus `BackgroundService` simultáneamente. En la versión inicial no se utilizará lock distribuido ni elección de líder. La seguridad se garantizará con operaciones MongoDB atómicas, condicionales e idempotentes.

Cada modificación o eliminación incluirá en su filtro `matchId`, el estado esperado y la condición temporal que hizo candidata a la sala. Por ejemplo, una sala detectada como `Waiting` e inactiva solo podrá eliminarse si, al ejecutar la operación, sigue en `Waiting` y conserva un `lastActivityAt` anterior al cutoff calculado. Si otra instancia ya actualizó o eliminó la sala y esas condiciones dejaron de cumplirse, la operación no encontrará coincidencia y no tendrá efecto adicional.

Las transiciones de estado también compararán atómicamente el estado esperado. Por ejemplo, `Waiting` -> `Starting` solo tendrá éxito si, al ejecutar la actualización, el documento continúa en `Waiting`. De esta forma, dos instancias no podrán completar simultáneamente la misma transición.

Solamente la instancia cuya operación atómica haya modificado, efectuado la transición o eliminado exitosamente el documento emitirá el evento SignalR correspondiente. Una instancia cuya operación no encuentre coincidencia no emitirá el evento, evitando duplicados producidos por workers concurrentes.

Como ejemplo conceptual, dos workers A y B pueden detectar una misma sala expirada. A ejecuta primero la operación condicional y elimina la sala. B ejecuta la misma operación, pero ya no encuentra un documento que cumpla las condiciones. La sala se elimina una sola vez y B no emite un evento duplicado.

MongoDB ya está fijado por la arquitectura y no se decide en este ADR.

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Cron o job externo | Separaría la ejecución del proceso web, pero agrega infraestructura, despliegue y operación que no son necesarios para la versión inicial. |
| Limpieza oportunista al recibir requests | Depende de que exista tráfico y no garantiza que las salas inactivas se detecten y limpien de manera oportuna. |
| Leader election | Evitaría scans simultáneos, pero agrega coordinación e infraestructura que no son necesarias para el alcance actual. |
| Lock distribuido | Serializaría el cleanup, pero agrega otra dependencia operativa que no es necesaria para el alcance actual. |

Leader election, un lock distribuido o un job externo podrán reconsiderarse como mecanismos de coordinación futuros. No se seleccionan en esta versión porque las operaciones atómicas, condicionales e idempotentes son suficientes para el alcance actual y evitan infraestructura adicional.

## Consecuencias

- Positivas:
  - Los estados y sus transiciones quedan explícitos.
  - El cleanup es seguro ante múltiples workers concurrentes.
  - No se requiere un coordinador externo.
  - Se pueden detectar salas vacías, inactivas, sin heartbeat válido, expiradas y terminales fuera de retención.
  - Los tiempos son configurables.
  - El heartbeat se valida contra la identidad autenticada y la membresía actual de la sala.
  - La solución se integra de forma natural con .NET y MongoDB.
- Negativas / riesgos asumidos:
  - El worker está unido al proceso web y los reinicios del servicio interrumpen temporalmente su ejecución.
  - Varias instancias pueden realizar scans redundantes.
  - La seguridad depende de que todas las operaciones de cleanup respeten los filtros atómicos de estado y timestamps.
  - Un aumento significativo de escala puede justificar un lock distribuido, leader election o un job externo.

## Impacto en otros equipos

Este ADR no cambia las rutas REST, las firmas de los endpoints existentes ni los nombres de los eventos SignalR. `Heartbeat(matchId)` permanece exactamente igual. Tampoco cambia las decisiones arquitectónicas de MongoDB y .NET 10, ni introduce nuevos endpoints o eventos.

El ADR formaliza la semántica de los estados, el ownership para `start` y `cancel`, la validación del heartbeat mediante identidad autenticada y membresía, y la estrategia concurrente del cleanup. Los estados definidos aclaran los valores que puede representar el campo `status` existente, por lo que el Shell puede observarlos mediante los contratos actuales. No se requieren cambios en las APIs de los juegos.

## Fuera del alcance

Quedan fuera del alcance:

- el mecanismo concreto Game Service -> Matchmaking para indicar el fin de una partida;
- los valores concretos de timeout;
- la lógica específica de los juegos;
- la expulsión individual por heartbeat vencido.

Una vez que Matchmaking reciba una notificación válida del fin de la partida, podrá realizar la transición y emitir `MatchFinished` conforme al contrato SignalR existente. Este ADR no define cómo se entregará esa notificación.
