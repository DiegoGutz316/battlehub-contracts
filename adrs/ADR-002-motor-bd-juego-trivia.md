# ADR-002: Persistencia del juego de trivia con SQL Server

- **Estado**: Propuesto
- **Fecha**: 2026-09-26 (UTC)
- **Equipo/Autor**: Equipo 5

## Contexto

Trivia Battle necesita persistir información relacionada con las partidas jugadas, incluyendo como mínimo el identificador de la partida (`matchId`), jugadores participantes, puntajes, fecha y hora de inicio y finalización, ganador y datos específicos del juego. También debe permitir consultar posteriormente resultados, historial de partidas y estadísticas de los jugadores.

## Decisión

El Equipo 5 propone usar **SQL Server** como base de datos del microservicio de trivia, con **Entity Framework Core** como ORM y migraciones versionadas en el repositorio. El banco de preguntas se cargará mediante datos semilla en las migraciones, y el campo `metadata` de cada resultado se almacenará como una columna JSON. En el pipeline de CI, las pruebas de integración usarán un contenedor efímero de SQL Server levantado con Testcontainers.

## Alternativas consideradas

### PostgreSQL

Cubre las mismas necesidades, incluyendo transacciones, soporte para JSON mediante `jsonb` y un buen proveedor para Entity Framework Core. También cuenta con más opciones de hosting gratuito.

No se eligió porque el equipo se siente más cómodo con las herramientas de SQL Server y su integración con Visual Studio y SSMS, lo que reduce el tiempo de arranque.

### MongoDB

Un documento por partida encajaría bien con el `metadata` libre, pero las estadísticas por categoría requieren relacionar resultados con el banco de preguntas, algo más natural mediante un modelo relacional.

### Archivos JSON para el banco de preguntas

Se consideró almacenar el banco de preguntas en archivos JSON y guardar únicamente los resultados en la base de datos.

Esta alternativa simplifica el arranque, pero obliga a redesplegar el servicio para agregar o corregir preguntas y dificulta consultar el rendimiento por categoría directamente desde la base de datos.

## Consecuencias

- Positivas:
  - Preguntas y resultados conviven en un mismo modelo, lo que permite calcular estadísticas por categoría con consultas SQL directas (`GROUP BY` por categoría).
  - La selección aleatoria de preguntas filtradas por categoría y dificultad se resuelve en la propia consulta.
  - Las migraciones de EF Core versionan tanto el esquema como el banco de preguntas inicial, así que cualquier integrante (y el CI) obtiene la misma base de datos con un solo comando.
  - El `metadata` en JSON permite agregar nuevos datos del juego (por ejemplo, tiempo promedio de respuesta) sin cambiar el esquema.

- Negativas / riesgos asumidos:
  - El contenedor de SQL Server tarda más en arrancar que otros motores, lo que alarga la ejecución de las pruebas de integración en el CI.
  - Consultar dentro de la columna JSON es menos cómodo que con `jsonb` de PostgreSQL; si se necesitan estadísticas frecuentes sobre un dato del `metadata`, habrá que moverlo a una columna propia.
  - Si el despliegue requiere un SQL Server accesible en línea, habrá que conseguir una instancia administrada, con menos opciones gratuitas que otros motores.

## Impacto en otros equipos

Ninguno sobre los contratos de `battlehub-contracts`. La API REST de resultados, el hub `/hubs/trivia` y el contrato del microfrontend no dependen del motor elegido. Esta es una decisión interna del Equipo 5, documentada porque el proyecto exige resolver con un ADR el motor de base de datos de cada juego.
