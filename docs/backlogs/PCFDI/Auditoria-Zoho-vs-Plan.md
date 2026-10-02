# Auditoría del backlog en Zoho vs. lo planificado

**Proyecto:** SIGOB-PCFDI-ME-PR-297 · Plataforma CFDI Integral  
**Comparación:** tareas dadas de alta en Zoho contra el documento `Backlog_detallado_Plataforma_CFDI.md` (última versión).  
**Resultado general:** la estructura de hitos y las 34 funcionalidades coinciden. Se detectaron diferencias en prioridades, una subtarea duplicada y algunos títulos desactualizados en el Hito C. El detalle abajo. (Las funcionalidades con una sola subtarea se cargaron solo como tarea, según lo definido; eso no es una diferencia.)

## Resumen ejecutivo

| Aspecto | Planificado (MD) | En Zoho | ¿Coincide? |
|---|---|---|---|
| Hitos | 9 (0, A–H) | 9 | ✅ |
| Tareas (funcionalidades) | 34 | 34 | ✅ |
| Subtareas | 77 | 61 | ✅ (las 16 de diferencia son funcionalidades con una sola subtarea, que por decisión de diseño se cargan solo como tarea) |

---

## Diferencia 1 — Subtarea duplicada en C.1

En **C.1 (Modelo de datos analítico)** hay dos subtareas que son la misma idea, cargadas dos veces con distinto texto y prioridad:

| Fila Zoho | Subtarea | Prioridad |
|---|---|---|
| 54 | Contemplar ingresos desde el diseño **inicial** | Alto |
| 55 | Contemplar ingresos desde el diseño | Ninguno |

**Acción sugerida:** eliminar una de las dos (dejar la de prioridad Alto, borrar la de "Ninguno").

Además, en C.1 el plan actualizado tiene 3 subtareas ("Diseñar la estructura analítica compartida", "Marcar el origen y emparejar por UUID", "Contemplar ingresos"). En Zoho la subtarea **"Marcar el origen y permitir emparejar por UUID"** no aparece con ese nombre — la estructura cargada corresponde a la versión anterior del plan.

---

## Diferencia 2 — Hito C con títulos y subtareas de la versión anterior

Las tareas del Hito C en Zoho reflejan el plan **antes** de la corrección de las dos fuentes de datos:

- **C.2** en Zoho se llama _"INGESTA Y PARSEO DE XML DESCARGADOS"_ y sus subtareas son _"Parsear cada nodo…"_, _"Procesamiento masivo…"_ y _"Evitar duplicados por UUID"_. En el plan actualizado C.2 es _"Leer los XML… (el parser compartido)"_ con subtareas _"Escribir el parser único"_, _"Que sirva para una factura y para lotes grandes"_ y _"Evitar duplicados por UUID"_. El concepto de **parser compartido por las dos fuentes** no quedó reflejado.
- **C.1** subtarea _"Diseñar esquema relacional para CFDI descargados"_ conserva la palabra "descargados", cuando el plan ya la generalizó a "estructura analítica compartida por ambas fuentes".

**Causa probable:** estas tareas se cargaron desde una versión del backlog previa a la última actualización (la de A.7/D.0/E.4). Las tres tareas nuevas sí entraron (ver abajo), pero los ajustes a C.1 y C.2 no.

---

## Diferencia 3 — Las 3 funcionalidades nuevas entraron, pero sin prioridad

Las tres tareas añadidas en la última actualización **sí están** en Zoho (bien), pero todas sus subtareas quedaron con prioridad **"Ninguno"**:

- **A.7** Desmenuzar cada factura al timbrarla — 4 subtareas, todas en "Ninguno".
- **D.0** Elegir y dejar claro qué fuente de datos se consulta — 4 subtareas, todas en "Ninguno".
- **E.4** Conciliación de auditoría local vs. SAT — 4 subtareas, todas en "Ninguno".

En el plan, sus prioridades deberían ser: A.7 (Alta/Alta/Alta/Media), D.0 (Alta/Alta/Media/Media), E.4 (Alta/Alta/Media/Media). **Acción sugerida:** asignar prioridad a estas 12 subtareas.

Nota: A.7 y D.0 quedaron **al final** de la lista en Zoho (después de H.3), no en su posición lógica (A.7 tras A.6, D.0 antes de D.1, E.4 tras E.3). No afecta el contenido, pero el orden visual del backlog no sigue la secuencia de trabajo.

---

## Diferencia 4 — Prioridades invertidas respecto al plan

Varias subtareas del Hito 0 tienen prioridad distinta a la planificada. En el plan, los hallazgos de seguridad marcados **Crítica** son los más urgentes; en Zoho quedaron como **Bajo**, mientras que otros de menor criticidad quedaron **Alto**:

| Subtarea (Hito 0.2 seguridad) | Plan | Zoho |
|---|---|---|
| Restaurar autenticación en endpoints | Crítica | Bajo ⚠️ |
| Corregir verify=False en TLS al SAT | Crítica | Bajo ⚠️ |
| Eliminar logueo de secretos | Crítica | Bajo ⚠️ |
| Reemplazar secretos por defecto | Crítica | Bajo ⚠️ |
| Revisar recepción de llave privada/CSD | Crítica | Bajo ⚠️ |
| Cerrar CORS abierto | Alta | Alto ✅ |
| Retirar módulo de debug | Alta | Alto ✅ |

**Esto es lo más importante del informe:** los cinco puntos de seguridad más críticos del proyecto quedaron con prioridad **Bajo** en Zoho. Conviene subirlos a la prioridad máxima que maneje el tablero, porque son condición previa (Hito 0) y tocan datos fiscales sensibles. (Zoho no tiene nivel "Crítica" — el máximo es "Alto" — así que la equivalencia sería **Alto**.)

También en las tareas ya construidas (A.1–A.4, B.1, etc.) el plan las marca sin prioridad de trabajo (son estado "Existe", solo validar). En Zoho quedaron como "Bajo", lo cual es coherente.

---

## Diferencia 5 — Prioridad de tareas 'Existe' vs a construir

Punto menor de consistencia: algunas subtareas de descarga masiva (A.6) que en el plan son **Crítica/Alta** quedaron en Zoho como **Bajo** ("Ampliar consulta de UUID a rangos" y "Manejo asíncrono" → Bajo). Siendo A.6 parte de la ruta crítica, convendría revisar que su prioridad refleje eso.

---

## Checklist de correcciones sugeridas en Zoho

1. Subir a **Alto** las 5 subtareas de seguridad del Hito 0.2 que quedaron en Bajo (autenticación, verify=False, logueo de secretos, secretos por defecto, llave/CSD en body).
2. Eliminar la subtarea **duplicada** de C.1 ("Contemplar ingresos desde el diseño", fila 55, prioridad Ninguno).
3. Asignar prioridad a las **12 subtareas** de A.7, D.0 y E.4 (hoy en "Ninguno").
4. Actualizar **C.2** al concepto de "parser compartido" y agregar en **C.1** la subtarea "Marcar el origen y emparejar por UUID" (quedaron de la versión anterior).
5. Revisar prioridad de **A.6** (descarga masiva) — es ruta crítica, hoy varias de sus subtareas están en Bajo.
6. (Opcional) Reordenar A.7, D.0 y E.4 a su posición lógica en vez de al final.

---

_Auditoría generada a partir del export de Zoho `task_export_106599000037698195.xlsx` y del backlog planificado vigente._