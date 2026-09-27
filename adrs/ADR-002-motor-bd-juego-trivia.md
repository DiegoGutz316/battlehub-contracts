# ADR-002: Persistencia del juego de trivia con SQL Server

- **Estado**: Propuesto
- **Fecha**: 2026-09-26 (UTC)
- **Equipo/Autor**: Equipo 5

## Contexto

Trivia Battle necesita persistir información relacionada con las partidas jugadas, incluyendo como mínimo el identificador de la partida (`matchId`), jugadores participantes, puntajes, fecha y hora de inicio y finalización, ganador y datos específicos del juego. También debe permitir consultar posteriormente resultados, historial de partidas y estadísticas de los jugadores.

## Decisión

El Equipo 5 propone usar **SQL Server** como base de datos del microservicio de trivia, con **Entity Framework Core** como ORM y migraciones versionadas en el repositorio.

El banco inicial de preguntas y los demás datos de ejemplo se cargarán mediante un **script independiente de inicialización** que podrá ejecutarse cuando sea necesario. Estos datos no formarán parte de las migraciones ni del código de la aplicación, evitando mantener un volumen innecesariamente grande de datos dentro del código fuente.

El campo `metadata` de cada resultado se almacenará como una columna JSON.

En el pipeline de CI, las pruebas de integración usarán un contenedor efímero de SQL Server levantado con Testcontainers.

## Alternativas consideradas

### PostgreSQL

Cubre las mismas necesidades, incluyendo soporte para JSON mediante `jsonb` y un buen proveedor para Entity Framework Core. También cuenta con más opciones de hosting gratuito.

No se eligió porque el equipo se siente más cómodo con las herramientas de SQL Server y su integración con Visual Studio y SSMS, lo que reduce el tiempo de arranque.

### MongoDB

Un documento por partida encajaría bien con el `metadata` libre, pero las estadísticas por categoría requieren relacionar resultados con el banco de preguntas, algo más natural mediante un modelo relacional.

### Archivos JSON para el banco de preguntas

Se consideró almacenar el banco de preguntas en archivos JSON y utilizar SQL Server únicamente para los resultados y estadísticas.

Para esta decisión se optó por almacenar el banco de preguntas en SQL Server y utilizar un script independiente para cargar los datos iniciales de ejemplo. No obstante, el acceso a las preguntas se mantendrá abstraído mediante IQuestionRepository, permitiendo cambiar el mecanismo de persistencia en una versión futura sin modificar la lógica principal del juego.

## Consecuencias

- Positivas:
  - SQL Server permite modelar los resultados y estadísticas del juego mediante un esquema relacional.
  - La selección de preguntas puede realizarse mediante consultas filtradas por categoría y dificultad cuando el banco de preguntas se encuentre en la base de datos.
  - Las migraciones de Entity Framework Core permiten versionar el esquema de la base de datos, mientras que un script independiente permite cargar de forma controlada los datos iniciales de ejemplo.
  - El `metadata` en JSON permite agregar nuevos datos del juego sin modificar inmediatamente el esquema.

- Negativas / riesgos asumidos:
  - El contenedor de SQL Server tarda más en arrancar que otros motores, lo que alarga la ejecución de las pruebas de integración en el CI.
  - Consultar dentro de la columna JSON es menos cómodo que con `jsonb` de PostgreSQL; si se necesitan estadísticas frecuentes sobre un dato del `metadata`, habrá que moverlo a una columna propia.
  - Si el despliegue requiere un SQL Server accesible en línea, habrá que conseguir una instancia administrada, con menos opciones gratuitas que otros motores.

## Impacto en otros equipos

Ninguno sobre los contratos de `battlehub-contracts`. La API REST de resultados, el hub `/hubs/trivia` y el contrato del microfrontend no dependen del motor elegido. Esta es una decisión interna del Equipo 5, documentada porque el proyecto exige resolver con un ADR el motor de base de datos de cada juego.
