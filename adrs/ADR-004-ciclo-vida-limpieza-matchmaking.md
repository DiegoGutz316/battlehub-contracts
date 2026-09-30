# ADR-004: Ciclo de vida, heartbeat y limpieza automática de salas de Matchmaking

- **Estado**: Propuesto
- **Fecha**: 2026-09-28 (UTC)
- **Equipo/Autor**: Equipo 2 - Matchmaking & Lobby Service

## Contexto

Los contratos de `battlehub-contracts` ya fijan para Matchmaking el backend en .NET 10, MongoDB, la base URL `/api/matches`, el hub `/hubs/lobby`, los endpoints actualmente existentes, los eventos SignalR oficiales y el uso de timestamps UTC. También establecen que Matchmaking administra el ciclo de vida de las salas, pero no implementa lógica específica de los juegos ni persiste sus resultados. Estas decisiones constituyen la línea base de este ADR, que no cambia los endpoints existentes.

Esa línea base deja sin definir cómo el Game Service notifica a Matchmaking que una partida finalizó. Para cubrir ese vacío del flujo ya documentado, este ADR propone extender el contrato con el endpoint service-to-service `POST /api/matches/{matchId}/finish`. El endpoint solo pasará a formar parte del contrato técnico si el Tech Lead acepta este ADR.

Los contratos exigen la limpieza automática de salas vacías, abandonadas, sin heartbeat o expiradas. Sin embargo, todavía no definen el mecanismo que ejecutará esa limpieza, cómo se representará la actividad de una sala, cómo se utilizará el heartbeat para detectar abandono, qué estados internos necesita la sala para gestionar su ciclo de vida ni cómo se configurarán los umbrales de tiempo.

## Decisión

Se utilizará un `BackgroundService` de .NET, registrado como servicio hospedado (`IHostedService`), para ejecutar periódicamente la limpieza automática de salas. Este worker se ejecutará dentro del proceso del Matchmaking Service; el intervalo de ejecución se obtendrá de la configuración del servicio.

Cada instancia del Matchmaking Service podrá ejecutar su propio worker. En esta versión no se utilizarán elección de líder ni lock distribuido. La concurrencia se resolverá mediante operaciones MongoDB atómicas, condicionales e idempotentes, como se detalla en la sección de seguridad con múltiples instancias.

Cada sala mantendrá conceptualmente timestamps suficientes para determinar su actividad, incluyendo `createdAt` y `lastActivityAt`. Cada participante mantendrá `joinedAt` y `lastHeartbeatAt`. MongoDB será la fuente autoritativa de tiempo para todos los timestamps persistidos que participen en decisiones concurrentes o de cleanup, incluidos estos campos y los timestamps de transiciones de estado. Las instancias de Matchmaking no dependerán de sus relojes locales para decidir sus valores: el tiempo se obtendrá del lado de MongoDB mediante una operación server-side equivalente a usar el tiempo actual del servidor de base de datos. Se manejarán y almacenarán en UTC. Este ADR no prescribe una sintaxis concreta de MongoDB. Estos nombres describen el modelo interno necesario para la implementación y no crean ni modifican un contrato REST.

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
| `Started` | Callback válido `POST /api/matches/{matchId}/finish` del Game Service autorizado | `Finished` | `MatchFinished` |
| `Waiting` | `DELETE /api/matches/{matchId}` solicitado por el owner | `Cancelled` | `MatchDeleted` al completarse la cancelación lógica |
| `Starting` | `DELETE /api/matches/{matchId}` solicitado por el owner | `Cancelled` | `MatchDeleted` al completarse la cancelación lógica |
| `Waiting` | `match expiration` alcanzado por cleanup | `Cancelled` | `MatchDeleted` |
| `Starting` | `match expiration` alcanzado por cleanup | `Cancelled` | `MatchDeleted` |
| `Started` | `match expiration` alcanzado por cleanup | `Cancelled` | `MatchDeleted` |

Al crear correctamente una partida, su estado inicial será `Waiting`; `createdAt` y `lastActivityAt` tendrán el mismo tiempo autoritativo actual de MongoDB. Se emitirá `MatchCreated`.

El ingreso mediante `POST /api/matches/{matchId}/join` solo aplica mientras el estado permita el ingreso; para este ADR, el ingreso ocurre en `Waiting`. No cambia el estado. Cuando el ingreso es correcto, `joinedAt`, `lastHeartbeatAt` y `lastActivityAt` se actualizan con el tiempo autoritativo de MongoDB. Se emite `PlayerJoined`.

