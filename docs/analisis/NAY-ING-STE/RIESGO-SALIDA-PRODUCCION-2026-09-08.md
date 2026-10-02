# Validación de DevOps e Infraestructura antes de salir a producción

**Proyecto:** Ecosistema Hacienda Nayarit · NAY-ING-STE
**Hito:** [Remediación de calidad y seguridad](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037479054)
**Base del análisis:** 14 subtareas, **64 comentarios** y 11 PRs · **Fecha:** 2026-09-08
**Dirigido a:** DevOps e Infraestructura

## Por qué les llega esto

Al revisar los comentarios de cada subtarea aparecen **cuatro temas que dependen de infraestructura y que hoy nadie ha cerrado**, más cuatro sin iniciar que necesitan su valoración. Dos ya fueron consultados a infra en Zoho y quedaron sin respuesta definitiva.

## Lo que necesitamos de ustedes

| # | Petición | Estado hoy | Riesgo si no se valida |
|---|---|---|---|
| 1 | **Confirmar el comportamiento de HTTPS en productivo con el balanceador Huawei.** Infra ya dijo que no está 100% seguro | Pruebas internas | 🔴 Sitio caído |
| 2 | **Definir dónde se emiten las cabeceras de seguridad** (nginx o Django) y con qué valores. Hoy solo consta una de cinco | Pruebas internas | 🔴 Cobro caído |
| 3 | **Validar el rate limiting del webhook de NetPay:** quedó en 10 req/min por IP | Pruebas internas | 🔴 Pagos sin conciliar |
| 4 | **Revisar la config de nginx del iframe de la pasarela.** Ya provocó una falla el 25-ago | Listo para QA | 🟠 Cobro caído |
| 5 | **Tomar la restricción de CORS.** Asignada a Miguel Ángel Ramos desde el 21-jul, sin arrancar | No iniciada | 🟠 Fuga de datos |
| 6 | **Retomar el bloqueo del reporteador ASP.NET.** Se canceló por ser tema de firewall | Cancelada | 🟠 App interna expuesta |
| 7 | **Definir quién ejecuta la rotación de llaves NetPay de producción.** Sin un solo comentario | No iniciada | 🔴 Riesgo financiero |
| 8 | **Valorar palancas de infra para rendimiento:** compresión, caché, CDN, imágenes | No iniciada | 🟡 Experiencia |

> ### 🔴 El punto más urgente
> El 14-ago Arlethe Mora preguntó en Zoho si el cambio de nginx era correcto. **Miguel Ángel Ramos respondió:**
> *"en el servidor de pruebas el cambio debería funcionar correctamente, ya que el balanceo lo realiza Nginx y tenemos control de que el acceso se maneja mediante HTTPS. En productivo, en teoría también debería funcionar, ya que el balanceador de Huawei es el que gestiona el certificado y la conexión externa es HTTPS. **Sin embargo, en ese punto no estoy 100 % seguro**"*
>
> Esa duda sigue abierta y la subtarea sigue en pruebas internas.

---

# Lo que está en pruebas internas: qué se hizo y qué falta

*Reconstruido de los comentarios. "No consta" = no aparece en Zoho; puede estar hecho y sin registrar.*

## 1 · Forzar HTTPS en redirects y paginación DRF
[https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037475081](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037475081)

