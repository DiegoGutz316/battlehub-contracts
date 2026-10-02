# ADR-006: Integración del Profile Service con el Shell (CORS, configuración de Auth0 y persistencia local)

- **Estado**: Propuesto
- **Fecha**: 2026-10-02 (UTC)
- **Equipo/Autor**: Equipo 1 - Identity & Profile Service

## Contexto

El Profile Service (`battlehub-profile-service`) implementa el contrato de `03-contratos-tecnicos.md` §1: `POST /api/profiles/sync`, `GET /api/profiles/me`, `GET /api/profiles/me/permissions` y `GET /api/profiles/me/games`. Según el flujo de `02-arquitectura-y-flujo.md`, el Shell (Equipo 3) llama a estos endpoints desde el navegador justo después del login con Auth0, enviando el token JWT en el encabezado `Authorization`.

El Shell y el Profile Service corren en orígenes distintos. ADR-003 fija el Shell en el puerto local `4000`, y la API del Profile Service corre en `http://localhost:5220`. Sin una política CORS explícita, el navegador bloquea la petición de preflight (`OPTIONS`) que precede a cada llamada con `Authorization` y `Content-Type: application/json`, por lo que el Shell no puede sincronizar al usuario ni obtener sus juegos.

Además, cada integrante y cada equipo que integra con nosotros necesita levantar el servicio localmente con el dominio y el audience reales del tenant de Auth0, sin versionar esos valores (`01-gobernanza-repositorios.md`, `.gitignore` obligatorio) y sin depender de tener MySQL instalado para una prueba rápida.

Restricciones existentes:

- Backend en .NET 10 y MySQL como motor del Profile Service (fijo en `02-arquitectura-y-flujo.md`).
- Autenticación con JWT emitidos por el tenant de Auth0 que administra el Equipo 1.
- Fechas en UTC con formato ISO-8601 y sufijo `Z`.
- Pruebas de integración ejecutadas en el CI (`05-cicd-testing-commits.md` §3).

## Decisión

El Profile Service habilita **CORS solo para una lista explícita de orígenes**, leída de la configuración `Cors:Origins`, con `http://localhost:4000` (el Shell) como valor por defecto. Se permiten cualquier encabezado y cualquier método para esos orígenes. Cualquier otro origen no recibe el encabezado `Access-Control-Allow-Origin`.

La configuración de Auth0 (`Auth0:Domain`, `Auth0:Audience`) y los orígenes CORS se inyectan por **variables de entorno** o `dotnet user-secrets`. Para el arranque local se agrega el script `scripts/Start-Local.ps1`, que recibe el dominio y el audience como parámetros obligatorios, configura el origen del Shell y ejecuta la API con el perfil `http`.

Para la persistencia, MySQL sigue siendo el motor oficial y se gestiona con migraciones explícitas de EF Core. Cuando `DatabaseProvider` no es `MySQL` (desarrollo rápido y pruebas), el servicio usa el proveedor en memoria de EF Core y **aplica el seed de permisos y juegos al arrancar** (`EnsureCreated`), de modo que el arranque real deja el catálogo listo sin que cada prueba lo prepare por su cuenta.

En el pipeline de middlewares, `UseCors()` se ejecuta antes de `UseAuthentication()` y `UseAuthorization()`, para que el preflight se responda sin exigir token.

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| CORS abierto (`AllowAnyOrigin`) | Cualquier sitio podría invocar la API desde el navegador de un usuario autenticado. No aporta nada frente a una lista de orígenes conocidos, que en este proyecto son pocos y fijos. |
| Orígenes escritos directamente en el código | Obliga a recompilar para cada ambiente. El despliegue es manual y las URLs pueden cambiar entre ambientes (igual que señala ADR-003 para los remotes). |
| Proxy en el Shell (mismo origen) para evitar CORS | Traslada al Equipo 3 la responsabilidad de enrutar el tráfico del Profile Service y agrega una pieza más al despliegue manual. |
| Guardar dominio y audience de Auth0 en `appsettings.json` | Mezcla valores propios de cada ambiente con el código versionado y facilita que se suban datos sensibles del tenant. |
| Exigir MySQL también para el arranque local rápido | Aumenta la barrera de entrada para probar la integración con el Shell. MySQL se mantiene como motor oficial; el modo en memoria solo cubre desarrollo y pruebas. |

## Consecuencias

- Positivas:
  - El Shell puede llamar al Profile Service desde el navegador sin errores de CORS, en el puerto acordado en ADR-003.
  - Solo los orígenes configurados pueden consumir la API desde un navegador.
  - Cada ambiente cambia orígenes y datos de Auth0 sin tocar el código.
  - El catálogo de permisos (`matches.create`, `games.typing.play`, `games.trivia.play`, `games.memory.play`) y de juegos queda disponible desde el arranque en el modo en memoria.
  - Hay una prueba de integración que verifica que el preflight del Shell se acepta y que un origen ajeno se rechaza.
- Negativas / riesgos asumidos:
  - Si un equipo cambia de puerto o se despliega en otra URL, hay que agregar ese origen a `Cors:Origins`; de lo contrario, sus llamadas fallarán en el navegador.
  - Las pruebas de integración actuales usan el proveedor en memoria. `05-cicd-testing-commits.md` §3 pide una base real o en contenedor, por lo que el Equipo 1 se compromete a agregar pruebas contra MySQL efímero (Testcontainers o servicio MySQL en GitHub Actions) para el flujo `POST /api/profiles/sync` seguido de `GET /api/profiles/me`.
  - `scripts/Start-Local.ps1` requiere PowerShell. En Linux o macOS se pueden definir las mismas variables de entorno (`Auth0__Domain`, `Auth0__Audience`, `Cors__Origins__0`) antes de `dotnet run`.

## Impacto en otros equipos

Este ADR **no modifica** ningún contrato REST, evento SignalR, contrato visual ni ciclo de vida de `battlehub-contracts`; los endpoints y sus respuestas se mantienen.

- **Equipo 3 - Shell**: puede consumir el Profile Service desde `http://localhost:4000` sin configuración adicional. Si cambia su origen, debe avisar al Equipo 1 para agregarlo a `Cors:Origins`.
- **Equipos 4, 5 y 6 - Juegos**: si algún microfrontend necesita consultar el Profile Service directamente desde el navegador, debe solicitar al Equipo 1 que agregue su origen a la lista.
- **Equipo 2 - Matchmaking**: sin impacto en este ADR. Por separado, el Equipo 1 configurará en el tenant de Auth0 los clientes M2M y el scope `matches.finish` que solicita ADR-004.
