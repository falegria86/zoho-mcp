# Análisis Técnico y Solicitud de Revisión de Integración

**Asunto:** Trámites de Transmisión Patrimonial (TP) exentos con importe $0.00 que no concluyen su flujo
**Dirigido a:** Alejandro Alanis — SIMUN
**Solicitado por:** Equipo SiGOB (SIR — Sistema Integral Recaudatorio)
**Fecha:** 2026-07-24

---

## 0. Ficha del caso

| Campo | Valor |
|---|---|
| Sistema | SiGOB / SIR |
| Portal | sigobproyectos |
| Proyecto | TLJ-CAT |
| Tarea Zoho (ID) | `106599000037735439` |
| Prioridad | Alta |
| Estado actual | No iniciada |
| Reportado / creado por | Jorge Iván González (SIGOB) |
| Responsable | Dulce Guadalupe González Barradas (SIGOB) |
| Revisión técnica previa con | Paolo Payán |
| Tercero involucrado | **SIMUN** (consume servicios de SiGOB/SIR) |
| Evidencia | 4 capturas de pantalla embebidas en la tarea de Zoho |

---

## 1. Resumen ejecutivo

En el módulo de **Transmisiones Patrimoniales (TP)**, cuando un trámite corresponde a un **acto exento** (importe $0.00), el flujo del trámite **no concluye**: aunque el contribuyente paga la Forma Universal en caja y los recibos se generan correctamente, el trámite **permanece detenido** porque el sistema no recibe la confirmación necesaria para marcarlo como **liquidado**.

Toda la evidencia recabada —y la revisión técnica realizada con Paolo Payán— **apunta a la integración con SIMUN** como el punto donde no se está ejecutando el proceso esperado para notificar que un trámite con adeudo $0.00 ha sido saldado.

Por lo anterior, se **solicita formalmente a Alejandro Alanis (SIMUN)** la revisión de los puntos de integración detallados en la sección 6.

---

## 2. Contexto del módulo

- El usuario selecciona la opción **"Exenta: SI"** en un trámite de TP.
- El sistema genera el trámite con un **importe de $0.00** (acto exento).
- En el paso de **Cobro de Transmisión Patrimonial**, el usuario selecciona **"Generar Cargos"** y el cargo se genera correctamente en **$0.00**.

---

## 3. Reproducción del problema (paso a paso)

| # | Paso | Resultado observado | Evidencia |
|---|---|---|---|
| 1 | Trámite de TP con **"Exenta: SI"** | Se genera el trámite con importe **$0.00** | Captura 1 (Zoho) |
| 2 | Cobro de TP → **"Generar Cargos"** | Cargo generado correctamente en **$0.00** | Captura 2 (Zoho) |
| 3 | Contribuyente paga **$240.00** (Forma Universal) en caja | Pago realizado; **recibos se generan correctamente** | — |
| 4 | Se espera que el trámite avance a **liquidado** | ❌ El flujo **permanece detenido**; el sistema **no recibe la confirmación** de liquidación | Capturas 3 y 4 (Zoho) |

> Las 4 capturas de pantalla se encuentran embebidas en la descripción de la tarea de Zoho (`106599000037735439`). Muestran: (1) el trámite generado en $0.00, (2) el cargo generado en $0.00, (3) la forma en que SIMUN consulta los adeudos y (4) la forma en que SIMUN los salda.

---

## 4. Evidencia recabada

1. El trámite exento se **genera correctamente** con importe $0.00.
2. El cargo asociado se **genera correctamente** en $0.00.
3. El pago de la Forma Universal ($240.00) se **procesa** y los **recibos se generan correctamente**.
4. Pese a lo anterior, el trámite **no se marca como liquidado** y **no continúa** con su flujo normal.
5. Revisión técnica con Paolo Payán: el problema **aparentemente radica en la integración con SIMUN**, ya que no se ejecuta el proceso esperado para **notificar que el trámite con adeudo $0.00 ha sido saldado**.

---

## 5. Análisis técnico / diagnóstico

**Hipótesis principal (basada en la evidencia): la falla está en la integración desde SIMUN, no en el SIR.**

Fundamento:

- **Argumento de descarte del SIR:** si el problema fuera del SIR, **los recibos no podrían generarse correctamente**. Dado que los recibos **sí se generan**, el núcleo recaudatorio de SiGOB/SIR está operando conforme a lo esperado.
- **Punto de falla observado:** la confirmación/notificación de que el trámite con importe $0.00 ha sido **saldado** no está llegando al SIR para que el trámite avance a liquidado.
- **Conclusión:** todo apunta a que la **integración desde SIMUN no está consumiendo los endpoints conforme al flujo definido**, específicamente en el **caso borde de importe/adeudo $0.00** (actos exentos).

