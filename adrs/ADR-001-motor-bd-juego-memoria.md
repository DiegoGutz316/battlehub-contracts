# ADR-001: Motor de base de datos para el juego de memoria



* **Estado**: Propuesto
* **Fecha**: 2026-09-20 (UTC)
* **Equipo/Autor**: Equipo 6 (Pablo)

## Contexto

El microservicio del juego de memoria (`battlehub-game-memory`) necesita persistir partidas jugadas, resultados y estadísticas de forma propia e independiente del resto de los servicios de la plataforma, según lo establecido en `04-persistencia-y-api-juegos.md`.

Los datos del dominio son claramente relacionales: jugador, partida, tablero y resultado tienen relaciones fijas y bien definidas. Además, al finalizar una partida se requiere registrar resultado, actualizar estadísticas y notificar a Matchmaking de forma consistente, si una de esas escrituras falla, no debe quedar un resultado a medio guardar, por lo que se necesita un motor con soporte transaccional (ACID).

El stack de backend ya está fijo en .NET 10 para todos los servicios, por lo que el motor elegido debe tener soporte con Entity Framework Core. SQL Server es el proveedor de EF Core con soporte más directo y mejor documentado por el propio equipo de .NET, y además permite almacenar el estado del tablero como JSON dentro de una columna relacional cuando se necesite, sin sacrificar la estructura relacional del resto del modelo.

Como factor adicional (no determinante por sí solo), todo el equipo tiene experiencia previa trabajando con SQL Server en cursos anteriores, lo que reduce el riesgo de retrasos por curva de aprendizaje dentro del tiempo limitado del proyecto.

## Decisión

Se usará **SQL Server** como motor de base de datos para el microservicio del juego de memoria, con desarrollo local mediante SQL Server LocalDB, y Azure SQL Database (free tier) como opción si el proyecto requiere que el servicio esté accesible en línea para pruebas de integración con otros equipos.

## Alternativas consideradas

|Alternativa|Por qué no se eligió|
|-|-|
|PostgreSQL|Motor relacional igualmente válido para este dominio, con buen soporte EF Core y hosting gratuito más variado; se descartó por menor familiaridad del equipo, no por una limitación técnica frente al problema.|
|MongoDB|Los datos del dominio (jugadores, partidas, resultados) son claramente relacionales, con relaciones fijas entre entidades; un motor documental no ofrece transacciones ACID multi-documento tan maduras y complica el mapeo con EF Core sin aportar ventaja real sobre el modelo relacional.|

## Consecuencias

* Positivas:

  * Todo el equipo puede empezar a desarrollar de inmediato sin curva de aprendizaje adicional.
  * Integración directa y madura con .NET 10 / Entity Framework Core.
  * Desarrollo local sin costo mediante LocalDB o Docker.
* Negativas / riesgos asumidos:

  * Si se necesita hosting en línea, las opciones gratuitas de SQL Server (Azure SQL free tier) son menos variadas que las de PostgreSQL.
  * Requiere cuenta de Azure (con verificación por tarjeta, aunque sin cobro dentro del tier gratuito) si se necesita exponer el servicio fuera de una máquina local.

## Impacto en otros equipos

No. Esta decisión no modifica ningún contrato REST, de SignalR, visual ni de ciclo de vida de `battlehub-contracts` — es una decisión interna de persistencia del Equipo 6. Se documenta aquí únicamente porque el motor de base de datos de cada juego es uno de los puntos que el proyecto exige resolver formalmente con ADR, no porque afecte a otros equipos.