Mientras la sala está en `Waiting`, un participante puede salir mediante `POST /api/matches/{matchId}/leave`. Una salida correcta no cambia el estado, actualiza `lastActivityAt` con el tiempo autoritativo de MongoDB y emite `PlayerLeft`.

El inicio mediante `POST /api/matches/{matchId}/start` solo puede solicitarse desde `Waiting` y por el owner o creador de la sala: la identidad autenticada debe corresponder a `createdBy`. Una solicitud correcta realiza la transición `Waiting` -> `Starting`, actualiza `lastActivityAt` con el tiempo autoritativo de MongoDB y emite `MatchStarting`. Cuando Matchmaking completa correctamente su procesamiento de inicio, realiza la transición `Starting` -> `Started`, vuelve a actualizar `lastActivityAt` con el tiempo autoritativo y emite `MatchStarted`. Este ADR no define lógica específica de ningún juego.

Una sala `Started` pasa de `Started` -> `Finished` mediante el callback REST service-to-service `POST /api/matches/{matchId}/finish`. El endpoint no es una acción del usuario ni del Shell y su body no transporta resultados, ganador, puntajes ni lógica específica del juego: únicamente notifica que la partida identificada terminó. Los resultados continúan bajo responsabilidad exclusiva del Game Service.

El Game Service llamante utilizará OAuth2 Machine-to-Machine mediante Auth0 y obtendrá un access token dirigido a Matchmaking. Matchmaking validará la firma y vigencia del token, el audience correspondiente al Matchmaking Service, el permiso/scope `matches.finish` y la identidad del servicio llamante. Además, comprobará que esa identidad M2M esté autorizada para el `gameType` de la sala; conceptualmente, Typing Service podrá finalizar `typing`, Trivia Service `trivia` y Memory Service `memory`. Un servicio no podrá finalizar partidas de otro tipo. La asociación identidad M2M -> `gameType` se mantendrá en configuración del servicio y no se hardcodeará como secreto.

El callback solo puede efectuar `Started` -> `Finished` mediante una operación atómica, condicional e idempotente. Solo si esa transición modifica exitosamente la sala, `lastActivityAt` se actualiza con el tiempo autoritativo y se emite `MatchFinished`. Si un retry del mismo Game Service encuentra la sala en `Finished`, no realiza otra transición ni emite otro evento y puede tratarse como éxito idempotente. Si la sala está en cualquier otro estado incompatible, incluido `Cancelled`, la solicitud se rechaza sin modificar timestamps.

No habrá un timeout adicional específico para esperar el callback de finalización. `match expiration` será el límite absoluto: si la sala continúa en `Started` sin una notificación válida cuando se alcanza, cleanup la transiciona a `Cancelled` y emite `MatchDeleted`. Un callback posterior no puede convertirla en `Finished`.

El owner puede cancelar mediante `DELETE /api/matches/{matchId}` una sala que todavía no haya comenzado. Se permiten las transiciones `Waiting` -> `Cancelled` y `Starting` -> `Cancelled`; ambas actualizan `lastActivityAt` con el tiempo autoritativo. Una transición exitosa a `Cancelled` emite el evento existente `MatchDeleted` en el momento de la cancelación lógica y la sala deja de aparecer como sala activa del lobby. No se permite cancelar manualmente desde `Started` ni desde `Finished`. La transición `Started` -> `Cancelled` queda reservada exclusivamente a la expiración del sistema. No se introduce un evento `MatchCancelled`.

Cuando una sala no terminal alcanza `match expiration`, cleanup intenta atómicamente `Waiting`, `Starting` o `Started` -> `Cancelled`, comparando el estado esperado y la condición de expiración. La operación actualiza `lastActivityAt` con el tiempo autoritativo y emite `MatchDeleted` solamente si la transición se realizó exitosamente. Después, la sala queda sujeta a `terminal-state retention` antes de su eliminación física.

`Finished` y `Cancelled` son estados terminales persistidos y no tienen transiciones posteriores de negocio. Una sala en cualquiera de esos estados puede mantenerse almacenada hasta que venza `terminal-state retention`. Su eliminación física posterior por cleanup es únicamente una operación de persistencia y retención: no constituye otro estado ni vuelve a emitir un evento ya emitido por la transición de negocio. En particular, eliminar físicamente una sala `Cancelled` no vuelve a emitir `MatchDeleted`.

### Timestamps de actividad

`lastActivityAt` se actualizará con tiempo autoritativo de MongoDB cuando ocurra correctamente cualquiera de estas acciones:

