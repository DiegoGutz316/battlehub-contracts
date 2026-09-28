\# ADR-005: Motor de base de datos para Typing Battle



\- \*\*Estado:\*\* Propuesto

\- \*\*Fecha:\*\* 2026-09-28

\- \*\*Equipo/Autor:\*\* Equipo 4 — Typing Battle



\## Contexto



El microservicio de \*\*Typing Battle\*\* necesita persistir los resultados de las partidas de forma independiente, incluyendo jugadores, puntuaciones, fechas, ganador y métricas propias del juego como palabras por minuto, precisión y errores.



También debe permitir consultar resultados por partida, historial por jugador y estadísticas agregadas mediante la API REST definida para Typing Battle.



El backend será desarrollado en \*\*.NET 10\*\*, por lo que se busca una opción sencilla de integrar con \*\*Entity Framework Core\*\*, fácil de ejecutar localmente y que no requiera infraestructura adicional para cada integrante del equipo.



\## Decisión



Se utilizará \*\*SQLite\*\* como motor de base de datos para Typing Battle y \*\*Entity Framework Core\*\* para el acceso a datos.



SQLite permitirá mantener persistencia propia sin requerir un servidor de base de datos adicional y facilitará el desarrollo local, las pruebas de integración y el CI/CD.



La base de datos almacenará la información necesaria para:



\- consultar una partida por `matchId`;

\- obtener el historial de un jugador;

\- calcular estadísticas como puntuación, WPM, precisión y victorias.



\## Alternativas consideradas



| Alternativa | Por qué no se eligió |

|---|---|

| \*\*PostgreSQL\*\* | Requiere configurar un servidor o contenedor adicional para desarrollo y pruebas. |

| \*\*SQL Server\*\* | Tiene buena integración con .NET, pero agrega más infraestructura de la necesaria para el alcance actual. |

| \*\*MongoDB\*\* | Es flexible, pero el modelo de partidas y jugadores puede manejarse correctamente con un modelo relacional. |



\## Consecuencias



\### Positivas



\- Integración directa con .NET y Entity Framework Core.

\- Configuración sencilla para todos los integrantes del equipo.

\- Facilita las pruebas de integración.

\- Simplifica el pipeline de CI/CD.

\- Mantiene la persistencia de Typing Battle independiente de los demás servicios.



\### Negativas / riesgos asumidos



\- SQLite tiene menor capacidad de concurrencia que PostgreSQL o SQL Server.

\- Si el proyecto aumenta considerablemente en carga o escalabilidad, podría ser necesario cambiar de motor en el futuro.



\## Impacto en otros equipos



La decisión afecta únicamente la persistencia interna de \*\*Typing Battle\*\*.



No modifica los contratos REST, SignalR ni las responsabilidades de otros equipos. Matchmaking seguirá siendo responsable del ciclo de vida de la sala, mientras Typing Battle será responsable de almacenar los resultados de sus partidas.

