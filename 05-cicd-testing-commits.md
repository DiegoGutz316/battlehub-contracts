# Commits Semánticos, CI/CD y Pruebas

Aplica a los 6 repositorios de equipo (no solo a `battlehub-contracts`). La rama por defecto de todos los repos es `main`.

## 1. Commits semánticos (Conventional Commits)

Formato obligatorio:

```text
<tipo>(<alcance opcional>): <descripción corta en imperativo>

<cuerpo opcional>

<footer opcional>
```

Tipos permitidos:

| Tipo | Uso |
|---|---|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de un bug |
| `docs` | Cambios de documentación únicamente |
| `test` | Agregar o corregir pruebas |
| `refactor` | Cambio de código que no altera comportamiento externo |
| `chore` | Tareas de mantenimiento (dependencias, configuración) |
| `ci` | Cambios al pipeline de CI/CD |
| `perf` | Mejoras de rendimiento |

Ejemplos válidos:

```text
feat(matches): agregar endpoint POST /api/matches/{id}/start
fix(lobby-hub): corregir doble notificación de MatchStarted
test(profile): agregar prueba de integración para /profiles/sync
ci: agregar pipeline de build y pruebas en GitHub Actions
```

Recomendación de verificación automática: cada equipo puede agregar un hook de `commitlint` o una validación en su pipeline de CI que rechace PRs cuyos commits no sigan el formato.

## 2. CI/CD obligatorio en todos los repos

Cada repositorio de equipo debe tener un pipeline (GitHub Actions u otra herramienta equivalente) con, como mínimo, estas etapas en cada Pull Request hacia `main`:

```text
1. Restore/Install dependencias
2. Build
3. Lint (si aplica al stack elegido)
4. Pruebas unitarias
5. Pruebas de integración
6. (Opcional en esta fase) Publicación de artefacto / imagen de contenedor
```

Ejemplo de esqueleto de pipeline para el **backend en .NET 10** (Profile Service, Matchmaking, y la API de cada juego):

```yaml
name: CI - Backend

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET 10
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: "10.0.x"

      - name: Restore
        run: dotnet restore

      - name: Build
        run: dotnet build --no-restore

      - name: Unit tests
        run: dotnet test --no-build --filter Category=Unit

      - name: Integration tests
        run: dotnet test --no-build --filter Category=Integration
```

Ejemplo de esqueleto de pipeline para el **frontend en Aurelia** (Shell y cada microfrontend):

```yaml
name: CI - Frontend

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install
        run: npm ci

      - name: Build
        run: npm run build

      - name: Unit tests
        run: npm test
```

Si el repositorio de un equipo de juego contiene tanto el microfrontend (Aurelia) como la API (.NET 10), el pipeline debe incluir ambos jobs.

Regla de protección de rama: el merge a `main` debe estar bloqueado si este pipeline falla.

## 3. Estrategia de pruebas obligatoria

Cada repositorio de equipo debe incluir:

- **Pruebas unitarias**: lógica de negocio aislada (validaciones, cálculo de puntajes, reglas de la sala, etc.), sin dependencias externas reales (usar mocks/fakes).
- **Pruebas de integración**: al menos los flujos end-to-end de la propia API contra una base de datos real o en contenedor (por ejemplo con Testcontainers, una base SQLite temporal, o un Mongo/MySQL efímero levantado en el pipeline). Ejemplos mínimos esperados por servicio:
  - Profile Service: `POST /profiles/sync` seguido de `GET /profiles/me`.
  - Matchmaking: `POST /matches` -> `POST /matches/{id}/join` -> `POST /matches/{id}/start`.
  - Cada juego: `POST /results` -> `GET /results/{matchId}` (ver `04-persistencia-y-api-juegos.md`).
- Las pruebas de integración deben correr dentro del pipeline de CI, no solo localmente.

## 4. Checklist de Pull Request

Cada PR hacia `main` debe cumplir:

- [ ] Título del PR en formato de commit semántico.
- [ ] Pipeline de CI en verde (build + pruebas unitarias + pruebas de integración).
- [ ] Al menos 1 revisor aprobó.
- [ ] Si modifica un contrato de `battlehub-contracts`, referencia el ADR correspondiente.
