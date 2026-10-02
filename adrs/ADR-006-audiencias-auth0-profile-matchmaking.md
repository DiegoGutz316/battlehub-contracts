# ADR-006: Audiencia compartida para Profile y Matchmaking

- **Estado**: Propuesto
- **Fecha**: 2026-10-02 (UTC)
- **Equipo/Autor**: Equipo 3 — Shell Application

## Contexto

BattleHub utiliza un tenant Auth0 compartido, administrado por el Equipo 1. El Shell administra su aplicación SPA e integra Profile Service y Matchmaking, según `docs/01-gobernanza-repositorios.md` y `docs/02-arquitectura-y-flujo.md`.

Los contratos REST definen las consultas del perfil y los permisos del usuario autenticado en `/api/profiles/me` y `/api/profiles/me/permissions`. No definen un endpoint para consultar permisos de otro usuario mediante una identidad de servicio, ni fijan cuántas APIs o audiencias deben registrarse en Auth0.

Matchmaking necesita verificar los permisos del usuario al crear, unirse e iniciar una partida. Si su token tiene una audiencia exclusiva de Matchmaking, Profile no debe aceptarlo automáticamente: compartir un tenant no equivale a compartir una audiencia.

Existe un prototipo local que utiliza la misma audiencia en ambos servicios y reenvía el access token a Profile para verificar identidad y permisos. Se presenta esta decisión para revisión; el prototipo no constituye aprobación del contrato ni acuerdo de los Equipos 1 y 2.

## Decisión

Se propone representar Profile y Matchmaking como una API lógica de BattleHub con una audiencia compartida para las operaciones de usuario de esta etapa. El Shell solicita un access token para esa audiencia; cada backend valida el token y aplica la autorización de sus propias operaciones.

La aplicación SPA del Shell y el registro de API son recursos distintos en Auth0. No se requiere crear otra SPA para que el backend de Matchmaking valide tokens.

### Configuración y responsabilidades

- El Equipo 1 administra la configuración del tenant y coordina el registro de API y su Identifier con el Equipo 2.
- El Equipo 3 configura la SPA, sus URLs de callback/logout y la audiencia solicitada por el Shell. No administra por esta decisión los accesos de aplicaciones de otros equipos.
- Los Equipos 1 y 2 configuran sus backends con el emisor y la audiencia acordados. Ambos validan firma, emisor, audiencia y vigencia del token.
- La aplicación del Shell debe estar autorizada para acceso delegado de usuario a la API lógica.
- No se utiliza un ID token para autorizar llamadas a las APIs ni se incorpora un Client Secret al frontend.

El Identifier utilizado por el prototipo es `https://api.battlehub.local/profile`. Se propone conservarlo en esta etapa para evitar modificar la integración existente. Es un identificador lógico, no la URL HTTP del servicio. Su nombre alude a Profile, aunque el alcance propuesto incluye Matchmaking; esta limitación de nomenclatura debe quedar clara en la configuración. Cualquier cambio posterior requiere actualizar coordinadamente el Shell y ambos backends.

### Consulta de permisos

1. El Shell envía su access token a Matchmaking como Bearer.
2. Matchmaking valida el token y obtiene la identidad del usuario del claim `sub`.
3. Para las acciones que requieren permisos, consulta Profile con ese mismo access token: primero `/api/profiles/me` y después `/api/profiles/me/permissions`.
4. Comprueba que el identificador del perfil coincida con el usuario autenticado y verifica los permisos requeridos por la acción.
5. Si Profile no está disponible, rechaza la operación dependiente de permisos; no permite la acción por defecto.

La dirección de Profile procede de configuración del servidor, no de la solicitud del navegador. En despliegue debe utilizar HTTPS; el cliente HTTP no sigue redirecciones para evitar reenviar credenciales a otro destino. El token no debe guardarse en MongoDB ni registrarse en logs.

Los permisos de negocio consultados en Profile no se convierten automáticamente en scopes OAuth. Compartir una audiencia no concede permisos para crear salas ni sustituye las reglas de anfitrión, membresía o capacidad.

## Alternativas consideradas

| Alternativa | Por qué no se eligió para esta etapa |
|---|---|
| Audiencias independientes y token exchange/delegación | Requiere definir el intercambio, su configuración Auth0 y los contratos necesarios antes de implementarlo. Ofrece mayor separación entre recursos. |
| Audiencias independientes y acceso M2M de Matchmaking a Profile | Los endpoints `/me` describen al llamante, no a un usuario arbitrario. Se necesitaría un contrato autorizado de consulta por usuario y una política de acceso de servicio. |
| Resolver permisos solo en el Shell | El navegador no puede ser la autoridad de las operaciones del backend. |
| Aceptar en Profile cualquier audiencia del tenant | Elimina la validación del recurso destinatario y no es equivalente a una audiencia compartida explícita. |

## Consecuencias

- Positivas:
  - Permite consultar los permisos mediante los endpoints actuales de Profile sin introducir un contrato de consulta por otro usuario.
  - Mantiene un único flujo de login para el usuario.
  - Conserva las comprobaciones de identidad y autorización en los backends.
- Negativas / riesgos asumidos:
  - Un token válido para la API lógica puede presentarse a ambos servicios. La audiencia no los aísla entre sí; cada servicio debe comprobar los permisos y las reglas de cada operación.
  - Matchmaking recibe una credencial reutilizable ante Profile y pasa a formar parte de la misma frontera de confianza.
  - Las acciones que consultan permisos dependen de la disponibilidad y latencia de Profile.
  - El Identifier actual no describe claramente ambos servicios.
  - Separar audiencias posteriormente requerirá una migración coordinada y un mecanismo de delegación o consulta entre servicios.

## Impacto en otros equipos

- **Equipo 1:** revisar la audiencia lógica compartida, configurar Auth0 y mantener las consultas autenticadas de perfil y permisos.
- **Equipo 2:** validar JWT y permisos en el backend, proteger el reenvío del bearer y mantener configurada la URL de Profile.
- **Equipo 3:** solicitar la audiencia acordada y enviar el access token a las APIs y al hub de lobby. Los callbacks pertenecen a la SPA del Shell.
- **Equipos 4, 5 y 6:** esta propuesta no incorpora sus APIs a la audiencia compartida ni define sus credenciales M2M.

No se modifican rutas REST, nombres de eventos SignalR, el contrato visual ni `GameContext`. La decisión añade una política de autenticación entre Profile y Matchmaking que actualmente no está especificada en los contratos técnicos.

ADR-004 permanece marcado como Propuesto en la versión consultada. Su callback `/finish`, la identidad de los Game Services y el scope `matches.finish` quedan fuera de este ADR. Si se aprueban ambos documentos, el Tech Lead y los equipos deberán comprobar la compatibilidad de sus audiencias y políticas M2M antes de habilitar ese flujo.

La adopción definitiva queda sujeta a revisión del Tech Lead. Tras su aceptación, debe incorporarse la política acordada a `docs/03-contratos-tecnicos.md` y coordinarse la configuración entre los Equipos 1, 2 y 3.
