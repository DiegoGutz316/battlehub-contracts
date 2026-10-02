# ADR-007: Audiencia compartida para Profile y Matchmaking

- **Estado**: Propuesto
- **Fecha**: 2026-10-02 (UTC)
- **Equipo/Autor**: Equipo 3 — Shell Application

## Contexto

Al conectar el Shell con Profile y Matchmaking, necesitamos definir cómo van a aceptar la sesión del usuario los dos servicios.

BattleHub usa un tenant de Auth0 compartido, administrado por el Equipo 1. Nuestro equipo se encarga de la aplicación del Shell, donde el usuario inicia sesión. Esto se describe en `docs/01-gobernanza-repositorios.md` y `docs/02-arquitectura-y-flujo.md`.

Después del login, el Shell obtiene un access token para llamar a los servicios. Ese token tiene una audiencia, que indica para qué API fue emitido. Aunque los servicios usen el mismo tenant, eso no significa que puedan aceptar cualquier token de ese tenant.

Matchmaking necesita consultar en Profile quién es el usuario y qué permisos tiene. Los contratos actuales incluyen `/api/profiles/me` y `/api/profiles/me/permissions`, pero no especifican si ambos servicios deben compartir audiencia. Tampoco incluyen una consulta de permisos de otro usuario usando una cuenta de servicio.

En la integración local se utiliza una audiencia compartida. Este ADR propone revisar esa opción con el profesor y los Equipos 1 y 2 antes de adoptarla como acuerdo del proyecto.

## Decisión

Proponemos usar una misma audiencia de Auth0 para las operaciones de usuario de Profile y Matchmaking. Así, el Shell puede enviar el mismo access token a ambos servicios y Matchmaking puede usarlo para consultar los permisos del usuario en Profile.

Por ahora proponemos conservar el Identifier `https://api.battlehub.local/profile`, que utiliza la integración local. Este valor identifica la API en Auth0; no es la dirección donde se ejecuta el backend. Aunque su nombre dice Profile, la propuesta incluye también Matchmaking. Si después se cambia, los tres equipos deben actualizar su configuración juntos.

El flujo sería el siguiente:

1. El usuario inicia sesión en el Shell mediante Auth0.
2. El Shell obtiene un access token para la audiencia acordada.
3. Cuando el usuario realiza una acción en una sala, el Shell envía ese token a Matchmaking.
4. Matchmaking valida la firma, el emisor, la audiencia y la vigencia del token. Obtiene el identificador del usuario del campo `sub`.
5. Cuando la acción requiere permisos, consulta `/api/profiles/me` y `/api/profiles/me/permissions` con el mismo token. Comprueba que el perfil corresponda al usuario autenticado y que tenga los permisos necesarios.
6. Si no puede verificar los permisos porque Profile falla, no permite completar esa acción.

Profile también debe validar los tokens que recibe. Compartir audiencia no reemplaza las comprobaciones de permisos, anfitrión, participantes o capacidad de la sala. Los permisos que devuelve Profile tampoco se convierten automáticamente en scopes de Auth0.

La dirección de Profile debe estar configurada en el servidor. El cliente HTTP de Matchmaking no debe seguir redirecciones al enviar el token y, en despliegue, la conexión debe usar HTTPS. Los tokens no se guardan en la base de datos ni en los logs.

La aplicación del Shell debe tener autorizado el acceso delegado de usuario a la API en Auth0. La SPA del Shell y el registro de API son cosas distintas: esta propuesta no requiere otra SPA para el backend de Matchmaking. Para llamar a las APIs se utiliza el access token, no el ID token, y el frontend no lleva un Client Secret.

## Alternativas consideradas

| Alternativa | Por qué no se eligió para esta propuesta |
|---|---|
| Una audiencia distinta para cada servicio, con intercambio de tokens | Separa mejor los servicios, pero requiere acordar y configurar cómo Matchmaking obtiene un token válido para consultar Profile. |
| Una credencial propia de Matchmaking para consultar Profile, mediante M2M | Haría falta definir una consulta autorizada de permisos por usuario. Los endpoints `/me` actuales representan a quien hace la llamada. |
| Revisar los permisos solamente en el Shell | El backend necesita comprobarlos por su cuenta; no puede depender de lo que permita la pantalla. |
| Aceptar cualquier audiencia del tenant | Se perdería la comprobación de que el token fue emitido para la API correspondiente. |

## Consecuencias

- Positivas:
  - Podemos utilizar las consultas de perfil y permisos que ya están definidas.
  - El usuario mantiene un solo flujo de inicio de sesión.
  - Los servicios verifican los permisos antes de permitir las acciones.
- Negativas / riesgos asumidos:
  - El mismo token sirve para ambos servicios, por lo que la audiencia no los separa entre sí.
  - Matchmaking recibe un token que también puede utilizarse en Profile y debe protegerlo.
  - Las acciones que consultan permisos dependen de que Profile esté disponible.
  - El nombre actual del Identifier no deja claro que también incluye Matchmaking.
  - Si después se quieren separar las audiencias, habrá que ajustar la integración entre los tres equipos.

## Impacto en otros equipos

- **Equipo 1 — Identity & Profile:** revisar la propuesta con el Equipo 2, coordinar la configuración de la API en el tenant y mantener disponibles las consultas de perfil y permisos.
- **Equipo 2 — Matchmaking & Lobby:** validar los tokens, consultar los permisos en Profile y aplicar las reglas de las salas en su backend.
- **Equipo 3 — Shell:** configurar su aplicación Auth0, los callbacks, el cierre de sesión y la audiencia acordada. Enviar el access token a los servicios y al hub de lobby.
- **Equipos 4, 5 y 6 — Juegos:** esta propuesta no incluye automáticamente sus APIs ni define sus credenciales de servicio.

No proponemos cambiar las rutas REST, los eventos SignalR ni `GameContext`. Lo que se busca acordar es cómo se utiliza Auth0 entre el Shell, Profile y Matchmaking.

El ADR-004 está marcado como Propuesto en la versión consultada. Su flujo de finalización de partidas (`/finish`) y las credenciales de los servicios de juegos quedan fuera de este documento. Si se aceptan ambas propuestas, se debe revisar que sus configuraciones sean compatibles.

Este ADR queda pendiente de revisión y aprobación del Tech Lead. Si se acepta, el acuerdo debe agregarse a `docs/03-contratos-tecnicos.md` y los Equipos 1, 2 y 3 deben coordinar la configuración.
