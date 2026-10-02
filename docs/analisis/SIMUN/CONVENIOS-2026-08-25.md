# Manual de Integración — Convenios de Pago (SIR ↔ SIMUN)

**Sistema:** SiGOB / SIR
**Módulo:** Recaudación · Impuesto Predial · Convenios de pago
**Dirigido a:** SIMUN
**Versión:** 1.0
**Fecha:** 2026-08-25

---

## 1. Propósito y alcance

Este documento especifica los dos endpoints del SIR que deben consumirse para operar
**convenios de pago** de impuesto predial:

1. **Consulta** de un predio con adeudos, incluyendo los datos del convenio y de la
   parcialidad por pagar.
2. **Saldado** de una parcialidad del convenio (emisión del recibo).

Se documentan los contratos de entrada y salida, la estructura de cada objeto, las reglas
de negocio aplicables y ejemplos completos de petición y respuesta.

> **Host de la API.** Las rutas se documentan en forma relativa. El placeholder
> `{BASE_API_SIR}` corresponde al host de la API del sitio (por ejemplo
> `https://apisir.<municipio>.gob.mx`). Sustitúyalo por el host del ambiente que
> corresponda.

---

## 2. Resumen del flujo

| # | Paso | Endpoint |
|---|---|---|
| 1 | Consultar el predio y sus adeudos | `POST /catastro/predio-con-adeudos/adeudos/` |
| 2 | Detectar si el predio tiene convenio (key `convenio` en la respuesta) | — |
| 3 | Leer la **siguiente parcialidad a pagar** (`parcialidades_de_convenio`) | — |
| 4 | Cobrar al ciudadano el importe de esa parcialidad | — |
| 5 | Registrar el pago y generar el recibo | `POST /recaudacion/recibos-convenio/` |

Punto clave: **la consulta devuelve una sola parcialidad** — la próxima por pagar. No
devuelve el calendario completo del convenio.

---

## 3. Endpoint 1 — Consulta de predio con adeudos y convenio

```
POST {BASE_API_SIR}/catastro/predio-con-adeudos/adeudos/
```

### 3.1 Parámetros de entrada

| Campo | Tipo | Descripción |
|---|---|---|
| `clave_catastral_municipal` | string | Clave catastral municipal del predio |
| `periodo` | int | Periodo a consultar |
| `bimestre` | int | Bimestre a consultar |

### 3.2 Comportamiento

Regresa los datos del predio junto con sus cargos y adeudos conforme al contrato ya
existente. Si el predio **tiene un convenio**, la respuesta incluye dos keys adicionales:
`convenio` y `parcialidades_de_convenio`.

### 3.3 Objeto `convenio`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | int | Identificador del convenio |
| `descripcion` | string | Descripción o nombre del convenio |
| `observaciones` | string | Observaciones del convenio |
| `folio` | string | Folio del convenio |
| `numero_de_pagos` | int | **Número de mensualidades, sin contar el anticipo** |
| `anticipo` | decimal | Importe del anticipo |
| `total` | decimal | Importe total del convenio, ya **con los recargos por parcialidad** |
| `pagado` | decimal | Importe abonado al convenio |
| `adeudo` | decimal | Importe pendiente por pagar |
| `fecha_de_solicitud` | datetime | Fecha de solicitud del convenio |
| `fecha_de_resolucion` | datetime \| null | Fecha de resolución |

**Regla del anticipo:** el anticipo cuenta como la **mensualidad 0**. Por lo tanto, si
`numero_de_pagos` = 9, los pagos totales son **10**: el anticipo más las 9 mensualidades.

**Regla de `total`:** es el importe total del convenio, que se pagará con todo y los
recargos por parcialidad. `adeudo` es cuánto queda pendiente por pagar.

### 3.4 Lista `parcialidades_de_convenio`

