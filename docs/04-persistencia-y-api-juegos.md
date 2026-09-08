# Persistencia y API Propia por Juego

Este es un requisito obligatorio para los equipos de Typing, Trivia y Memory: no basta con implementar el hub de SignalR de cada juego; cada juego debe comportarse como un microservicio completo con su propia base de datos y su propia API REST.

## Por qué

- Evita que el resultado de una partida viva solo en memoria del proceso del hub (se pierde si el servicio se reinicia).
- Permite construir historial y estadísticas por jugador.
- Refuerza el objetivo académico de "arquitectura distribuida": cada juego es autónomo y no depende de la base de datos de otro equipo.

## Qué debe persistir cada juego

Como mínimo, cada partida jugada debe guardar (fechas en UTC, formato ISO-8601 con sufijo `Z`):

```json
{
  "matchId": "match-001",
  "gameType": "trivia",
  "players": [
    { "userId": "user-001", "displayName": "Francisco", "score": 850 },
    { "userId": "user-002", "displayName": "Ana", "score": 620 }
  ],
  "startedAt": "2026-09-02T20:00:00Z",
  "finishedAt": "2026-09-02T20:07:32Z",
  "winnerUserId": "user-001",
  "metadata": {}
}
```

`metadata` es libre para cada juego (ej. Typing puede guardar palabras por minuto y precisión; Trivia puede guardar aciertos/fallos por categoría; Memory puede guardar intentos y tiempo de resolución).

## Elección de base de datos

Cada equipo de juego elige su motor de base de datos (MySQL, PostgreSQL, MongoDB, SQLite, etc.) y lo documenta con un ADR en `battlehub-contracts/adrs` (ver `06-adr-template.md`). No es necesario unificar el motor entre los tres juegos: es parte del aprendizaje de persistencia políglota.

## API REST mínima obligatoria por juego

Base URL sugerida (`{game}` es `typing`, `trivia` o `memory`):

```http
/api/games/{game}/results
```

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/games/{game}/results` | Registrar el resultado de una partida finalizada |
| GET | `/api/games/{game}/results/{matchId}` | Obtener el resultado detallado de una partida |
| GET | `/api/games/{game}/players/{userId}/history` | Obtener el historial de partidas de un jugador |
| GET | `/api/games/{game}/players/{userId}/stats` | Obtener estadísticas agregadas del jugador (ej. promedio, mejor puntaje) |

Esta API es invocada por el propio microservicio del juego al finalizar una partida (desde el backend del hub, no desde el microfrontend directamente), y puede ser consultada por el microfrontend para mostrar historial/estadísticas al usuario.

## Relación con Matchmaking

- Matchmaking sigue siendo el dueño del ciclo de vida de la sala (crear/unirse/iniciar/cancelar).
- El juego es dueño del ciclo de vida de la partida jugada y su resultado.
- Al finalizar, el juego notifica a Matchmaking (vía HTTP o el evento SignalR ya existente) que la partida terminó, para que Matchmaking pueda limpiar la sala; esto no implica que Matchmaking almacene el resultado.

## Pruebas de integración obligatorias sobre esta API

Cada equipo de juego debe incluir al menos:

- Una prueba de integración que levante la API contra una base de datos real o en contenedor (ej. Testcontainers, SQLite en archivo temporal, Mongo en memoria) y valide el flujo `POST /results` -> `GET /results/{matchId}`.
- Una prueba de integración que valide `GET /players/{userId}/history` con más de un resultado guardado.

Ver `05-cicd-testing-commits.md` para el detalle de la estrategia de pruebas exigida en todos los repositorios.