- creación de la sala;
- join;
- leave;
- heartbeat válido;
- transición `Waiting` -> `Starting`;
- transición `Starting` -> `Started`;
- transición `Started` -> `Finished`;
- transición a `Cancelled`.

Una ejecución del worker que solamente inspeccione una sala no actualizará `lastActivityAt`. Una operación rechazada tampoco actualizará `lastActivityAt` ni ningún timestamp asociado a esa operación.

Para `lastHeartbeatAt` y `lastActivityAt`, cada actualización será monotónica y se realizará conceptualmente como `max(valorActual, databaseNow)`. Si por una anomalía de reloj el tiempo obtenido de MongoDB fuese anterior al valor almacenado, no se rechazará una operación o heartbeat que sea válido por las demás condiciones, no se hará retroceder el timestamp y se conservará el valor almacenado. La infraestructura debe mantener una sincronización de reloj adecuada, pero la lógica no dependerá del reloj de una instancia web individual.

### Ownership

`createdBy` identifica al owner o creador de la sala y es inmutable durante toda su vida. El ownership se basa en la identidad autenticada, no en una conexión SignalR concreta. Si el owner pierde temporalmente la conexión, puede reconectarse y, usando la misma identidad autenticada/JWT, continúa siendo owner. Las operaciones que modifican el ciclo global de la sala, `start` y `cancel`, requieren que la identidad autenticada coincida con `createdBy`.

No habrá transferencia automática de ownership en esta versión: otro participante no puede asumir `createdBy` ni ejecutar `start` o `cancel` en nombre del owner. Tampoco habrá un `owner action timeout` independiente. Si el owner no regresa, la sala queda protegida por los mecanismos normales de expiración, incluido el límite absoluto de `match expiration` contado desde `createdAt`, que no puede extenderse mediante actividad o heartbeats.

Heartbeat no requiere que el usuario sea owner, sino que sea participante actual de la sala. Join y leave mantienen la semántica del contrato existente y este ADR no añade decisiones de autorización para esas operaciones más allá de lo necesario para definir el ciclo de vida descrito.

### Heartbeat e identidad

Se mantiene exactamente el contrato existente `Heartbeat(matchId)`; no se agrega `userId`. Su procesamiento seguirá estas reglas:

1. El usuario debe estar autenticado.
2. La identidad se obtiene del contexto autenticado o JWT mediante un identificador estable del usuario, por ejemplo el claim `subject`/`sub`; no se depende de un `userId` enviado por el cliente.
3. Matchmaking busca la sala indicada por `matchId`.
4. El usuario autenticado debe aparecer actualmente entre los participantes de esa sala.
5. Si el usuario no pertenece a la sala, el heartbeat se rechaza y no cambian `lastHeartbeatAt` ni `lastActivityAt`.
6. Si `matchId` no existe, el heartbeat se rechaza y no se modifica ningún timestamp.
7. El timestamp nunca se recibe desde el cliente ni desde otro sistema externo; Matchmaking no acepta timestamps de heartbeat proporcionados externamente. Por ello no existe un «máximo tiempo atrás permitido» para timestamps enviados por clientes.
8. Para un heartbeat válido, `participant.lastHeartbeatAt` y `match.lastActivityAt` se actualizan del lado de MongoDB con `max(valorActual, databaseNow)`.
9. Si `databaseNow` fuese anterior al valor almacenado, el heartbeat válido no se rechaza y se conserva el valor almacenado.

Recibir un heartbeat y evaluar un heartbeat almacenado que ya venció son hechos distintos. Un heartbeat válido recibido actualiza los timestamps indicados. Para cleanup, una sala con participantes será candidata por «sin heartbeat» solamente cuando ninguno de sus participantes tenga un `lastHeartbeatAt` dentro de la ventana válida definida por `heartbeat timeout`.

Un único participante con heartbeat vencido no provocará por sí solo la eliminación de toda la sala cuando existan otros participantes activos. Las políticas de expulsión individual por heartbeat vencido quedan fuera del alcance.

### Categorías de cleanup

El `heartbeat timeout`, el `inactivity timeout`, la expiración de la partida (`match expiration`), el intervalo de limpieza (`cleanup interval`) y la retención de estados terminales (`terminal-state retention`) serán configuración externa del servicio, no constantes codificadas. Este ADR no fija segundos ni minutos concretos.

El worker evaluará conceptualmente estas categorías:

- **Sala `Waiting` vacía**: está en `Waiting`, no tiene participantes y su `lastActivityAt` ha superado el `inactivity timeout` configurado.
- **Sala `Waiting` inactiva**: está en `Waiting` y su `lastActivityAt` ha superado el `inactivity timeout`.
- **Sala sin heartbeat válido**: tiene participantes y ninguno posee un `lastHeartbeatAt` dentro de la ventana de `heartbeat timeout`.
- **Sala expirada**: es una sala no terminal que alcanzó el `match expiration`, un límite absoluto contado desde `createdAt`. No se renueva por heartbeat, join, leave ni otros cambios de `lastActivityAt`; por tanto, impide que una sala viva indefinidamente aunque el owner desaparezca y otros participantes sigan activos.
- **Sala terminal**: está en `Finished` o `Cancelled` y su `lastActivityAt` ha superado `terminal-state retention`.

Estas categorías determinan candidatas; antes de modificar o eliminar una sala, el worker volverá a comprobar atómicamente las condiciones que justificaron la candidatura.

`inactivity timeout` mide falta de actividad mediante `lastActivityAt`, `heartbeat timeout` detecta ausencia de participantes con heartbeat vigente y `match expiration` limita absolutamente la vida no terminal desde `createdAt`; son mecanismos distintos y no se sustituyen ni se renuevan entre sí. Todos los cutoffs temporales de cleanup se evaluarán respecto de la misma referencia temporal autoritativa de MongoDB, evitando decisiones diferentes por relojes locales distintos entre instancias.

### Seguridad con múltiples instancias

Varias réplicas del Matchmaking Service pueden ejecutar sus `BackgroundService` simultáneamente. En la versión inicial no se utilizará lock distribuido ni elección de líder. La seguridad se garantizará con operaciones MongoDB atómicas, condicionales e idempotentes.

Cada modificación o eliminación incluirá en su filtro `matchId`, el estado esperado y la condición temporal que hizo candidata a la sala. Por ejemplo, una sala detectada como `Waiting` e inactiva solo podrá modificarse si, al ejecutar la operación, sigue en `Waiting` y conserva un `lastActivityAt` anterior al cutoff evaluado con el tiempo autoritativo. Si otra instancia ya actualizó, cambió de estado o eliminó la sala y esas condiciones dejaron de cumplirse, la operación no encontrará coincidencia y no tendrá efecto adicional.

Las transiciones de estado también compararán atómicamente el estado esperado. Por ejemplo, `Waiting` -> `Starting` solo tendrá éxito si, al ejecutar la actualización, el documento continúa en `Waiting`. De esta forma, dos instancias no podrán completar simultáneamente la misma transición.

Solamente la instancia cuya operación atómica haya modificado, efectuado la transición o eliminado exitosamente el documento emitirá el evento SignalR correspondiente. Una instancia cuya operación no encuentre coincidencia no emitirá el evento, evitando duplicados producidos por workers concurrentes.

Como ejemplo conceptual, dos workers A y B pueden detectar una misma sala no terminal expirada. A ejecuta primero la transición condicional a `Cancelled` y emite `MatchDeleted`. B ejecuta la misma operación, pero ya no encuentra un documento que cumpla el estado esperado. La transición ocurre una sola vez y B no emite un evento duplicado. La eliminación física solo podrá ocurrir posteriormente, una vez vencida `terminal-state retention`.

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

Este ADR mantiene `Heartbeat(matchId)` y los nombres de los eventos SignalR existentes, pero introduce una integración service-to-service visible para otros equipos. Si el ADR es aceptado, `docs/03-contratos-tecnicos.md` deberá incorporar formalmente `POST /api/matches/{matchId}/finish` y su autorización service-to-service.

- **Equipo 1 — Plataforma/Identidad**: deberá soportar y configurar en el tenant compartido los clientes, audience y permisos Auth0 M2M necesarios, incluido el scope `matches.finish`.
- **Equipo 2 — Matchmaking**: implementará el callback, validará el token, el scope, la identidad llamante y la autorización identidad M2M -> `gameType`, y garantizará la transición y emisión idempotentes.
- **Equipo 3 — Shell**: no llamará el endpoint `finish`; continuará recibiendo `MatchFinished` y `MatchDeleted` mediante el Lobby Hub.
- **Equipos 4, 5 y 6 — Game Services**: invocarán `POST /api/matches/{matchId}/finish` al terminar correctamente una partida y usarán autenticación M2M. Continuarán siendo propietarios exclusivos de resultados, puntajes y estadísticas.

## Fuera del alcance

Quedan fuera del alcance:

- los valores concretos de timeout;
- la lógica específica de los juegos;
- los resultados, puntajes y estadísticas;
- la expulsión individual por heartbeat vencido;
- la transferencia de ownership, que no existe en esta versión.