Es una lista, pero **trae una sola parcialidad**: la **siguiente a pagar**. Si toca pagar
la mensualidad 2, solo traerá la parcialidad 2.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | int | Id de la parcialidad |
| `mensualidad` | int | Número de mensualidad (**el anticipo es 0**) |
| `numero_de_parcialidad` | string/int | Mismo valor que `mensualidad`, pero **renombra la mensualidad 0 como `"anticipo"`** |
| `numero_de_parcialidades` | int | Total de mensualidades, **sin contar el anticipo** |
| `fecha_de_vencimiento` | datetime | Fecha de vencimiento del convenio |
| `importe_de_la_parcialidad` | decimal | Importe de la parcialidad |
| `total_abonado` | decimal | Importe abonado a esta parcialidad |
| `adeudo` | decimal | `importe_de_la_parcialidad − total_abonado` |
| `saldado` | bool | `true` si `adeudo` es 0. **Por la naturaleza de la petición siempre llegará `false`** |
| `cargos_a_pagar` | array | Cargos que se deben pagar en esa parcialidad (§3.5) |

Los tres campos `total_abonado`, `adeudo` y `saldado` **dependen uno del otro**, en ese
orden de derivación.

### 3.5 Lista `cargos_a_pagar`

Lista de los cargos que se deben pagar en esa parcialidad.

| Campo | Tipo | Descripción |
|---|---|---|
| `cargo_id` | int | Id del cargo |
| `descripcion` | string | Descripción del cargo |
| `tipo_de_cargo_id` | int | Id del tipo de cargo |
| `tipo_de_cargo_descripcion` | string | Descripción del tipo de cargo |
| `importe` | decimal | Cantidad con la que **se creó** el cargo. **Es permanente** |
| `adeudo` | decimal | **Lo pendiente por pagar.** Es el campo que cambia |
| `total_abonado` | decimal | Lo que se ha pagado de ese cargo |
| `cargo_descuento` | decimal | Descuento aplicado al cargo |
| `recargo_importe` | decimal | Adeudo del accesorio: recargo |
| `recargo_descuento` | decimal | Descuento del recargo |
| `actualizacion_importe` | decimal | Adeudo del accesorio: actualización |
| `actualizacion_descuento` | decimal | Descuento de la actualización |
| `gasto_importe` | decimal | Adeudo del accesorio: gasto |
| `gasto_descuento` | decimal | Descuento del gasto |

#### Reglas críticas de cálculo

1. **Usar `adeudo`, no `importe`, para hacer cálculos.** `importe` es permanente: si el
   cargo se creó en 100, se queda en 100 aunque esté pagado. `adeudo` es lo pendiente.
2. `importe` se envía **solo por si se necesita saber cuánto se debía originalmente**.
3. Los campos de accesorios (`recargo_*`, `actualizacion_*`, `gasto_*`, `cargo_descuento`)
   son **los adeudos de los accesorios ligados al cargo**.
4. **Puede ocurrir que el `adeudo` del cargo sea 0 y el de sus accesorios sea mayor a 0.**
   Esto se debe al orden en el que se aplican los pagos.

#### Prelación en la aplicación de pagos

```
multas  >  recargos  >  actualizaciones  >  cargos
```

Los pagos se aplican en ese orden. Es la razón por la que un cargo puede quedar en
`adeudo = 0` mientras sus accesorios siguen con saldo.

### 3.6 Ejemplo de respuesta

Se muestran únicamente los keys correspondientes al convenio; el resto de la respuesta del
predio conserva el contrato existente.

