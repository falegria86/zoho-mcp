# Backlog — Tareas nuevas por agregar

Solo los añadidos de la referencia competitiva (Central CFDI). Se integran como un **Hito I nuevo**, siguiendo el hilo de hitos existente (0, A–H → I). Formato igual al del backlog: tarea (funcionalidad) → subtareas.

---

## HITO I — Utilidades y automatización fiscal

Funcionalidades de valor agregado (C2) que cierran vacíos frente a la competencia. Se apoyan en los CFDI ya desmenuzados (Hito C). Las tres primeras aportan valor real; las dos últimas son comodidades menores.

### I.1 Generar la DIOT automáticamente
`Nuevo · C2 · Alta`

Genera la DIOT (formato A-29) del periodo a partir de los CFDI de proveedores ya procesados. Es obligación fiscal mensual y el mayor gancho comercial del hito. Las reglas de armado las valida un contador.

- **Armar la DIOT desde los CFDI procesados** · `Nuevo · C2 · prio Alta`
- **Exportar en el formato que acepta el SAT (A-29)** · `Nuevo · C2 · prio Alta`
- **Validar reglas con fiscalista y mantenerlas al día** · `Nuevo · C2 · prio Media`

### I.2 Visor de XML legible
`Nuevo · C2 · Media`

Muestra el contenido de un CFDI (emisor, receptor, conceptos, impuestos) de forma clara y ordenada, no el XML crudo. Barato porque el XML ya está guardado.

- **Mostrar el CFDI en vista legible** · `Nuevo · C2 · prio Media`

### I.3 Reporte automático por correo
`Nuevo · C2 · Media`

Envío programado (p. ej. cada noche/mes) de un resumen por correo, sin que el usuario entre a la plataforma. El contenido debe tener valor (variaciones, alertas), no solo conteos.

- **Programar y enviar el reporte por correo** · `Nuevo · C2 · prio Media`
- **Que el contenido tenga valor, no solo conteos** · `Nuevo · C2 · prio Media`
- **Configuración por usuario (activar/frecuencia)** · `Nuevo · C2 · prio Baja`

### I.4 Descargar los XML de un periodo en un ZIP
`Nuevo · C2 · Baja`

Comodidad: bajar todos los XML de un periodo comprimidos en un ZIP. Se empaqueta lo que ya está guardado.

- **Empaquetar los XML del periodo en ZIP** · `Nuevo · C2 · prio Baja`

### I.5 Generar el PDF de un CFDI propio y reenviarlo
`Nuevo · C2 · Baja`

Genera la representación impresa (PDF) de un CFDI propio y permite reenviarlo por correo. Acotado a CFDI timbrados por la organización (no de terceros).

- **Generar el PDF del CFDI propio** · `Nuevo · C2 · prio Baja`
- **Reenviar el PDF por correo** · `Nuevo · C2 · prio Baja`
