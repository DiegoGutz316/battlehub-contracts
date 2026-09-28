# ADR-004: Ciclo de vida, heartbeat y limpieza automática de salas de Matchmaking

- **Estado**: Propuesto
- **Fecha**: 2026-09-28 (UTC)
- **Equipo/Autor**: Equipo 2 - Matchmaking & Lobby Service

## Contexto

Los contratos de `battlehub-contracts` ya fijan para Matchmaking el backend en .NET 10, MongoDB, la base URL `/api/matches`, el hub `/hubs/lobby`, los endpoints oficiales, los eventos SignalR oficiales y el uso de timestamps UTC. También establecen que Matchmaking administra el ciclo de vida de las salas, pero no implementa lógica específica de los juegos ni persiste sus resultados. Estas decisiones no se revisan ni se modifican en este ADR.

Los contratos exigen la limpieza automática de salas vacías, abandonadas, sin heartbeat o expiradas. Sin embargo, todavía no definen el mecanismo que ejecutará esa limpieza, cómo se representará la actividad de una sala, cómo se utilizará el heartbeat para detectar abandono, qué estados internos necesita la sala para gestionar su ciclo de vida ni cómo se configurarán los umbrales de tiempo.

El Equipo 2 necesita formalizar esas decisiones internas para implementar el requisito de limpieza sin alterar los contratos REST o SignalR existentes.

## Decisión

Se utilizará un `BackgroundService` de .NET, registrado como servicio hospedado (`IHostedService`), para ejecutar periódicamente la limpieza automática de salas. Este worker se ejecutará dentro del proceso del Matchmaking Service; en esta versión inicial no se utilizará un cron o job externo. El intervalo de ejecución se obtendrá de la configuración del servicio.

Cada sala mantendrá conceptualmente timestamps suficientes para determinar su actividad, incluyendo `createdAt` y `lastActivityAt`. Cada participante mantendrá `joinedAt` y `lastHeartbeatAt`. Todos se manejarán y almacenarán en UTC. Estos nombres describen el modelo interno necesario para la implementación y no crean ni modifican un contrato REST.

Los estados internos propuestos para la sala son:

- `Waiting`
- `Starting`
- `Started`
- `Finished`
- `Cancelled`

Estos estados representan el ciclo interno necesario para implementar el campo `status` ya existente y los eventos SignalR definidos por `battlehub-contracts`. No se incorporan estados adicionales mediante este ADR.

El heartbeat mantiene el contrato existente `Heartbeat(matchId)` y no incorpora un `userId`. La identidad del participante se obtendrá del contexto autenticado. Un heartbeat válido actualizará `lastHeartbeatAt` y la actividad de la sala. Conceptualmente, una sala podrá considerarse sin heartbeat cuando no exista actividad válida de sus participantes dentro del umbral configurado. Este ADR no define políticas detalladas de expulsión individual de participantes.

El `heartbeat timeout`, el `inactivity timeout`, la expiración de la partida (`match expiration`), el intervalo de limpieza (`cleanup interval`) y la retención de estados terminales (`terminal-state retention`) serán configuración externa del servicio, no constantes codificadas. Este ADR no fija valores concretos.

Según esa configuración, el worker podrá identificar salas `Waiting` vacías, salas `Waiting` inactivas, salas sin actividad o heartbeat válido, salas expiradas y salas terminales cuyo periodo de retención haya vencido. Las operaciones de limpieza deberán ser idempotentes y seguras ante ejecuciones repetidas. Este ADR no define reglas específicas de eliminación por jugador.

MongoDB ya está fijado por la arquitectura y no se decide en este ADR.

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| Cron o job externo | Separaría la ejecución del proceso web y facilitaría una evolución con múltiples instancias, pero agrega infraestructura, despliegue y operación que no son necesarios para la versión inicial. |
| Limpieza oportunista al recibir requests | Depende de que exista tráfico y no garantiza que las salas inactivas se detecten y limpien de manera oportuna. |

Si en el futuro existen múltiples instancias del servicio, ejecutar el mismo worker en cada instancia puede requerir coordinación distribuida o trasladar la limpieza a un job externo.

## Consecuencias

- Positivas:
  - El ciclo de vida interno de las salas queda explícito.
  - Se pueden detectar salas inactivas.
  - Los tiempos son configurables.
  - La versión inicial requiere menos infraestructura.
  - La solución se integra de forma natural con .NET.
- Negativas / riesgos asumidos:
  - El worker está unido al proceso web.
  - Los reinicios del servicio interrumpen temporalmente su ejecución.
  - Múltiples réplicas podrían ejecutar la limpieza concurrentemente.
  - Las operaciones de limpieza deberán ser idempotentes.

## Impacto en otros equipos

Este ADR no cambia las rutas REST ni las firmas de los endpoints existentes. Tampoco cambia los nombres o las firmas SignalR: `Heartbeat(matchId)` permanece igual. Los estados definidos aclaran los valores que puede representar el campo `status` existente, por lo que el Shell puede observarlos mediante los contratos actuales. No se requieren nuevos endpoints ni cambios en las APIs de los juegos.

El impacto en otros equipos es limitado: este ADR formaliza principalmente decisiones internas del Equipo 2 para implementar requisitos ya establecidos.

Quedan fuera del alcance el mecanismo mediante el cual un Game Service notificará a Matchmaking que la partida finalizó, los valores concretos de timeout, la lógica específica de los juegos y las políticas detalladas de expulsión individual. Una vez notificado el fin de la partida, Matchmaking podrá emitir el evento `MatchFinished` conforme al contrato SignalR existente. Este ADR no define cómo se realizará esa notificación, que podrá requerir un ADR separado posterior porque el contrato actual no la especifica completamente.