> ⚠️ Esta es una hipótesis técnica sustentada en la evidencia disponible al 2026-07-24. Las pruebas de la sección 6 confirman que los endpoints del SIR responden correctamente con importe $0.00; la confirmación definitiva del lado de SIMUN requiere revisar sus trazas/logs (sección 7).

---

## 6. Endpoints del SIR que SIMUN debe consumir (evidencia)

Pruebas ejecutadas contra la API del SIR (`apisir.tlajomulco.gob.mx`) que demuestran que los endpoints **responden correctamente para el caso exento (importe $0.00)**. SIMUN debe consumir estos endpoints como parte del flujo de liquidación.

### 6.1 Consulta de adeudo del trámite

```
POST https://apisir.tlajomulco.gob.mx/catastro/predio-con-adeudos/adeudos-por-tramite/
```

- **Request:** `{ "clave_catastral_municipal": "93U335756", "plantilla_de_tramite_id": 1 }`
- **Respuesta:** `200 OK` — el trámite exento devuelve `impuesto: 0.0`, `recargos: 0.0`, `multa: 0.0`, etc. (adeudo total $0.00).
- **Evidencia A:** `1784922999644.png`

### 6.2 Registro de pago del trámite (genera el recibo)

```
POST https://apisir.tlajomulco.gob.mx/catastro/pago-tramite/registrar-pago/
```

- **Request:** `{ "clave_catastral_municipal": "93U335756", "plantilla_de_tramite_id": 1, "metodos_de_pago": [ { "metodo_de_pago_id": 1, "importe": 0 } ] }`
- **Respuesta:** `200 OK` — `"success": true`, `"mensaje": "Pago registrado exitosamente"`, recibo `folio: R-26-027085`, `importe_total: 0.0`.
- **Evidencia B:** `1784923027741.png`

> **Conclusión de la evidencia:** el endpoint `registrar-pago` del SIR **acepta y procesa correctamente el pago de $0.00** y genera el recibo. Por tanto, para que el trámite exento avance a **liquidado**, **SIMUN debe invocar este endpoint (`registrar-pago`) también cuando el importe es $0.00**. Si el flujo queda detenido, la evidencia indica que SIMUN no está consumiendo este endpoint (o lo omite cuando el importe es cero).

---

## 7. Solicitud formal de revisión a SIMUN

Se solicita a **Alejandro Alanis (SIMUN)** revisar y confirmar los siguientes puntos (⚠️ acciones a cargo de SIMUN):

1. ⚠️ Confirmar que SIMUN **invoca el endpoint `POST /catastro/pago-tramite/registrar-pago/`** también cuando el importe del trámite es **$0.00** (actos exentos).
2. ⚠️ Revisar el **manejo del caso borde importe $0.00**: verificar si la lógica de SIMUN **condiciona la llamada a `registrar-pago`** a que el importe/adeudo sea mayor a cero.
3. ⚠️ Confirmar que, tras el **pago de la Forma Universal ($240.00)**, SIMUN dispara la secuencia `adeudos-por-tramite` → `registrar-pago` conforme al flujo definido.
4. ⚠️ Revisar **logs/trazas de SIMUN** para el trámite de ejemplo (clave catastral `93U335756`) y verificar **si la llamada a `registrar-pago` se realizó y con qué respuesta**.
5. ⚠️ **Comparar contra un trámite NO exento** (importe > $0.00) que sí concluye, para aislar la diferencia de comportamiento.

---

## 8. Delimitación de responsabilidad

- **SiGOB/SIR:** genera el trámite, genera el cargo y emite los recibos correctamente. El núcleo recaudatorio funciona.
- **SIMUN:** consume los servicios de SiGOB/SIR. La evidencia indica que la notificación de liquidación para el caso $0.00 no se está ejecutando desde SIMUN.
- El equipo SiGOB queda disponible para **acompañar la revisión**, aportar la especificación de los endpoints de liquidación y validar en conjunto una vez SIMUN ajuste su integración.

---

## 9. Próximos pasos / checklist

- [ ] SIMUN (Alejandro Alanis) revisa los puntos 1–5 de la sección 6.
- [ ] SIMUN comparte trazas/logs del trámite de ejemplo.
- [ ] Se identifica si el caso borde $0.00 está contemplado en la integración de SIMUN.
- [ ] SIMUN ajusta la integración para notificar la liquidación en actos exentos.
- [ ] Validación conjunta SiGOB–SIMUN sobre ambiente de pruebas.
- [ ] Cierre del caso en Zoho (`106599000037735439`).

---

*Documento generado a partir de la tarea de Zoho `106599000037735439` (proyecto TLJ-CAT). No se ha modificado ningún dato en Zoho.*