```json
"convenio": {
    "id": 26,
    "descripcion": "PRUEBA",
    "observaciones": "PRUEBA",
    "numero_de_pagos": 3,
    "anticipo": 5310.0,
    "total": 10667.15,
    "pagado": 0.0,
    "adeudo": 10667.15,
    "folio": "0000025/CONVENIO/26",
    "fecha_de_solicitud": "2026-08-20T00:00:00",
    "fecha_de_resolucion": null
},
"parcialidades_de_convenio": [
    {
        "id": 43,
        "mensualidad": 0,
        "numero_de_parcialidad": "anticipo",
        "numero_de_parcialidades": 3,
        "fecha_de_vencimiento": "2026-08-20T11:02:18.754331",
        "importe_de_la_parcialidad": 5310.0,
        "total_abonado": 0.0,
        "adeudo": 5310.0,
        "saldado": false,
        "cargos_a_pagar": [
            {
                "cargo_id": 10069508,
                "descripcion": "IMPUESTO PREDIAL BIMESTRE 3",
                "tipo_de_cargo_id": 201,
                "tipo_de_cargo_descripcion": "IMPUESTO PREDIAL BIMESTRE 3",
                "importe": 710.65,
                "adeudo": 710.65,
                "total_abonado": 0.0,
                "cargo_descuento": 0.0,
                "recargo_importe": 314.49,
                "recargo_descuento": 0.0,
                "actualizacion_importe": 46.73,
                "actualizacion_descuento": 0.0,
                "gasto_importe": 0.0,
                "gasto_descuento": 0.0
            },
            {
                "cargo_id": 10069507,
                "descripcion": "IMPUESTO PREDIAL BIMESTRE 4",
                "tipo_de_cargo_id": 202,
                "tipo_de_cargo_descripcion": "IMPUESTO PREDIAL BIMESTRE 4",
                "importe": 704.12,
                "adeudo": 704.12,
                "total_abonado": 0.0,
                "cargo_descuento": 0.0,
                "recargo_importe": 307.5,
                "recargo_descuento": 0.0,
                "actualizacion_importe": 47.19,
                "actualizacion_descuento": 0.0,
                "gasto_importe": 0.0,
                "gasto_descuento": 0.0
            },
            {
                "cargo_id": 10069506,
                "descripcion": "IMPUESTO PREDIAL BIMESTRE 5",
                "tipo_de_cargo_id": 203,
                "tipo_de_cargo_descripcion": "IMPUESTO PREDIAL BIMESTRE 5",
                "importe": 693.06,
                "adeudo": 693.06,
                "total_abonado": 0.0,
                "cargo_descuento": 0.0,
                "recargo_importe": 300.51,
                "recargo_descuento": 0.0,
                "actualizacion_importe": 43.12,
                "actualizacion_descuento": 0.0,
                "gasto_importe": 0.0,
                "gasto_descuento": 0.0
            },
            {
                "cargo_id": 10069505,
                "descripcion": "IMPUESTO PREDIAL BIMESTRE 6",
                "tipo_de_cargo_id": 204,
                "tipo_de_cargo_descripcion": "IMPUESTO PREDIAL BIMESTRE 6",
                "importe": 682.88,
                "adeudo": 682.88,
                "total_abonado": 0.0,
                "cargo_descuento": 0.0,
                "recargo_importe": 293.53,
                "recargo_descuento": 0.0,
                "actualizacion_importe": 39.92,
                "actualizacion_descuento": 0.0,
                "gasto_importe": 0.0,
                "gasto_descuento": 0.0
            },
            {
                "cargo_id": 10069516,
                "descripcion": "IMPUESTO PREDIAL BIMESTRE 1",
                "tipo_de_cargo_id": 205,
                "tipo_de_cargo_descripcion": "IMPUESTO PREDIAL BIMESTRE 1",
                "importe": 670.7,
                "adeudo": 670.7,
                "total_abonado": 0.0,
                "cargo_descuento": 0.0,
                "recargo_importe": 286.54,
                "recargo_descuento": 0.0,
                "actualizacion_importe": 34.73,
                "actualizacion_descuento": 0.0,
                "gasto_importe": 0.0,
                "gasto_descuento": 0.0
            },
            {
                "cargo_id": 10069515,
                "descripcion": "IMPUESTO PREDIAL BIMESTRE 2",
                "tipo_de_cargo_id": 206,
                "tipo_de_cargo_descripcion": "IMPUESTO PREDIAL BIMESTRE 2",
                "importe": 218.56,
                "adeudo": 218.56,
                "total_abonado": 0.0,
                "cargo_descuento": 0.0,
                "recargo_importe": 187.59,
                "recargo_descuento": 0.0,
                "actualizacion_importe": 30.97,
                "actualizacion_descuento": 0.0,
                "gasto_importe": 0.0,
                "gasto_descuento": 0.0
            },
            {
                "cargo_id": 10069514,
                "descripcion": "IMPUESTO PREDIAL BIMESTRE 3",
                "tipo_de_cargo_id": 207,
                "tipo_de_cargo_descripcion": "IMPUESTO PREDIAL BIMESTRE 3",
                "importe": 174.72,
                "adeudo": 174.72,
                "total_abonado": 0.0,
                "cargo_descuento": 0.0,
                "recargo_importe": 174.72,
                "recargo_descuento": 0.0,
                "actualizacion_importe": 0.0,
                "actualizacion_descuento": 0.0,
                "gasto_importe": 0.0,
                "gasto_descuento": 0.0
            },
            {
                "cargo_id": 10069513,
                "descripcion": "IMPUESTO PREDIAL BIMESTRE 4",
                "tipo_de_cargo_id": 208,
                "tipo_de_cargo_descripcion": "IMPUESTO PREDIAL BIMESTRE 4",
                "importe": 174.72,
                "adeudo": 174.72,
                "total_abonado": 0.0,
                "cargo_descuento": 0.0,
                "recargo_importe": 174.72,
                "recargo_descuento": 0.0,
                "actualizacion_importe": 0.0,
                "actualizacion_descuento": 0.0,
                "gasto_importe": 0.0,
                "gasto_descuento": 0.0
            }
        ]
    }
]
```