**Qué se hizo**
- `USE_X_FORWARDED_HOST = True` en `production.py` y `development.py` (Arlethe, 27-jul)
- Ajuste para que el servidor mande https y agregue `/api` — PR [nay_opensir#116](https://github.com/sigob-open-source/nay_opensir/pull/116), 13-ago
- Modificación de un archivo de configuración de **nginx** — PR [nay_opensir#101](https://github.com/sigob-open-source/nay_opensir/pull/101)

**Qué falta o no consta**
- **La validación en productivo.** Arlethe desde el 27-jul: *"Esta es la prueba en local pero se necesitaría confirmar en el servidor"*. Infra respondió que no está seguro por el balanceador Huawei.
- **No consta que se haya activado `SECURE_SSL_REDIRECT`**, que es lo que pide textualmente el criterio de aceptación. Lo que aparece es `USE_X_FORWARDED_HOST`, que resuelve la generación de URLs pero no fuerza la redirección.

**Qué puede fallar:** bucle de redirección infinito si el balanceador Huawei no envía `X-Forwarded-Proto` como Django espera → `ERR_TOO_MANY_REDIRECTS` y **cae el sitio completo**. También health checks internos por HTTP recibiendo redirect.

| Rol | Quién / qué confirmar |
|---|---|
| Ejecutó | Arlethe Mora |
| Código | Paolo Payán |
| **Infraestructura** | **Miguel Ángel Ramos.** Confirmar que el balanceador Huawei envía `X-Forwarded-Proto` y que `SECURE_PROXY_SSL_HEADER` coincide |
| Aprueba | Dulce Gonzalez |

## 2 · Cabeceras de seguridad HTTP
[https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037480070](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037480070)

**Qué se hizo:** solo consta `SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'`, verificado con Postman (Arlethe, 27-jul).

> 🔴 **El criterio pide cinco cabeceras y solo consta una.** Faltan por confirmar **CSP, HSTS, X-Frame-Options y X-Content-Type-Options** — las dos de mayor impacto (CSP y HSTS) entre ellas. Es el hallazgo **P090, CRÍTICO** en el pentest, y lleva en pruebas internas desde el 11-ago.

**Qué puede fallar**
- **Si no están implementadas:** el hallazgo crítico sigue abierto y no debería darse por cerrado.
- **Si se implementan mal:** una CSP con allowlist incompleta **bloquea el checkout de NetPay**. El propio criterio lo advierte.
- **HSTS de un año es irreversible en la práctica:** el estado vive en el navegador de cada usuario. Con `includeSubDomains`, un subdominio sin certificado válido queda inaccesible y **el rollback no lo arregla**.

| Rol | Quién / qué confirmar |
|---|---|
| Ejecutó | Arlethe Mora (solo Referrer-Policy consta) |
| **Infraestructura** | **Definir dónde se emiten las cabeceras:** nginx o Django. Si van en nginx es trabajo de infra. Definir `max-age` de HSTS y si se activa `includeSubDomains` |
| QA | Checkout NetPay y mapas con CSP activa, escritorio y móvil |
| Aprueba | Dulce Gonzalez |

> **Mitigación.** CSP como `Content-Security-Policy-Report-Only` para medir con tráfico real. HSTS escalonado: 300 s → 86400 s → un año.

## 3 · Endpoints sin autenticación: se resolvió distinto a lo planteado
[https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037475078](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037475078)

Dulce planteó el 21-jul: *"aunque sabemos que deben ser públicos debe existir algún mecanismo para no exponerlos"*. Arlethe implementó **rate limiting en 21 endpoints públicos** con DRF Throttling por IP:

| Nivel | Límite | Endpoints |
|---|---|---|
| ALTO | 10 req/min | 3 de escritura sin auth: adeudos, **webhook_netpay**, lecturas_arcos |
| MEDIO | 60 req/min | 5 de lectura con datos del ciudadano |
| BAJO | 200 req/min | 13 catálogos |

> 🔴 **Riesgo concreto para infra: `webhook_netpay` quedó limitado a 10 req/min por IP.** Ese endpoint lo llama la pasarela, no un ciudadano. Si NetPay notifica desde un rango acotado de IPs y hay un pico de transacciones, **las notificaciones de pago legítimas empiezan a ser rechazadas**: el ciudadano paga y el pago no se concilia. Confirmar el volumen real de callbacks, o excluir ese endpoint del throttling y protegerlo por firma.

**Qué falta**
- El criterio dice que los endpoints sensibles **requieren autenticación**; se implementó rate limiting, que es otra mitigación. **El criterio no se cumple como está escrito:** hay que actualizarlo dejando constancia, o aceptar el riesgo formalmente.
- No consta que se haya atendido **ocultar el mapa de endpoints en el bundle**.

> **Nota técnica:** si el throttling identifica por IP del cliente y el tráfico entra por el balanceador, verificar que se lee la IP real y no la del proxy. Si lee la del proxy, **todos los usuarios comparten el mismo cupo**.

## 4 · SonarQube opensir: más avanzado de lo que parecía
[https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037486061](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037486061)

Arlethe, 27-jul: *"Se corrigieron los hallazgos encontrados, solo quedó sin realizarse uno (P024 Duplicate strings) que es afectar todas las migraciones históricas porque esos son archivos que ya se ejecutaron y modificarlos es innecesario y riesgoso"*.

> ✅ **Decisión correcta y ya tomada.** P024 es la regla más voluminosa (1059 ocurrencias, 361 h estimadas) y apuntaba a `migrations/`. Excluirla evita romper el historial de Django. Esto también explica la diferencia entre las 8 h asignadas y las ~777 h que estimaba Sonar: el grueso se excluyó a propósito.

**Lo que sigue siendo riesgo**
- **P031 `python:S4830` (13) — validación de certificado TLS.** Toda integración con certificado autofirmado empieza a fallar. Está en tareas asíncronas → **fallan en silencio**. **Infra debe confirmar que los servicios consumidos tienen certificados válidos.**
- **P026 `python:S5754` (162)** — excepciones que antes se tragaban ahora propagan → 500 nuevos en catastro.
- **P036 `python:S2068` (5) — credenciales hardcodeadas.** Si se movieron a variables de entorno, **deben quedar configuradas en producción**.

## 5 · SonarQube retys y rotación de tokens Mapbox
[https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037486064](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037486064)

- P060, P061, P062 resueltos y después *"se solucionaron los hallazgos restantes"* — PRs [tramites#89](https://github.com/sigob-open-source/tramites/pull/89) y [nay_retys#1](https://github.com/sigob-open-source/nay_retys/pull/1). Conflictos con `dev-vps` resueltos el 31-jul.
- Tokens Mapbox rotados con restricción por dominio — PRs [nay_OPENSIR-FRONTEND#52](https://github.com/sigob-open-source/nay_OPENSIR-FRONTEND/pull/52), [nay_ventanilla-unica#29](https://github.com/sigob-open-source/nay_ventanilla-unica/pull/29), [nay_retys#2](https://github.com/sigob-open-source/nay_retys/pull/2).

> **A confirmar.** P067 reporta un `accessToken` de Mapbox hardcodeado en `src/components/MultipleMap.jsx`. La rotación incluye un PR sobre `nay_retys`, así que probablemente ya quedó cubierto, pero **no consta explícitamente que ese token sea el que se reemplazó**. Verificación rápida antes de liberar.

## 6 · Datos de pago en localStorage y SRI de NetPay
[https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037475075](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037475075)

- Cambios en PR [nay_ventanilla-unica#30](https://github.com/sigob-open-source/nay_ventanilla-unica/pull/30), construido sobre la rama del PR [#26](https://github.com/sigob-open-source/nay_ventanilla-unica/pull/26). **Dependencia de orden: primero el 26, después el 30.** Mario Merel confirmó el 8-sep que ya está en QA.
- SDK de NetPay autohospedado con script `fetch:netpay-sdk` en `package.json` para regenerar los valores de integridad — PR [#33](https://github.com/sigob-open-source/nay_ventanilla-unica/pull/33).

> 🔴 **Incidente relevante, 25 de agosto.** Jair Guerrero reportó un error validando el pago en línea. Alejandro León diagnosticó: *"parece ser que la config de nginx es la que está haciendo que el iframe donde está alojado la pasarela de pagos de netpay truene"*. **Ya hay precedente de que la config de nginx rompe el cobro en línea** — refuerza las peticiones 1 y 2.

**Qué falta:** el 8-sep aparecieron conflictos en DEV que Alejandro German está resolviendo. Y autohospedar el SDK obliga a actualización manual: **hay que definir quién vigila las actualizaciones de seguridad del SDK de NetPay**.

---

# Lo que está sin iniciar y necesita su valoración

| Riesgo | Subtarea | Qué dicen los comentarios | Qué valorar |
|---|---|---|---|
| 🔴 CRÍTICO | **[Llaves NetPay en el bundle](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037486067)**<br>No iniciada · **cero comentarios** | **Ninguno.** Única subtarea sin un solo comentario | `sk_netpay_*` expuestas permiten reembolsos. **Hay que rotarlas en producción, no solo moverlas.** Definir quién ejecuta y coordinar con NetPay para no cortar el cobro |
| 🟠 IMPORTANTE | **[Restringir CORS](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037486071)**<br>No iniciada | Dulce, 21-jul: *"@miguel angel ramos luna esta es tuya"*. Sin actividad desde entonces | **Ya asignada a infra, mes y medio sin arrancar.** Lista blanca en los tres backends, inventariando antes los consumidores |
| 🟠 IMPORTANTE | **[Reporteador ASP.NET público](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037479061)**<br>**Cancelada** | Arlethe, 27-jul: *"esta tarea me parece que es más de infraestructura que de código, quizás restricciones desde el firewall"* | **Se canceló porque es de infra, no porque el riesgo se resolviera.** Sigue accesible desde Internet. Valorar IP/VPN/red interna y reabrir o documentar riesgo aceptado |
| 🟡 CRÍTICO (rend.) | **[Rendimiento portal público](https://projects.zoho.com/portal/sigobproyectos#zp/task-detail/106599000037486076)**<br>No iniciada | Alejandro León, 10-ago: bloqueada hasta cerrar NABO-T161, T153 y T104 por conflictos con NetPay | 7220 ms bloqueando render y 4383 KiB de imágenes. **Buena parte se resuelve desde infra sin tocar código:** compresión, caché, HTTP/2, CDN, conversión de imágenes |

> **Dos de las cuatro sin iniciar son de infraestructura.** No están detenidas por falta de desarrollo, sino esperando una definición de su lado.

## Orden de despliegue sugerido

1. **localStorage y retys** — menor radio de impacto.
2. **HTTPS** en ventana de mantenimiento, **solo después de que infra confirme el balanceador Huawei**.
3. **Cabeceras** con CSP en Report-Only y HSTS escalonado, una vez definido si van en nginx o Django.
4. **Endpoints y throttling**, tras validar el límite del webhook de NetPay.
5. **SonarQube opensir**, con diff revisado y certificados confirmados.

> **HTTPS y cabeceras no deben salir el mismo día.** Si algo falla no se distinguirá si fue la redirección o la CSP, y con HSTS emitido el rollback no devuelve al estado anterior.

## Alcance y limitaciones

Construido leyendo descripciones, estados, dueños, revisores y **los 64 comentarios** de las 14 subtareas en Zoho. **No se revisó el código fuente, los PRs ni la configuración real de los servidores.**

Cuando se indica que algo "no consta", significa que no aparece en los comentarios: puede estar hecho y sin registrar. Por eso varias peticiones son de confirmación, no de ejecución.

*Insumo para la decisión, no la sustituye: la validación técnica y la aprobación de salida corresponden al Tech Lead, al área de infraestructura y al PO.*
