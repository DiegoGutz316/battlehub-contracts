# battlehub-contracts

Repositorio de arquitectura, contratos y gobernanza del proyecto **BattleHub**.

Este es el **único repositorio propiedad del Tech Lead** (docente/administrador del proyecto). Todos los demás repositorios son propiedad de cada equipo, quienes otorgan al Tech Lead acceso como **colaborador (contributor)**, no como administrador.

Este repo es la fuente de verdad del proyecto. Ningún equipo puede modificar un contrato aquí definido sin abrir un ADR (ver `06-adr-template.md`) y obtener aprobación del Tech Lead. Todos los ADRs del proyecto, sin importar qué equipo los propone, se almacenan en la carpeta `/adrs` de este repositorio.

## Contenido

| Documento | Contenido |
|---|---|
| `01-gobernanza-repositorios.md` | Quién es dueño de qué, permisos, estructura de repos, `.gitignore`, rama `main` |
| `02-arquitectura-y-flujo.md` | Visión general del sistema, responsabilidades por equipo, flujo end-to-end |
| `03-contratos-tecnicos.md` | Contratos REST, eventos SignalR, contrato de microfrontend y ciclo de vida de juego |
| `04-persistencia-y-api-juegos.md` | Requisito obligatorio de persistencia y API propia por cada juego |
| `05-cicd-testing-commits.md` | Convención de commits semánticos, pipelines de CI/CD y estrategia de pruebas |
| `06-adr-template.md` | Plantilla para Architecture Decision Records (todos se guardan en este repo) |
| `gitignore-template.txt` | Plantilla base de `.gitignore` para copiar en cada repositorio de equipo |

## Equipos y juegos

- Equipo 1: Identity & Profile Service
- Equipo 2: Matchmaking & Lobby Service
- Equipo 3: Shell Application
- Equipo 4: Juego - Typing Battle
- Equipo 5: Juego - Trivia Battle
- Equipo 6: Juego - Memory Match

## Cómo usar este repositorio

1. Cada equipo debe leer completo este repositorio antes de escribir código.
2. Cualquier duda de contrato se resuelve abriendo un *Issue* en `battlehub-contracts`, no asumiendo un comportamiento.
3. Cualquier cambio a un contrato existente requiere un ADR (agregado a `/adrs` en este repositorio) y aprobación del Tech Lead antes de implementarse en los repos de equipo.
4. El Tech Lead debe ser agregado como colaborador (no administrador) en los 6 repositorios de equipo, para poder revisar Pull Requests y pipelines de CI/CD.