**Lectura del ejemplo:** convenio de `numero_de_pagos: 3` (anticipo + 3 mensualidades =
4 pagos). La parcialidad devuelta es la **mensualidad 0**, es decir el **anticipo**, por
`5310.00`, integrada por 8 cargos de impuesto predial con sus recargos y actualizaciones.

---

## 4. Endpoint 2 — Saldar una parcialidad del convenio

```
POST {BASE_API_SIR}/recaudacion/recibos-convenio/
```

### 4.1 Cuerpo de la petición — nivel raíz

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `metodos_de_pago` | array | Sí | Lista de los métodos de pago usados (§4.2) |
| `es_convenio` | bool | Sí | Debe enviarse en **`true`** |
| `ciudadano` | int | Sí | Id del ciudadano ligado al padrón |
| `convenio` | int | Sí | Id del convenio |
| `padrones` | array | Sí | Lista de padrones a pagar (§4.3) |

### 4.2 `metodos_de_pago[]`

| Campo | Tipo | Descripción |
|---|---|---|
| `metodo` | int | Id del método de pago usado |
| `importe` | decimal | Lo que se pagó con ese método de pago |

> **Regla:** la **suma de los importes de los métodos de pago debe ser igual al total de
> la parcialidad.**

### 4.3 `padrones[]`

| Campo | Tipo | Descripción |
|---|---|---|
| `padron_id` | int | Id del padrón |
| `tipo_de_padron` | int | Id del tipo de padrón |
| `parcialidades` | array\<int\> | Ids de las parcialidades a pagar |
| `cargos` | array\<int\> | Ids de los cargos a pagar |
| `importe` | decimal | Importe **con redondeo aplicado** (§4.4) |
| `importe_sin_redondeo` | decimal | Importe **sin redondeo aplicado** (§4.4) |
| `convenio` | int | Id del convenio. Se envía **también dentro de cada padrón**, además del nivel raíz |

### 4.4 Reglas de redondeo — **crítico**

`importe` e `importe_sin_redondeo` son **valores diferentes** que dependen de las reglas
de redondeo del sitio:

| Campo | Regla |
|---|---|
| `importe` | Redondeado: **de 0.51 o mayor redondea hacia arriba**; **de 0.50 o menor redondea hacia abajo** |
| `importe_sin_redondeo` | La cantidad **sin el redondeo aplicado** |

