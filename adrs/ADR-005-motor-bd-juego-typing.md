# ADR-005: Motor de base de datos para Typing Battle

- **Estado:** Propuesto
- **Fecha:** 2026-09-28
- **Equipo/Autor:** Equipo 4 — Typing Battle

## Contexto

El microservicio de **Typing Battle** necesita persistir los resultados de las partidas de forma independiente, incluyendo jugadores, puntuaciones, fechas, ganador y métricas propias del juego como palabras por minuto, precisión y errores.

También debe permitir consultar resultados por partida, historial por jugador y estadísticas agregadas mediante la API REST definida para Typing Battle.

Debido a que varios usuarios pueden jugar y finalizar partidas al mismo tiempo, se necesita una base de datos que maneje correctamente accesos concurrentes y mantenga la integridad de los resultados.

El backend será desarrollado en **.NET 10**, por lo que se busca una opción con buena integración con **Entity Framework Core**.

## Decisión

Se utilizará **MySQL** como motor de base de datos para Typing Battle y **Entity Framework Core** para el acceso a datos.

MySQL permite manejar múltiples conexiones concurrentes y utilizar transacciones para mantener la integridad de la información cuando varias partidas guardan resultados al mismo tiempo.

La base de datos almacenará la información necesaria para:

- consultar una partida por `matchId`;
- obtener el historial de un jugador;
- almacenar puntuaciones y resultados;
- calcular estadísticas como WPM, precisión y victorias.

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| **SQLite** | Tiene limitaciones de concurrencia de escritura cuando varios usuarios guardan resultados simultáneamente. |
| **PostgreSQL** | Es una alternativa válida, pero el equipo decidió utilizar MySQL para las necesidades actuales del proyecto. |
| **MongoDB** | Es flexible, pero los datos principales de partidas y jugadores pueden manejarse correctamente con un modelo relacional. |

## Consecuencias

### Positivas

- Permite múltiples conexiones concurrentes.
- Proporciona transacciones e integridad de datos.
- Buena integración con .NET y Entity Framework Core.
- Adecuado para resultados, historial y estadísticas.
- Mantiene la persistencia independiente de Typing Battle.

### Negativas / riesgos asumidos

- Requiere configurar un servidor MySQL.
- El equipo deberá mantener una configuración consistente para desarrollo y pruebas.
- El pipeline de CI/CD necesitará una instancia de MySQL para las pruebas de integración.

## Impacto en otros equipos

La decisión afecta únicamente la persistencia interna de **Typing Battle**.

No modifica los contratos REST, SignalR ni las responsabilidades de otros equipos. Matchmaking seguirá siendo responsable del ciclo de vida de la sala, mientras Typing Battle será responsable de almacenar los resultados de sus partidas.