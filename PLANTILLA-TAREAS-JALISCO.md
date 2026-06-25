# Plantilla de alta de tareas — Proyecto Jalisco (JAL-SH-SET)

> Referencia para dar de alta tareas en el proyecto **JAL-SH-SET** del portal SIGOB.
> Cuando digas *"vamos a dar de alta tareas para el proyecto de Jalisco"*, se usan estos
> defaults automáticamente. **La PRIORIDAD siempre se pregunta — nunca se asume.**

## Datos fijos del proyecto

| Dato | Valor |
|---|---|
| Portal | `sigobproyectos` → ID `920809` |
| Proyecto | `JAL-SH-SET` → ID `106599000031393185` |
| Lista de tareas (default) | `Fase de Desarrollo` → ID `106599000031811897` |
| Prefijo de nombre | `JAL-SIR+: ` (se antepone **automáticamente** — el usuario NO lo escribe) |

## Defaults al crear una tarea

| Campo | Default | Nota |
|---|---|---|
| Lista de tareas | Fase de Desarrollo | salvo que se indique otra |
| Revisor de operaciones (`revisor`) | **Dulce Gonzalez** (`106599000027271388`) | campo **obligatorio** |
| Horas (`work`) | 8 | va dentro de `owners_and_work` |
| Tamaño (`tamano_de_tarea_1_facil_5_dificil`) | 3 | 1=fácil … 5=difícil |
| `start_date` | hoy | requerida por Zoho |
| **Prioridad** | ⚠️ **SE PREGUNTA SIEMPRE** | high / medium / low / none |
| Área técnica | según la tarea | ver catálogo |
| Propietario | según la tarea | debe ser miembro del proyecto |

## Qué me das al pedir una tarea

```
Nombre:        SOLO el nombre corto — yo antepongo "JAL-SIR+: " siempre (si no lo trae ya)
Propietario:   nombre — lo busco; si no es miembro del proyecto, hay que añadirlo en Zoho
Área técnica:  FRONTEND / BACKEND / etc. (ver catálogo)
Prioridad:     OBLIGATORIO — me la dices tú
Objetivo:      la redacto/desgloso yo si me lo pides
(opcional)     horas, lista, revisor, tamaño — solo si cambian respecto al default
```

## Catálogo de Área técnica (valores en MAYÚSCULAS)

`FRONTEND` · `BACKEND` · `DEVOPS` · `BASE DE DATOS` · `FULL STACK (Revisión menor)` ·
`DOCUMENTACIÓN` · `HITOS DEL PROYECTO` · `OTROS`

## Propietarios/usuarios conocidos (zpuid)

| Persona | zpuid | Email |
|---|---|---|
| Alejandro German | `106599000022294467` | alejandro.leon@sigob.com.mx |
| Dulce Gonzalez | `106599000027271388` | dulce.gonzalez@sigob.com.mx |
| Juan Pablo Campos | `106599000027900021` | juanpablo.campos@sigob.com.mx |

> Para cualquier otro responsable, se busca con `list_users` en el proyecto. Si la persona
> está en el portal pero no en el proyecto, primero hay que añadirla al proyecto.

## Campos personalizados del proyecto (api_name)

| api_name | Etiqueta | Tipo |
|---|---|---|
| `revisor` | Revisor operaciones | userpicklist (**obligatorio**) |
| `revisor_de_desarrollo` | Revisor de desarrollo | userpicklist |
| `revisor_de_datos` | Revisor de datos | userpicklist |
| `revisor_qa` | Revisor QA | userpicklist |
| `area_tecnica` | Área técnica | picklist |
| `tamano_de_tarea_1_facil_5_dificil` | Tamaño de tarea (1-5) | picklist |
| `work` | Horas de trabajo | (se manda en `owners_and_work`) |

## Subtareas

Las subtareas **solo se crean por la API v2** (no hay endpoint v3). El padre va en la URL:
`POST /restapi/portal/sigobproyectos/projects/{PID}/tasks/{ID_PADRE}/subtasks/` (form-urlencoded, **barra final** obligatoria).

Mecánica (híbrida v2 + v3):
1. Crear la subtarea por **v2** con `name` (+ priority/description) → queda vinculada al padre.
2. Completar los campos personalizados (revisor, area_tecnica, horas, tamaño) con un **PATCH v3** usando el id devuelto.
3. Verificar el vínculo listando las subtareas del padre por v2.

Para pedir una subtarea: dame la **tarea padre** (su clave `XX-T###`, nombre o ID) + los mismos datos de una tarea normal. La **prioridad sigue siendo obligatoria**.

## Notas técnicas (API V3)

- **Horas:** van en `owners_and_work` (`total_work` + `work_values` por owner), NO en el campo top-level `work` (V3 lo ignora).
- **`revisor` es obligatorio** y debe apuntar a un miembro del proyecto.
- **Propietario no-miembro** → Zoho responde `400 "user not available in the project"`; hay que añadirlo al proyecto primero.
- **Adjuntar archivos** a tareas requiere el scope `ZohoPC.files.ALL`, que el token actual **no tiene** (habría que agregarlo a `setup-auth.js` y re-autenticar).
- Fechas que se pasan al MCP en formato `MM-DD-YYYY`; el server las convierte a ISO 8601.

---
_Archivo de referencia local — no forma parte del repo (no commitear al PR de la contribución)._
