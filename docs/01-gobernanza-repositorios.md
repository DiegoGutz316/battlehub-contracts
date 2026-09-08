# Gobernanza y Repositorios

## Modelo de propiedad

| Repositorio | Dueño (admin) | Acceso del Tech Lead |
|---|---|---|
| `battlehub-contracts` | Tech Lead | Admin (dueño) |
| `battlehub-profile-service` | Equipo 1 | Colaborador (contributor) |
| `battlehub-matchmaking` | Equipo 2 | Colaborador (contributor) |
| `battlehub-shell` | Equipo 3 | Colaborador (contributor) |
| `battlehub-game-typing` | Equipo 4 | Colaborador (contributor) |
| `battlehub-game-trivia` | Equipo 5 | Colaborador (contributor) |
| `battlehub-game-memory` | Equipo 6 | Colaborador (contributor) |

Reglas:

- El Tech Lead no administra, ni es dueño de ninguno de los 6 repos de equipo. Cada equipo crea su propio repositorio y agrega al Tech Lead como colaborador con permiso de escritura (para poder comentar/aprobar PRs), pero no de administración.
- Cada equipo es responsable de: proteger su rama `main`, configurar su propio pipeline de CI/CD, y mantener actualizado su README con instrucciones de ejecución local.
- El único repositorio que el Tech Lead administra completamente es `battlehub-contracts`.

## Estructura mínima esperada en cada repo de equipo

```text
/src                → código fuente
/tests              → pruebas unitarias e integración
/.github/workflows  → pipeline de CI/CD
.gitignore          → obligatorio en todos los repos (ver gitignore-template.txt)
README.md           → cómo correr el proyecto localmente
```

## Rama por defecto y protección

- La rama por defecto de todos los repositorios es `main`.
- No se exige ninguna estrategia de ramas particular (cada equipo organiza su trabajo como prefiera: feature branches, trabajo directo en ramas propias, etc.).
- El único requisito obligatorio es que **`main` esté protegida**:
  - No se permite push directo a `main`.
  - Todo cambio a `main` entra mediante Pull Request.
  - El Pull Request solo puede mergearse si el pipeline de CI pasa (build + pruebas).
  - Al menos 1 revisor debe aprobar el Pull Request.

## Cuenta de Auth0 (recurso compartido)

- Auth0 se usa como proveedor de identidad (SSO) para todo el proyecto. Es **una sola cuenta/tenant**, compartida por todos los equipos.
- El **Equipo 1 (Identity & Profile Service)** es responsable de crear la cuenta/tenant de Auth0 y de su administración general (configuración del tenant, dominios, conexiones de login, etc.).
- Dentro de ese tenant, cada equipo que registre su propia aplicación (por ejemplo, el Shell, y cada juego si requiere su propia aplicación/cliente en Auth0) es responsable de **administrar el acceso a esa aplicación específica**: decidir qué personas se agregan o se quitan como colaboradoras de esa aplicación dentro de Auth0.
- El Equipo 1 no decide quién tiene acceso a la aplicación de otro equipo; solo administra el tenant como tal. Cada equipo dueño de una aplicación administra su propia aplicación.

## .gitignore obligatorio

Todos los repositorios de equipo deben incluir un archivo `.gitignore` desde el primer commit. Se provee una plantilla base en `gitignore-template.txt` que cada equipo debe adaptar según su stack (artefactos de build, `node_modules`, `bin/obj`, entornos virtuales, archivos de IDE, variables de entorno locales, etc.). No deben quedar archivos de configuración con secretos, dependencias instaladas, ni artefactos de build versionados en el repositorio.

## Trazabilidad

Cada Pull Request debe:

- Tener un título en formato de commit semántico (ver `05-cicd-testing-commits.md`).
- Referenciar el contrato o sección de `battlehub-contracts` que implementa, si aplica.
- Incluir evidencia de pruebas (output de CI o capturas).
