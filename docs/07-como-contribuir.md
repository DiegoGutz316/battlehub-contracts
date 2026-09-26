# Cómo contribuir a `battlehub-contracts`

Este repositorio es de solo lectura para los equipos: no se hace push directo. Todo cambio (correcciones, nuevos contratos, ADRs, etc.) entra mediante un Pull Request abierto desde un fork personal.

## Flujo de contribución

### 1. Crear un fork

Desde GitHub, abre el repositorio `battlehub-contracts` y haz clic en **Fork** (esquina superior derecha). Esto crea una copia del repositorio bajo tu cuenta personal.

### 2. Clonar el fork localmente

```bash
git clone https://github.com/<tu-usuario>/battlehub-contracts.git
cd battlehub-contracts
```

### 3. Agregar el repositorio original como remote `upstream`

Esto te permite mantener tu fork sincronizado con los cambios del repositorio principal.

```bash
git remote add upstream https://github.com/battlehub/battlehub-contracts.git
```

Verifica que quedaron configurados correctamente:

```bash
git remote -v
# origin    https://github.com/<tu-usuario>/battlehub-contracts.git (fetch)
# origin    https://github.com/<tu-usuario>/battlehub-contracts.git (push)
# upstream  https://github.com/battlehub/battlehub-contracts.git (fetch)
# upstream  https://github.com/battlehub/battlehub-contracts.git (push)
```

### 4. Sincronizar tu fork antes de empezar a trabajar

Antes de crear cualquier rama, asegúrate de que tu `main` local esté al día con el upstream:

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

### 5. Crear una rama para el cambio

Usa un nombre descriptivo que indique qué estás modificando:

```bash
git checkout -b docs/agregar-contrato-resultados-trivia
```

Convenciones de nombre de rama sugeridas:

| Prefijo | Cuándo usarlo |
|---|---|
| `docs/` | Agregar o corregir documentación |
| `adr/` | Agregar un nuevo ADR |
| `fix/` | Corregir un error en un contrato existente |

### 6. Realizar los cambios y hacer commit

```bash
# Edita los archivos necesarios, luego:
git add docs/04-persistencia-y-api-juegos.md
git commit -m "docs: agrega contrato de resultados para Trivia Battle"
```

Los mensajes de commit deben seguir el formato semántico definido en `05-cicd-testing-commits.md`.

### 7. Subir la rama a tu fork

```bash
git push origin docs/agregar-contrato-resultados-trivia
```

### 8. Abrir el Pull Request

1. Ve a tu fork en GitHub.
2. GitHub mostrará un banner con **"Compare & pull request"** — haz clic ahí.
3. Asegúrate de que el PR apunte al repositorio correcto:
   - **base repository**: `battlehub/battlehub-contracts` — rama `main`
   - **head repository**: `<tu-usuario>/battlehub-contracts` — tu rama de cambios
4. Completa el título y la descripción:
   - **Título**: en formato de commit semántico (ej. `docs: agrega contrato de resultados para Trivia Battle`).
   - **Descripción**: explica qué cambiaste y por qué. Si el cambio implementa o modifica un contrato existente, referencia la sección correspondiente.

### 9. Revisión y merge

El Tech Lead revisa el PR. Puede pedir ajustes mediante comentarios en GitHub. Una vez aprobado, el Tech Lead hace el merge a `main`.

---

## Mantener el fork sincronizado (uso continuo)

Después de que el Tech Lead mergee cambios al repositorio principal, actualiza tu fork antes de empezar cualquier nueva contribución:

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main
```

Si ya tenías una rama en progreso y el `main` upstream avanzó, puedes hacer rebase sobre `main` actualizado:

```bash
git checkout docs/mi-rama
git rebase main
```

---

## Restricciones

- No se acepta push directo a `main` del repositorio principal. Cualquier intento será rechazado por la protección de rama.
- No se abren PRs desde `main` de tu fork — siempre desde una rama de trabajo.
- Si vas a proponer un cambio de arquitectura o de decisión técnica, acompáñalo con un ADR usando la plantilla en `06-adr-template.md`.