> ⚠️ **Esto es muy importante:** si el sitio **no redondea** y cobra con centavos,
> entonces `importe` debe ir **también sin redondear**. Es decir, ambos campos llevan el
> mismo valor cuando el sitio no aplica redondeo.

### 4.5 Ejemplo de petición

```json
{
    "metodos_de_pago": [
        {
            "metodo": 1,
            "importe": 3005.11
        }
    ],
    "es_convenio": true,
    "ciudadano": 1,
    "padrones": [
        {
            "padron_id": 78080,
            "tipo_de_padron": 3,
            "parcialidades": [
                11371
            ],
            "cargos": [
                14080523,
                14080524
            ],
            "importe": 3005.11,
            "importe_sin_redondeo": 3005.11,
            "convenio": 10231
        }
    ],
    "convenio": 10231
}
```

**Lectura del ejemplo:** un solo método de pago (`metodo: 1`) por `3005.11`, que coincide
con el `importe` del padrón; un padrón con una parcialidad (`11371`) y dos cargos. El
sitio del ejemplo **no aplica redondeo**: `importe` e `importe_sin_redondeo` son iguales.

---

## 5. Reglas de negocio consolidadas

| # | Regla | Impacto en la integración |
|---|---|---|
| 1 | El anticipo es la **mensualidad 0** | `numero_de_pagos` + 1 = pagos totales del convenio |
| 2 | `numero_de_parcialidad` renombra la mensualidad 0 como `"anticipo"` | El campo puede llegar como **string**, no solo como número |
| 3 | La consulta devuelve **solo la siguiente parcialidad** | No construir el calendario completo a partir de esta respuesta |
| 4 | `saldado` **siempre llega `false`** en esta petición | No usarlo como señal de estado |
| 5 | Usar **`adeudo`** para todo cálculo de cobro; `importe` es histórico y permanente | Un cargo pagado sigue mostrando su `importe` original |
| 6 | Los accesorios pueden tener adeudo aunque el cargo esté en 0 | Sumar los accesorios; no cortar el cálculo si `adeudo` del cargo es 0 |
| 7 | Prelación de pagos: `multas > recargos > actualizaciones > cargos` | Explica el caso de la regla 6 |
| 8 | La suma de `metodos_de_pago` debe igualar el total de la parcialidad | Validar antes de enviar; evita rechazos del recibo |
| 9 | Si el sitio no redondea, `importe` va **sin redondear** | Ambos campos de importe llevan el mismo valor |

---

## 6. Checklist de implementación

- [ ] Consumir `POST /catastro/predio-con-adeudos/adeudos/` con `clave_catastral_municipal`, `periodo` y `bimestre`.
- [ ] Detectar la presencia del key `convenio` y cambiar al flujo de convenio.
- [ ] Presentar al ciudadano **la parcialidad devuelta** (la siguiente por pagar), no el calendario completo.
- [ ] Manejar `numero_de_parcialidad` con valor `"anticipo"` (tipo string) sin romper el parseo.
- [ ] Calcular el cobro con `adeudo`, nunca con `importe`.
- [ ] Sumar los adeudos de accesorios (`recargo_*`, `actualizacion_*`, `gasto_*`) aunque el cargo esté en 0.
- [ ] No usar `saldado` como indicador de estado (siempre llega `false`).
- [ ] Validar que la suma de `metodos_de_pago` sea igual al total de la parcialidad **antes** de enviar.
- [ ] Aplicar la regla de redondeo del sitio y enviar `importe` / `importe_sin_redondeo` en consecuencia.
- [ ] Enviar `es_convenio: true`, `ciudadano`, `convenio` y el arreglo `padrones` con parcialidades y cargos.
- [ ] Consumir `POST /recaudacion/recibos-convenio/` y conservar el folio del recibo emitido.
- [ ] Probar el caso del **anticipo** (mensualidad 0) y el de una **mensualidad intermedia**.

---

*SiGOB · Manual de Integración — Convenios de Pago · Versión 1.0 · 2026-08-25*
