# Backlog detallado — Plataforma CFDI Integral (SIGOB)

**Referencia licitación:** LPE-SA-SA-0069-09/2024  
**Alcance:** tareas de programación únicamente.  
**Jerarquía:** Hito (épica) → Tarea (funcionalidad = entregable) → Subtarea (requisito).  
**Escrito para:** el programador que va a implementar. Cada tarea explica *qué* se hace, *por qué* existe y *cómo* encaja con lo demás, en lenguaje claro.

## Cómo leer este documento

- **Estado:** *Existe* (ya construido, solo validar) · *Adaptar* (existe pero hay que ajustarlo) · *Automatizar* (existe pero hoy se hace a mano) · *Nuevo* (desde cero) · *Auditar* (primero investigar).
- **Capa:** *C0* validación/seguridad previa · *C1* obligatorio por la licitación · *C2* valor agregado (no lo pide la licitación, pero da ventaja de producto).
- **Fuente que usa:** algunas funciones trabajan sobre datos locales (siempre disponibles), otras sobre datos del SAT (requieren AutoPAC), y algunas sobre ambos. Se indica en cada tarea. La pieza de la que depende todo el análisis no es la descarga, sino el modelo de datos (C.1).

### Glosario rápido (para entender el resto del documento)

- **CFDI:** la factura electrónica oficial de México (un archivo XML). Todo gira alrededor de procesar estos archivos.
- **Timbrar:** el acto de sellar y registrar oficialmente un CFDI ante el SAT para que sea válido.
- **PAC:** el proveedor autorizado que timbra ante el SAT. La plataforma puede usar tres vías distintas para timbrar: **SW** (un PAC externo llamado Smarter Web), **autopac** (una integración vieja por SOAP) y **autopac_oax** (una API propia en Java). Cuál se usa depende de cómo esté configurada cada entidad.
- **Descarga masiva:** un servicio del SAT que permite bajar de golpe todos los CFDI de un periodo, en vez de uno por uno. Es *una* de las dos fuentes de datos para el análisis (la otra son los datos locales). Requiere AutoPAC.
- **Las dos fuentes de datos para análisis.** El análisis puede alimentarse de dos orígenes independientes, y el usuario elige cuál consultar:
  - **Datos locales:** todos los CFDI que la entidad ha timbrado *a través de esta plataforma*. Ya se guardan hoy; se desmenuzan para análisis en el momento del timbrado. Están disponibles siempre, para toda entidad, sin necesidad de AutoPAC. Su cobertura arranca en la fecha del primer CFDI que la entidad timbró en la plataforma.
  - **Datos del SAT:** todo lo que el SAT tiene registrado a nombre de la entidad, consultable por rango de fechas, sin importar por qué medio se timbró. Se obtienen con la descarga masiva y **solo están disponibles si la entidad tiene AutoPAC**.
- **Entidad / tenant:** cada dependencia u organismo de gobierno que usa la plataforma. Cada una tiene sus datos aislados de las demás.
- **CSD / e.firma / FIEL:** los certificados y llaves con los que una entidad firma y timbra. Son datos muy sensibles: con ellos se puede facturar a nombre del gobierno.
- **Conciliar:** en este documento hay dos conciliaciones distintas. (1) **Conciliación fiscal:** comparar lo timbrado contra lo retenido y lo enterado (pagado) al SAT; cuando no cuadran, hay una incidencia. (2) **Conciliación local vs. SAT (auditoría):** comparar lo que la entidad timbró en la plataforma contra lo que el SAT tiene registrado a su nombre, emparejando por UUID, para detectar faltantes o timbrados por otros medios.
- **UUID:** el folio fiscal único de cada CFDI. Es idéntico en la plataforma y en el SAT, por eso sirve para emparejar un CFDI local con su equivalente en el SAT.

> **Nota de responsabilidad.** Los estados, los hallazgos de seguridad y las reglas de conciliación de este documento son propuestas basadas en el análisis del código existente y de la licitación. La validación técnica, de seguridad (OWASP) y fiscal es responsabilidad del equipo humano antes de cualquier puesta en producción. En particular, ninguna regla de cálculo fiscal debe darse por buena sin que la valide un contador o fiscalista.

---

## HITO 0 — Poner en orden y asegurar lo que ya existe

Antes de construir cosas nuevas hay que asegurarse de que lo que ya está construido funciona bien y es seguro. La plataforma hoy no tiene pruebas automatizadas y tiene varios puntos de seguridad abiertos. Como vamos a manejar datos fiscales de dependencias de gobierno, esto no es opcional: es lo primero. Piensa en este hito como 'reforzar los cimientos antes de construir los pisos de arriba'.

### 0.1 Crear pruebas automáticas de lo que ya funciona

`Nuevo · C0`

Hoy, cada vez que alguien toca el código, no hay forma automática de saber si rompió algo que antes funcionaba. Se prueba a mano, lo cual es lento y se escapan errores. Esta tarea consiste en escribir pruebas de software que revisen solas, en segundos, que las funciones importantes (timbrar facturas, timbrar nómina, timbrar pagos, cancelar, y elegir por cuál PAC timbrar) siguen funcionando bien. Estas pruebas se corren siempre contra el ambiente de práctica del SAT (sandbox), nunca contra el real, para no generar facturas de verdad por error. Es la red de seguridad que va a proteger todo el desarrollo posterior.

**Qué se entrega al terminar.** Un conjunto de pruebas que se ejecuta con un solo comando, que revisa cada función importante y avisa en verde (bien) o rojo (algo se rompió), y que corre automáticamente cada vez que se sube código.

**Cuándo se considera aceptada.**
- Cada función importante tiene al menos una prueba de que funciona bien y una de que maneja bien los errores.
- Las pruebas nunca tocan el SAT real, solo el de práctica.
- Toda la batería se corre con un solo comando.
- Se acuerda con el equipo un mínimo de cobertura sobre timbrado y ruteo de PAC.
- Ninguna contraseña o llave real queda escrita dentro de las pruebas.

**Cómo probarla.** Correr las pruebas en una máquina limpia con credenciales de práctica. Para comprobar que las pruebas de verdad sirven, romper un endpoint a propósito y confirmar que la prueba correspondiente se pone en rojo.

**Smoke tests para QA.**
- Correr toda la batería y que no haya errores de configuración de las pruebas mismas.
- Romper algo a propósito y confirmar que una prueba lo detecta (la 'prueba de la prueba').
- Confirmar que durante las pruebas no se hizo ninguna llamada al SAT real.

**Subtareas (lo que hay que hacer para lograrla).**

- **Pruebas de timbrado CFDI 4.0** · `Nuevo · C0 · prio Alta`  
  Comprobar que timbrar una factura de ingreso, egreso o traslado devuelve su folio oficial (UUID) y un archivo válido; y que si mandas datos mal, responde con un error claro en vez de tronarse.
- **Pruebas de nómina** · `Nuevo · C0 · prio Alta`  
  Comprobar que las distintas formas de timbrar nómina funcionan, que la carga masiva reporta cuáles salieron bien y cuáles mal, y que solo se descuenta saldo cuando el timbrado sí tuvo éxito.
- **Pruebas de complemento de pagos** · `Nuevo · C0 · prio Alta`  
  Comprobar que registrar un pago genera el archivo correcto, sobre todo en el manejo de tipo de cambio y decimales.
- **Pruebas de cancelación** · `Nuevo · C0 · prio Alta`  
  Comprobar que cancelar una factura la deja marcada como cancelada, que se entienden los códigos de respuesta del SAT, y que la cancelación en lote recorre todas las facturas indicadas.
- **Pruebas de elección y respaldo de PAC** · `Nuevo · C0 · prio Alta`  
  Comprobar que si el PAC principal falla por un motivo previsto, el sistema reintenta solo con el PAC de respaldo; y que si el fallo es de otro tipo, NO reintenta a ciegas.

---

### 0.2 Cerrar los huecos de seguridad detectados

`Nuevo · C0 · varios críticos`

Al revisar el código se encontraron varios puntos de seguridad abiertos que hay que cerrar antes de exponer la plataforma a más datos sensibles. En palabras simples: hay funciones importantes (como timbrar o cancelar) que ahorita cualquiera podría llamar sin identificarse, porque la validación de identidad está desactivada en el código; hay conexiones al SAT que no verifican con quién están hablando; hay contraseñas y llaves que se están escribiendo en las bitácoras (logs) donde no deberían quedar; y hay contraseñas de ejemplo que nunca se cambiaron. Cada uno de estos es una puerta que hay que cerrar. Un experto en seguridad debe validar el cierre.

**Qué se entrega al terminar.** Un reporte que liste cada hueco encontrado y cómo quedó (cerrado, mitigado, o aceptado con justificación), más el código ya corregido y revisado con criterios de seguridad estándar (OWASP).

**Cuándo se considera aceptada.**
- Ninguna función sensible (timbrar, firmar, cancelar) se puede usar sin haberse identificado primero.
- Todas las conexiones al SAT verifican que del otro lado sea de verdad el SAT.
- Ninguna contraseña, llave ni token queda escrito en las bitácoras.
- Solo los sitios web autorizados pueden consumir la plataforma.
- Se quitan del sistema productivo la herramienta de depuración y las contraseñas de ejemplo.

**Cómo probarla.** Revisión de código guiada por una lista de verificación de seguridad, más un escaneo automático, más intentos controlados de entrar sin permiso a las funciones que antes estaban desprotegidas. La validación final la hace una persona con perfil de seguridad.

**Smoke tests para QA.**
- Intentar timbrar sin identificarse y confirmar que el sistema lo rechaza.
- Revisar las bitácoras después de una operación y confirmar que no aparecen datos secretos.
- Intentar consumir la plataforma desde un sitio no autorizado y confirmar que se bloquea.
- Confirmar que la herramienta de depuración ya no responde en el ambiente real.

**Subtareas (lo que hay que hacer para lograrla).**

- **Reactivar el control de identidad en timbrado, firma y cancelación** · `Nuevo · C0 · prio Crítica`  
  En el código, la verificación de quién llama está comentada (desactivada) en varias funciones. Hay que reactivarla para que nadie sin permiso pueda timbrar o cancelar.
- **Verificar el certificado en las conexiones al SAT** · `Nuevo · C0 · prio Crítica`  
  Hoy algunas conexiones al SAT tienen desactivada la verificación de seguridad ('verify=False'). Hay que activarla para evitar que alguien se haga pasar por el SAT.
- **Dejar de escribir secretos en las bitácoras** · `Nuevo · C0 · prio Crítica`  
  Actualmente se están registrando credenciales, tokens e incluso la dirección completa de la base de datos en los logs. Hay que ocultarlos o quitarlos.
- **Restringir qué sitios pueden usar la plataforma (CORS)** · `Nuevo · C0 · prio Alta`  
  Hoy está abierto a cualquier origen. Hay que limitarlo a los sitios web autorizados, sobre todo porque se permiten credenciales.
- **Quitar la herramienta de depuración y archivos temporales** · `Nuevo · C0 · prio Alta`  
  Hay un módulo de depuración marcado para eliminar y archivos sensibles que se escriben en carpetas temporales. Fuera del sistema real.
- **Cambiar las contraseñas y tokens de ejemplo** · `Nuevo · C0 · prio Crítica`  
  Quedaron contraseñas de ejemplo (tipo 'Admin123!') y tokens en el código. Hay que sacarlas y manejarlas con un gestor de secretos.
- **Revisar cómo se reciben las llaves privadas y CSD** · `Nuevo · C0 · prio Crítica`  
  Algunas funciones reciben la llave privada del certificado en cada petición. Conviene usar el certificado ya guardado de forma segura en vez de mandarlo cada vez.

---

### 0.3 Investigar cómo se guardan hoy los certificados de las entidades

`Auditar · C0 · Crítica`

Cada entidad de gobierno confía sus certificados y llaves fiscales (CSD, e.firma) a la plataforma. Con esos certificados se puede facturar a nombre de esa entidad, así que son de lo más delicado que maneja el sistema. El problema es que hay tres vías distintas de timbrado (SW, la vieja por SOAP, y la propia en Java), y cada una guarda y usa esos certificados de forma distinta. Antes de rediseñar nada, hay que investigar y documentar exactamente cómo viaja y dónde se guarda cada certificado en cada una de las tres vías, para encontrar dónde puede haber riesgo. Es una tarea de investigación, no de programar todavía; conviene que la haga alguien con perfil de seguridad.

**Qué se entrega al terminar.** Un documento que explique, para cada una de las tres vías, dónde se guarda el certificado, cómo se cifra, quién lo puede leer y por dónde pasa; con una lista de recomendaciones ordenadas por qué tan grave es cada riesgo.

**Cuándo se considera aceptada.**
- Las tres vías tienen documentado su recorrido completo del certificado.
- Se identifica todo punto donde un certificado viaje o se guarde sin cifrar.
- Se entregan recomendaciones concretas ordenadas por gravedad.

**Cómo probarla.** Revisar el código y la configuración de almacenamiento, y seguir a mano el recorrido de un certificado de principio a fin en cada una de las tres vías.

**Smoke tests para QA.**
- Confirmar que los certificados guardados están cifrados en las tres vías.
- Confirmar que cuando un certificado viaja entre la plataforma y la API en Java, va cifrado.
- Hacer una lista de cualquier punto donde un certificado aparezca sin cifrar (la meta es que sea cero).

**Subtareas (lo que hay que hacer para lograrla).**

- **Investigar la vía SW** · `Auditar · C0 · prio Crítica`  
  Documentar cómo se maneja el certificado cuando la entidad timbra por el PAC externo SW, señalando los puntos de riesgo.
- **Investigar la vía antigua (SOAP)** · `Auditar · C0 · prio Crítica`  
  Documentar cómo se guarda y usa la llave del PAC en la integración vieja por SOAP.
- **Investigar la vía propia en Java** · `Auditar · C0 · prio Crítica`  
  Documentar cómo la API en Java obtiene el certificado desde el almacenamiento para timbrar.
- **Verificar el viaje del certificado entre componentes** · `Auditar · C0 · prio Crítica`  
  Confirmar que cuando el certificado pasa de la plataforma a la API que decide la ruta, va protegido y no en texto plano.

---

### 0.4 Ordenar el código duplicado y confuso

`Nuevo · C0`

Con el tiempo, el proyecto acumuló piezas repetidas que hacen lo mismo de dos formas distintas: hay dos definiciones base de la base de datos, dos formas de dar de alta una entidad nueva (¡y crean tablas diferentes!), utilidades de almacenamiento duplicadas, y rutas viejas que ya no se usan. Esto es peligroso porque un programador puede tocar una versión pensando que es la que corre, cuando en realidad corre la otra, y provoca errores difíciles de rastrear. Esta tarea es 'limpiar la casa': dejar una sola forma de hacer cada cosa.

**Qué se entrega al terminar.** Código ordenado con una sola manera de hacer cada cosa (una definición de base de datos, una forma de dar de alta entidades, una utilidad de almacenamiento) y las rutas viejas eliminadas o claramente marcadas.

**Cuándo se considera aceptada.**
- Hay una sola definición base de la base de datos en uso.
- Hay una sola forma de dar de alta una entidad, que crea siempre las mismas tablas.
- Las utilidades de almacenamiento duplicadas quedan unificadas en una.
- Las rutas viejas que ya no se usan se eliminan sin romper nada que sí se use.

**Cómo probarla.** Después de limpiar, correr las pruebas del Hito 0.1 y confirmar que todo sigue en verde. Dar de alta una entidad nueva de prueba y verificar que se crean las tablas correctas.

**Smoke tests para QA.**
- Dar de alta una entidad de prueba y confirmar que quedan las tablas esperadas.
- Confirmar que ninguna ruta vieja que se eliminó estaba siendo usada por la aplicación o algún cliente.
- Las pruebas quedan en verde después de la limpieza.

**Subtareas (lo que hay que hacer para lograrla).**

- **Unificar la definición de base de datos** · `Nuevo · C0 · prio Media`  
  Hay dos definiciones base compitiendo. Decidir cuál es la buena y migrar todo a esa.
- **Dejar una sola forma de dar de alta entidades** · `Nuevo · C0 · prio Media`  
  Existen dos rutinas que dan de alta entidades y crean tablas distintas. Unificarlas en una sola para que toda entidad nueva quede igual.
- **Unificar las utilidades de almacenamiento** · `Nuevo · C0 · prio Baja`  
  Hay tres utilidades que hacen casi lo mismo para guardar archivos. Dejar una.
- **Eliminar rutas viejas sin uso** · `Nuevo · C0 · prio Baja`  
  Quitar rutas antiguas que ya no se usan, para que el sistema refleje solo lo vigente y no confunda.

---

## HITO A — Conexión con el SAT y timbrado

Casi todo este hito ya está construido y funcionando: timbrar facturas, nómina, pagos, cancelar, y elegir por cuál PAC hacerlo. Lo nuevo aquí son las **dos fuentes que alimentan el análisis**, y son independientes entre sí:

- **A.6 · Descarga masiva del SAT** — bajar del SAT las facturas de un periodo, consultable por cualquier rango de fechas. Da la cobertura completa (todo lo que el SAT tenga de la entidad), pero solo funciona si la entidad tiene AutoPAC. La autorización ante el SAT ya la tiene el cliente y nos la presta con su acceso; solo hay que programar la descarga.
- **A.7 · Desmenuzado local al timbrar** — como la plataforma ya guarda cada CFDI que timbra, aprovechamos ese momento para desmenuzarlo y dejarlo listo para análisis. Da un histórico propio, disponible siempre y para toda entidad, sin necesidad de AutoPAC.

Corrección importante de un supuesto anterior: **el análisis NO depende de tener AutoPAC.** Toda entidad tiene análisis sobre sus datos locales (A.7); la descarga del SAT (A.6) solo amplía la cobertura y habilita la conciliación de auditoría (E.4). Son dos cosas separadas.

### A.1 Timbrar facturas (CFDI 4.0)

`Existe · C1`

Es la función de emitir una factura electrónica en sus tres tipos (ingreso, egreso, traslado). Ya está construida y en uso. No hay que hacer nada nuevo aquí; solo confirmar con las pruebas del Hito 0 que sigue funcionando bien.

**Qué se entrega al terminar.** Confirmación, vía las pruebas automáticas, de que el timbrado de los tres tipos de factura sigue operando. Sin cambios de alcance.

**Cuándo se considera aceptada.**
- Se timbran los tres tipos de factura correctamente.
- El formulario se prellena con los datos correctos del emisor.

**Cómo probarla.** Ya queda cubierto por las pruebas del Hito 0.1. Validar contra el ambiente de práctica del PAC.

**Smoke tests para QA.**
- Timbrar una factura de ingreso de prueba y ver que devuelve su folio (UUID).
- Abrir el formulario y confirmar que los datos por defecto salen bien.

**Subtareas (lo que hay que hacer para lograrla).**

- **Función de timbrado con sellado en memoria** · `Existe · C1 · prio —`  
  Ya está en producción. Solo validar que sigue bien.
- **Prellenado del formulario** · `Existe · C1 · prio —`  
  Trae automáticamente emisor, serie y valores por defecto.

---

### A.2 Timbrar nómina

`Existe · C1`

Es la función de emitir los recibos de nómina de los empleados como CFDI. Ya está construida, incluyendo la versión que timbra muchos recibos de una sola vez (masiva) y la que descuenta saldo de timbres. No hay desarrollo nuevo; solo validar.

**Qué se entrega al terminar.** Confirmación de que la nómina, individual y masiva, sigue funcionando. Sin cambios de alcance.

**Cuándo se considera aceptada.**
- Las distintas formas de timbrar nómina funcionan.
- La carga masiva dice cuáles salieron bien y cuáles mal.
- El saldo de timbres se descuenta solo cuando el timbrado tuvo éxito.

**Cómo probarla.** Cubierto por las pruebas del Hito 0.1.

**Smoke tests para QA.**
- Timbrar un recibo de nómina de prueba.
- Procesar un lote pequeño y revisar el resumen de resultados.

**Subtareas (lo que hay que hacer para lograrla).**

- **Nómina individual y con firma** · `Existe · C1 · prio —`  
  Ya en producción.
- **Nómina masiva con control de saldo** · `Existe · C1 · prio —`  
  Procesa lotes y descuenta saldo solo en los exitosos.

---

### A.3 Registrar pagos (complemento de pago)

`Existe · C1`

Cuando una factura se cobra en parcialidades o después de emitirse, el SAT exige registrar cada pago con un documento especial (complemento de pago). Esta función ya existe y funciona. Además, será la base para una función de valor más adelante (detectar facturas cobradas sin su comprobante de pago, tarea F.2).

**Qué se entrega al terminar.** Confirmación de que el registro de pagos sigue funcionando. Sin cambios de alcance.

**Cuándo se considera aceptada.**
- Registra y timbra pagos aplicando bien las reglas de tipo de cambio.
- Los decimales se manejan correctamente.

**Cómo probarla.** Cubierto por las pruebas del Hito 0.1.

**Smoke tests para QA.**
- Validar un pago sin timbrarlo.
- Timbrar un pago de prueba y revisar que el detalle del pago quedó bien.

**Subtareas (lo que hay que hacer para lograrla).**

- **Validar y timbrar el complemento de pago** · `Existe · C1 · prio —`  
  Base para la futura conciliación de ingresos contra pagos.

---

### A.4 Cancelar facturas

`Existe · C1`

Es la función de cancelar ante el SAT una factura ya emitida, ya sea una sola, todas las de un cliente, o muchas a la vez. Ya está construida y sabe usar cualquiera de las tres vías de PAC. No hay desarrollo nuevo; solo validar.

**Qué se entrega al terminar.** Confirmación de que la cancelación (individual y masiva) sigue funcionando. Sin cambios de alcance.

**Cuándo se considera aceptada.**
- Cancela usando cualquiera de las tres vías de PAC.
- Entiende los códigos de respuesta del SAT.
- La cancelación en lote recorre todas las facturas indicadas.

**Cómo probarla.** Cubierto por las pruebas del Hito 0.1.

**Smoke tests para QA.**
- Cancelar una factura de prueba y ver que queda cancelada.
- Cancelar dos o tres a la vez.

**Subtareas (lo que hay que hacer para lograrla).**

- **Cancelación individual, por cliente y masiva** · `Existe · C1 · prio —`  
  Con elección de PAC y respaldo automático.

---

### A.5 Elegir automáticamente por cuál PAC timbrar

`Existe (el motor) + Automatizar (la decisión)`

La plataforma puede timbrar por tres vías distintas (SW, la vieja por SOAP, o la propia en Java), y ya tiene el mecanismo que elige una y, si falla, reintenta por otra (respaldo). Eso ya funciona. Lo que falta: hoy la decisión de qué vía usa cada entidad se hace a mano, configurándola manualmente. Esta tarea es lograr que el sistema tome esa decisión solo, leyendo la configuración de cada entidad, sin que alguien tenga que intervenir.

**Qué se entrega al terminar.** Un sistema que, al timbrar, elige solo la vía correcta según cómo esté configurada la entidad, sin intervención manual, conservando el respaldo automático si la vía principal falla.

**Cuándo se considera aceptada.**
- La elección de vía y el respaldo funcionan según el tipo de error.
- La vía se decide automáticamente a partir de la configuración de la entidad.
- Ya no hace falta que nadie elija el PAC a mano.

**Cómo probarla.** Configurar varias entidades con vías distintas y verificar que cada una timbra por donde debe sin ajuste manual. Simular fallas para ver que el respaldo entra.

**Smoke tests para QA.**
- Una entidad configurada para SW timbra por SW sola.
- Una entidad configurada para la vía Java timbra por ahí.
- Forzar una falla prevista y ver que entra el PAC de respaldo.

**Subtareas (lo que hay que hacer para lograrla).**

- **Elegir PAC principal y de respaldo por configuración** · `Existe · C1 · prio —`  
  El mecanismo ya está programado.
- **Repartir según la vía (SW / SOAP / Java)** · `Existe · C1 · prio —`  
  Las tres vías ya funcionan.
- **Automatizar la decisión según la entidad** · `Automatizar · C1 · prio Alta`  
  Hoy se decide a mano. Hay que hacer que el sistema lea la configuración de la entidad y decida solo.

---

### A.6 Descargar masivamente las facturas del SAT

`Nuevo · C1 · Crítica — LA PIEZA MÁS IMPORTANTE`

Hoy el sistema solo puede traer del SAT una factura a la vez, buscándola por su folio único (UUID). Eso sirve para casos sueltos, pero no para analizar miles de comprobantes. Esta tarea es construir la capacidad de pedirle al SAT *todas* las facturas de un periodo de golpe —por ejemplo, 'toda la nómina de enero a diciembre de 2024'— filtrando por fechas, por quién las emitió o recibió, por tipo, y por si están vigentes o canceladas. Un detalle importante del SAT: no entrega esto al instante. Uno hace la solicitud, el SAT tarda un rato en prepararla, y luego uno regresa a recogerla ya lista; por eso el sistema tiene que saber esperar y volver a intentar. **Esta es la fuente de datos más completa: cubre todo lo que el SAT tiene de la entidad para el rango de fechas que se consulte, sin importar por qué medio se timbró.** No es la única fuente de análisis —los datos locales (A.7) dan un histórico propio sin necesidad de AutoPAC—, pero sí es la que da la cobertura total y la que habilita la conciliación de auditoría (E.4). La conexión con el SAT ya está resuelta porque el cliente presta su acceso ya autorizado; lo que hay que programar es la descarga por lotes.

**Qué se entrega al terminar.** Un servicio que, dado un periodo y unos filtros, le pide las facturas al SAT, espera a que estén listas, y las baja para que el sistema las procese.

**Cuándo se considera aceptada.**
- Descarga por rango de fechas más filtros (quién emite/recibe, tipo, estado vigente/cancelado).
- Maneja bien la espera del SAT: solicita, espera, y regresa a recoger cuando está listo.
- Puede bajar tanto las facturas completas como solo sus datos resumidos (metadata).
- Permite consultar por cualquier rango de fechas (fecha inicio y fecha fin configurables), según lo que el SAT tenga disponible; sin un año de inicio fijo.
- Si el SAT pone límites o tarda, reintenta de forma ordenada sin perderse.

**Cómo probarla.** Probar contra el SAT usando el acceso del cliente en un entorno controlado. Pedir un periodo del que ya se sabe cuántas facturas hay, y confirmar que llega esa cantidad.

**Smoke tests para QA.**
- Pedir un rango pequeño y confirmar que llegan los paquetes de facturas.
- Filtrar por un solo tipo (solo nómina) y por estado (solo vigentes) y ver que respeta el filtro.
- Confirmar que si el SAT todavía no tiene lista la solicitud, el sistema espera y la recoge después, sin fallar.

**Subtareas (lo que hay que hacer para lograrla).**

- **Pasar de buscar una factura a bajar por rangos** · `Nuevo · C1 · prio Crítica`  
  Ampliar lo que hoy solo busca por folio único, para bajar lotes filtrando por fechas, emisor/receptor, tipo y estado. Usa el acceso al SAT que presta el cliente.
- **Manejar la espera del SAT** · `Nuevo · C1 · prio Crítica`  
  El SAT entrega en diferido: solicitar, esperar, y volver por los paquetes cuando estén listos. El sistema debe gestionar ese ir y venir solo.
- **Poder bajar también solo los datos resumidos** · `Nuevo · C1 · prio Media`  
  Además de la factura completa, el SAT permite bajar solo un resumen (metadata); el sistema debe soportar ambos.
- **Descarga por rango de fechas configurable** · `Nuevo · C1 · prio Alta`  
  Permitir consultar cualquier rango de fechas (inicio y fin configurables), sin fijar un año de inicio. Debe soportar tanto periodos recientes como históricos amplios, según lo que el SAT tenga disponible.

---

### A.7 Desmenuzar cada factura al timbrarla (histórico local para análisis)

`Nuevo · C1 · Alta`

Hoy, cada vez que la plataforma timbra una factura (una por una, a demanda), ya guarda el XML completo. El problema es que lo guarda "entero", pensado para operación y auditoría, no para análisis: para poder graficar o sumar hay que abrir el XML y sacar sus datos por dentro. Esta tarea aprovecha ese mismo momento del timbrado para, además de guardar el XML como hoy, **desmenuzarlo** (sacar sus datos importantes) y dejarlo guardado en forma lista para analizar. Así, sin depender del SAT ni de AutoPAC, cada entidad va formando su propio histórico consultable con todo lo que timbra en la plataforma. El desmenuzado se hace de forma **asíncrona**: la plataforma responde el timbrado al usuario de inmediato y el desmenuzado ocurre en segundo plano, para no hacer más lenta la operación. Como el timbrado es de aquí en adelante, no hay nada "hacia atrás" que reprocesar: cada factura nueva se desmenuza cuando se timbra.

**Qué se entrega al terminar.** Que cada factura timbrada, además de guardarse como hoy, quede automáticamente desmenuzada y disponible para análisis, sin que el usuario tenga que esperar por ello.

**Cuándo se considera aceptada.**
- Al timbrar una factura, sus datos quedan disponibles para análisis sin intervención manual.
- El desmenuzado corre en segundo plano; el usuario recibe su respuesta de timbrado igual de rápido que antes.
- Los datos desmenuzados caen en el mismo modelo de datos analítico que usa la descarga del SAT (el de C.1), para que ambas fuentes sean consultables igual.
- Si el desmenuzado de una factura falla, se registra el error y se puede reintentar, sin afectar el timbrado que ya salió bien.

**Cómo probarla.** Timbrar una factura y confirmar dos cosas: que la respuesta de timbrado llega igual de rápido, y que poco después sus datos ya aparecen consultables en el análisis local.

**Smoke tests para QA.**
- Timbrar una factura y confirmar que segundos después sus datos ya están en el análisis local.
- Medir que el tiempo de respuesta del timbrado no empeora respecto a antes (el desmenuzado no bloquea).
- Forzar un fallo en el desmenuzado de una factura y confirmar que el timbrado igual salió bien y que el error queda registrado para reintento.

**Subtareas (lo que hay que hacer para lograrla).**

- **Enganchar el desmenuzado en el punto de guardado que ya existe** · `Nuevo · C1 · prio Alta`  
  Aprovechar el paso que hoy ya corre tras cada timbrado exitoso (donde se guarda el XML) para lanzar ahí el desmenuzado, sin duplicar lógica.
- **Procesar en segundo plano (asíncrono)** · `Nuevo · C1 · prio Alta`  
  El desmenuzado no debe hacer esperar al usuario: se encola y se procesa aparte, de modo que la respuesta de timbrado sea igual de rápida.
- **Guardar en el modelo analítico compartido** · `Nuevo · C1 · prio Alta`  
  Los datos desmenuzados van a la misma estructura que usan los datos del SAT (C.1), para que local y SAT se consulten con las mismas herramientas.
- **Registrar y reintentar los que fallen** · `Nuevo · C1 · prio Media`  
  Si una factura no se pudo desmenuzar, dejar constancia y permitir reintentarla, sin tocar el timbrado que ya fue exitoso.

---

## HITO B — Manejo de múltiples entidades y su configuración

La plataforma atiende a varias dependencias de gobierno a la vez, y los datos de cada una deben estar separados de los demás. Esa separación ya está construida. Lo nuevo aquí es dejar claro que cada entidad configura por separado dos cosas: cómo timbra y si tiene acceso de consulta al SAT (AutoPAC). El análisis local no es un interruptor: existe siempre para toda entidad (ver B.3). La clave de diseño: tratar "cómo timbra" y "acceso al SAT" como interruptores independientes desde el inicio, porque separarlos después costaría rehacer trabajo.

### B.1 Mantener separados los datos de cada entidad

`Existe · C1`

Cada dependencia tiene su propio espacio aislado en la base de datos, para que ninguna vea los datos de otra. Ya está construido y funcionando. Se termina de ordenar en la tarea 0.4.

**Qué se entrega al terminar.** Confirmación de que el aislamiento por entidad funciona y de que quedó una sola forma de dar de alta entidades (tras la limpieza del Hito 0).

**Cuándo se considera aceptada.**
- Cada entidad tiene su espacio de datos aislado.
- Dar de alta una entidad nueva siempre produce el mismo resultado.

**Cómo probarla.** Dar de alta una entidad nueva y verificar que no puede ver los datos de otra.

**Smoke tests para QA.**
- Crear una entidad de prueba y confirmar que se crea su espacio.
- Verificar que esa entidad no ve datos de otra.

**Subtareas (lo que hay que hacer para lograrla).**

- **Espacio de datos por entidad** · `Existe · C1 · prio —`  
  Cada dependencia tiene sus tablas aisladas.
- **Alta de entidades** · `Existe · C1 · prio —`  
  Se unifica en el Hito 0.4 para que sea siempre igual.

---

### B.2 Guardar de forma segura los certificados de cada entidad

`Existe · C1 (reforzar)`

Los certificados fiscales de cada entidad se guardan cifrados. Ya existe, pero hay que reforzarlo según lo que encuentre la investigación de seguridad del Hito 0.3.

**Qué se entrega al terminar.** Los certificados de cada entidad guardados de forma cifrada, con las mejoras que salgan de la investigación de seguridad.

**Cuándo se considera aceptada.**
- Los certificados de cada entidad están cifrados mientras están guardados.
- Se aplican las recomendaciones que salieron del Hito 0.3.

**Cómo probarla.** Verificar que los certificados están cifrados y que cada entidad solo accede a los suyos.

**Smoke tests para QA.**
- Confirmar que el certificado de una entidad está cifrado donde se guarda.
- Confirmar que una entidad no puede llegar al certificado de otra.

**Subtareas (lo que hay que hacer para lograrla).**

- **Cifrado y almacenamiento seguro de certificados** · `Existe · C1 · prio —`  
  Ya existe; reforzar según la investigación del Hito 0.3.

---

### B.3 Configurar las capacidades de cada entidad por separado

`Adaptar + Nuevo · C1/C2 · decisión de diseño importante`

Cada entidad tiene dos cosas independientes que hay que poder configurar por separado: (1) **cómo timbra** —por SW, por la vía Java, o por un PAC externo—; y (2) **si puede consultar al SAT** —sí o no, según tenga AutoPAC—. ¿Por qué separarlas? Porque una entidad podría timbrar por un PAC externo y aun así (o no) tener acceso de consulta al SAT; son cosas distintas. Si se programan como una sola cosa pegada, después habría que rehacer todo para separarlas.

Corrección importante respecto a versiones anteriores de este documento: **la parte analítica NO es un interruptor que dependa del SAT.** El análisis existe siempre, porque toda entidad va generando su histórico local con lo que timbra (ver A.7). Lo que la capacidad "puede consultar al SAT" habilita son dos cosas adicionales: consultar el histórico completo del SAT (fuente SAT en D.1) y la conciliación de auditoría local vs. SAT (E.4). En resumen: análisis local → siempre; fuente SAT y conciliación de auditoría → solo con AutoPAC.

La pantalla debe mostrar u ocultar las funciones que dependen del SAT según lo que cada entidad tenga habilitado, y siempre dejar disponible el análisis local.

**Qué se entrega al terminar.** Una configuración por entidad donde "cómo timbra" y "puede consultar al SAT" son interruptores independientes, y una pantalla que muestra u oculta las funciones dependientes del SAT según lo que cada entidad tenga habilitado, dejando el análisis local siempre disponible.

**Cuándo se considera aceptada.**
- "Cómo timbra" y "puede consultar al SAT" se guardan y controlan por separado.
- El análisis local está disponible para toda entidad, tenga o no acceso al SAT.
- Las funciones que dependen del SAT (fuente SAT, conciliación de auditoría) solo aparecen si la entidad tiene ese acceso.
- Una entidad puede timbrar por un lado y tener (o no) acceso al SAT de forma independiente.

**Cómo probarla.** Crear entidades con combinaciones distintas (una que timbra por SW y sin acceso al SAT; otra que timbra por AutoPAC y con acceso al SAT) y ver que en ambas el análisis local funciona, y que solo la segunda muestra las funciones que dependen del SAT.

**Smoke tests para QA.**
- Una entidad sin acceso al SAT: el análisis local funciona, pero no aparece la opción de consultar al SAT ni la conciliación de auditoría.
- Una entidad con acceso al SAT: aparecen ambas opciones adicionales.
- Cambiar un interruptor y ver el cambio reflejado de inmediato en la pantalla.

**Subtareas (lo que hay que hacer para lograrla).**

- **Interruptor: cómo timbra (SW / Java / externo)** · `Adaptar · C1 · prio Alta`  
  Ya existe la configuración de PAC; formalizarla como una de las capacidades por entidad.
- **Interruptor independiente: puede consultar al SAT (tiene AutoPAC)** · `Nuevo · C1 · prio Alta`  
  Separado de cómo timbra. Habilita la fuente SAT (D.1) y la conciliación de auditoría (E.4).
- **Dejar el análisis local siempre disponible** · `Nuevo · C1 · prio Alta`  
  El análisis sobre datos locales no se apaga; existe para toda entidad, con o sin acceso al SAT.
- **Mostrar u ocultar funciones según la configuración** · `Nuevo · C2 · prio Media`  
  La plataforma muestra u oculta las funciones dependientes del SAT según lo habilitado, sin ocultar nunca el análisis local.

---

## HITO C — Guardar y ordenar las facturas para analizarlas

Este es el cimiento de toda la parte analítica. Ojo con una diferencia importante: el sistema hoy guarda las facturas que *emite*, pero las guarda pensando en operación y auditoría, no en análisis (el XML queda entero, hay que abrirlo para poder sumar o graficar). Aquí se diseña y construye el lugar donde los datos quedan *desmenuzados y listos para analizar*.

Punto clave: este modelo de datos es **compartido por las dos fuentes**. Tanto las facturas que se desmenuzan al timbrar (A.7, fuente local) como las que se bajan del SAT (A.6, fuente SAT) caen en la misma estructura y se leen con el mismo parser. Se construye una sola vez y sirve para ambas. Por eso conviene marcar de qué fuente viene cada registro (local o SAT), para poder consultarlas por separado o compararlas.

Diseñar bien esta estructura es la decisión más importante del proyecto, porque todo el reporteo y la conciliación se construyen encima. Y hay que contemplar ingresos desde el inicio, aunque la licitación solo pida egresos, para no rehacer después.

### C.1 Diseñar dónde se guardan las facturas para poder analizarlas

`Nuevo · C1/C2 · Crítica`

Antes de guardar millones de facturas, hay que diseñar la estructura de la base de datos que las va a contener, pensada para consultarlas y analizarlas rápido. Es como diseñar el archivero antes de meter los expedientes: si el archivero está mal pensado, después es un caos encontrar las cosas. Esta estructura tiene que soportar todas las formas en que se van a querer consultar los datos (por periodo, por tipo, por dependencia, por empleado, etc.), servir tanto para egresos como para ingresos desde el día uno, y **marcar de qué fuente viene cada registro** (local, del desmenuzado al timbrar; o SAT, de la descarga masiva) para poder consultarlos por separado y compararlos. También conviene guardar el UUID de forma que se pueda emparejar rápido un registro local con su equivalente del SAT (base de la conciliación de auditoría E.4). Es, junto con la descarga (A.6) y el desmenuzado local (A.7), la decisión de la que depende todo lo demás.

**Qué se entrega al terminar.** Una estructura de base de datos documentada y creada, que aguante los tipos de factura de egresos e ingresos, marque el origen (local/SAT) de cada registro, y soporte todas las consultas de reporte y conciliación previstas.

**Cuándo se considera aceptada.**
- Soporta todos los filtros de reporte que se piden (periodo, tipo, emisor, fuente de recurso, dependencia, empleado).
- Sirve para egresos e ingresos en la misma estructura.
- Marca el origen (local o SAT) de cada registro y permite consultar por fuente.
- Permite emparejar por UUID un registro local con uno del SAT.
- Permite las consultas de conciliación sin tener que rediseñar.
- Está documentada (un diccionario que explique cada dato).

**Cómo probarla.** Cargar un conjunto de facturas reales de prueba de ambas fuentes y verificar que todas las consultas que se van a necesitar se pueden hacer sobre la estructura, con buen rendimiento.

**Smoke tests para QA.**
- Meter facturas de nómina y de ingreso y confirmar que ambas encajan bien.
- Meter un registro local y uno del SAT con el mismo UUID y confirmar que se pueden emparejar.
- Hacer dos o tres consultas de reporte típicas y ver que dan resultados correctos.
- Confirmar que las consultas más frecuentes son rápidas.

**Subtareas (lo que hay que hacer para lograrla).**

- **Diseñar la estructura analítica (compartida por ambas fuentes)** · `Nuevo · C1 · prio Crítica`  
  La estructura actual es para las facturas que se emiten (operación); esta es distinta, para analizar. La misma estructura recibe tanto lo local (A.7) como lo del SAT (A.6). Es la base de todo.
- **Marcar el origen y permitir emparejar por UUID** · `Nuevo · C1 · prio Alta`  
  Cada registro sabe si es local o del SAT, y el UUID permite cruzar ambos lados para la conciliación de auditoría.
- **Contemplar ingresos desde el diseño** · `Nuevo · C2 · prio Alta`  
  Aunque la licitación solo pide egresos, incluir ingresos ahora evita rehacer todo después.

---

### C.2 Leer los XML y meterlos ordenados a la base (el parser compartido)

`Nuevo · C1 · Crítica`

Un CFDI es un archivo XML. Esta tarea es el "desmenuzador": leer cada archivo, sacar los datos importantes de adentro, y guardarlos ordenados en la estructura de C.1. **Este parser es el mismo para las dos fuentes:** lo usa el desmenuzado local al timbrar (A.7, de una factura a la vez) y también el procesamiento de lo descargado del SAT (A.6, de lotes grandes de miles). Se escribe una sola vez y las dos fuentes lo llaman. Tiene que aguantar tanto el caso de una sola factura como lotes grandes sin atascarse, ser 'a prueba de repeticiones' (si se procesa el mismo XML dos veces, no duplica, apoyándose en el UUID), y si un archivo viene dañado, anotarlo y seguir sin detenerse.

**Qué se entrega al terminar.** Un parser único que convierte XML en registros ordenados y consultables, usado por ambas fuentes, sin duplicar si se repite, y dejando constancia de los que fallen.

**Cuándo se considera aceptada.**
- Lee todos los datos importantes de cada factura.
- Sirve igual para una factura suelta (local) que para lotes grandes (SAT).
- Si se procesa el mismo XML dos veces (mismo UUID), no duplica datos.
- Si un archivo viene dañado, lo anota y sigue con el resto.

**Cómo probarla.** Procesar por un lado una factura suelta (como en el timbrado) y por otro un lote grande descargado, y verificar que en ambos casos los datos quedan bien y coinciden con los archivos originales.

**Smoke tests para QA.**
- Desmenuzar una factura individual y confirmar que sus datos quedan completos.
- Procesar un lote del SAT y confirmar que el número de registros coincide con el de archivos.
- Procesar el mismo XML otra vez y confirmar que no se duplicó (se reconoce por UUID).
- Meter un archivo dañado a propósito y ver que se anota el error y el proceso continúa.

**Subtareas (lo que hay que hacer para lograrla).**

- **Escribir el parser único de XML a la base** · `Nuevo · C1 · prio Crítica`  
  Sacar la información de dentro del XML y ordenarla en la estructura analítica. Es distinto a lo que hoy se hace al emitir. Lo usan tanto A.7 (local) como A.6 (SAT).
- **Que sirva para una factura y para lotes grandes** · `Nuevo · C1 · prio Alta`  
  El mismo parser debe funcionar tanto en el desmenuzado al timbrar (una a una) como en el volumen masivo del SAT.
- **Evitar duplicados por UUID** · `Nuevo · C1 · prio Alta`  
  Si un CFDI ya fue procesado, reconocerlo por su UUID y no duplicarlo.

---

### C.3 Poner etiquetas que den sentido a los datos

`Nuevo · C1`

Los datos crudos no dicen mucho solos. Esta tarea es crear y llenar las 'etiquetas' que permiten agrupar y entender la información: sobre todo la **fuente de financiamiento** (de qué bolsa de recursos salió cada pago) y el **tipo de nómina**. Estas etiquetas se definen junto con el área de Recursos Humanos del cliente, porque son ellos quienes saben cómo clasifican su información.

**Qué se entrega al terminar.** Las etiquetas (catálogos) definidas junto con el cliente y aplicadas a los datos procesados, de modo que todo quede clasificado.

**Cuándo se considera aceptada.**
- Las etiquetas se definen con el área usuaria del cliente.
- Los datos procesados quedan clasificados según esas etiquetas.

**Cómo probarla.** Clasificar un conjunto de facturas y verificar que cada una queda en la categoría correcta.

**Smoke tests para QA.**
- Confirmar que una factura de nómina queda ligada a su fuente de financiamiento.
- Buscar registros que quedaron sin clasificar (la meta es cero, o un mínimo controlado).

**Subtareas (lo que hay que hacer para lograrla).**

- **Etiquetas de fuente de financiamiento y tipo de nómina** · `Nuevo · C1 · prio Alta`  
  Se definen con Recursos Humanos del cliente; son la base para agrupar y analizar.

---

## HITO D — Consultar y reportar la información

Esta es la parte que el cliente ve y usa día a día: buscar, filtrar, exportar y graficar la información. Corrección respecto a versiones anteriores: **esto ya no depende de tener la descarga del SAT.** El reporteo funciona sobre los datos locales (que existen para toda entidad gracias a A.7); la descarga del SAT solo agrega una segunda fuente con más cobertura. Lo que sí necesita siempre es la estructura de datos (C.1).

La primera tarea del hito es el **selector de fuente**: un panel donde el usuario elige qué está consultando, con total claridad sobre el origen y el alcance de lo que ve.

### D.0 Elegir y dejar claro qué fuente de datos se está consultando

`Nuevo · C1 · Alta`

Como hay dos fuentes de datos (local y SAT) que pueden dar números distintos —porque cubren cosas distintas—, el usuario tiene que poder elegir cuál consulta y entender siempre qué está viendo. Esta tarea es un panel/selector con dos opciones: "lo timbrado en esta plataforma" (local, siempre disponible) y "lo registrado en el SAT" (solo si la entidad tiene AutoPAC). Y, más importante que el selector, la **honestidad del dato**: cada consulta y cada exportación debe mostrar una etiqueta clara de qué fuente es y qué periodo cubre. Para la fuente local, la fecha mínima consultable es la del primer CFDI que la entidad timbró en la plataforma, y debe decirse explícitamente que es "solo lo timbrado aquí", para que nadie confunda ese análisis con su universo fiscal completo. Esto importa especialmente en gobierno, donde alguien podría tomar decisiones creyendo que ve todo cuando solo ve una parte.

**Qué se entrega al terminar.** Un selector de fuente en la pantalla de consulta, y una etiqueta permanente de origen y rango que acompaña a toda consulta y exportación.

**Cuándo se considera aceptada.**
- El usuario puede elegir entre fuente local y fuente SAT (esta última solo si tiene AutoPAC).
- Toda consulta muestra de qué fuente viene y qué periodo cubre.
- En la fuente local, la fecha mínima es la del primer CFDI timbrado en la plataforma, y se indica que es "solo lo timbrado aquí".
- La etiqueta de origen viaja también en las exportaciones a Excel.

**Cómo probarla.** Consultar la misma entidad en ambas fuentes y confirmar que la etiqueta y el rango cambian correctamente, y que la exportación conserva esa indicación.

**Smoke tests para QA.**
- Cambiar de fuente local a SAT y ver que la etiqueta y los datos cambian.
- Confirmar que la fecha mínima local corresponde al primer CFDI timbrado de esa entidad.
- Exportar y confirmar que el archivo dice de qué fuente y periodo es.
- Con una entidad sin AutoPAC, confirmar que la opción SAT no está disponible pero la local sí.

**Subtareas (lo que hay que hacer para lograrla).**

- **Selector de fuente (local / SAT)** · `Nuevo · C1 · prio Alta`  
  Panel donde el usuario elige qué consulta; la opción SAT solo aparece si la entidad tiene AutoPAC.
- **Etiqueta de origen y rango siempre visible** · `Nuevo · C1 · prio Alta`  
  Cada consulta indica fuente y periodo; en local, deja claro que es "solo lo timbrado en la plataforma" desde la fecha del primer CFDI.
- **Calcular la fecha de inicio de la fuente local** · `Nuevo · C1 · prio Media`  
  La primera fecha consultable es la del primer CFDI almacenado de la entidad.
- **Conservar la indicación de fuente en las exportaciones** · `Nuevo · C1 · prio Media`  
  El Excel exportado debe decir de qué fuente y periodo salió.

### D.1 Buscar y exportar la información con filtros

`Nuevo · C1`

El cliente necesita poder hacer preguntas a los datos y llevarse las respuestas. Esta tarea es construir una pantalla de consulta donde se pueda filtrar la información por muchos criterios (periodo, tipo de nómina, año, quién emitió, fuente de recurso, dependencia, hasta empleado individual) y poder exportar el resultado a Excel para trabajarlo aparte. Es lo que la licitación llama 'reporteo ejecutivo'.

**Qué se entrega al terminar.** Una pantalla de consulta con todos los filtros pedidos y un botón para exportar el resultado a Excel o CSV.

**Cuándo se considera aceptada.**
- Se puede filtrar por: periodo, tipo de nómina, año, emisor, fuente de financiamiento, dependencia y empleado.
- Se puede ver la información resumida y también al detalle de cada empleado.
- La exportación a Excel refleja fielmente lo consultado.

**Cómo probarla.** Hacer consultas combinando filtros y comparar contra los datos en bruto. Exportar y verificar que el archivo coincide con lo que se veía en pantalla.

**Smoke tests para QA.**
- Consultar por dependencia y periodo y verificar que los totales cuadran.
- Exportar el resultado y confirmar que el archivo coincide con la pantalla.
- Filtrar hasta un empleado específico y verificar que los datos son correctos.

**Subtareas (lo que hay que hacer para lograrla).**

- **Filtros de consulta** · `Nuevo · C1 · prio Alta`  
  Por periodo, tipo de nómina, año, emisor, fuente, dependencia y empleado. Es el reporteo que exige la licitación.
- **Exportar a Excel** · `Nuevo · C1 · prio Alta`  
  El usuario debe poder llevarse los resultados a una hoja de cálculo.

---

### D.2 Mostrar la información en gráficas

`Nuevo · C1`

Además de tablas, el cliente necesita ver la información de forma visual, en gráficas, tanto de manera resumida como al detalle de empleado. Ayuda a entender de un vistazo lo que en una tabla tomaría más tiempo.

**Qué se entrega al terminar.** Pantallas con gráficas de la información procesada, que respondan a los mismos filtros que la consulta.

**Cuándo se considera aceptada.**
- Hay gráficas resumidas por las categorías principales.
- Lo que muestra la gráfica coincide con lo que da la consulta de D.1.

**Cómo probarla.** Comparar los números de una gráfica contra la misma consulta hecha en D.1 para asegurar que cuadran.

**Smoke tests para QA.**
- Abrir una gráfica y confirmar que coincide con la consulta equivalente.
- Cambiar un filtro y ver que la gráfica se actualiza.

**Subtareas (lo que hay que hacer para lograrla).**

- **Gráficas de la información procesada** · `Nuevo · C1 · prio Media`  
  Vista resumida y al detalle de empleado.

---

## HITO E — Conciliación (la parte más delicada)

Este hito tiene **dos conciliaciones distintas**, no confundirlas:

1. **Conciliación fiscal (E.1–E.3):** comparar lo que se timbró contra lo que se retuvo de impuestos y lo que se enteró (pagó) al SAT. Es la que pide la licitación, la de más reglas fiscales.
2. **Conciliación de auditoría, local vs. SAT (E.4):** comparar lo que la entidad timbró en la plataforma contra lo que el SAT tiene registrado a su nombre, emparejando por UUID. Es una idea de valor propia, para que la empresa audite que todo cuadra.

En ambas aplica lo mismo: **la plataforma hace las cuentas, pero un contador o fiscalista valida que las reglas estén bien.** El sistema calcula; el profesional certifica.

### E.1 Comparar lo timbrado contra lo retenido y lo pagado al SAT

`Nuevo · C1 · Alta`

Esta es la función central de la conciliación. El sistema toma, por cada empleado y cada periodo, tres cifras —lo que se timbró, lo que se retuvo de impuestos, y lo que se enteró (pagó) al SAT— y las compara para detectar dónde no cuadran, separando por fuente de financiamiento. Es lógica de negocio completamente nueva, y las reglas de cómo se calcula cada cosa las tiene que revisar y aprobar un contador o fiscalista antes de darlas por buenas. Un error aquí no es solo un bug: puede llevar a conclusiones fiscales equivocadas.

**Qué se entrega al terminar.** Un motor que produce las diferencias detectadas por fuente de financiamiento, empleado y periodo, con las reglas de cálculo revisadas por un profesional fiscal.

**Cuándo se considera aceptada.**
- Compara timbrado contra retenido contra enterado.
- Desglosa por fuente de financiamiento, empleado y periodo.
- Un contador o fiscalista revisó y aprobó las reglas de cálculo.
- Cada diferencia detectada se puede explicar y rastrear.

**Cómo probarla.** Correr la conciliación sobre un periodo cuyo resultado ya conozca y haya validado el área contable, y confirmar que coincide. Revisar los casos raros con el fiscalista.

**Smoke tests para QA.**
- Conciliar un periodo de prueba y comparar contra el cálculo manual del contador.
- Verificar que el desglose por fuente de financiamiento es correcto.
- Tomar una diferencia detectada y confirmar que se puede explicar de dónde sale.

**Subtareas (lo que hay que hacer para lograrla).**

- **Motor que cruza por fuente, empleado y periodo** · `Nuevo · C1 · prio Alta`  
  Lógica nueva. Las reglas fiscales las valida un contador/fiscalista, no se dan por buenas solas.
- **Identificar lo retenido y lo enterado al SAT** · `Nuevo · C1 · prio Alta`  
  Requisito de la licitación: distinguir cuánto se retuvo y cuánto se pagó al SAT.

---

### E.2 Generar los informes de incidencias y el plan de acción

`Nuevo · C1`

Una vez detectadas las diferencias, hay que presentarlas de forma útil: un informe de las incidencias encontradas al analizar las facturas, otro de las que salen de la conciliación, y un plan de acción que diga qué hacer con cada una, con su impacto y beneficio. Son entregables que la licitación exige y que se arman junto con el cliente.

**Qué se entrega al terminar.** Informes de incidencias que se pueden exportar, y un plan de acción, construidos a partir de los resultados de la conciliación.

**Cuándo se considera aceptada.**
- Hay un informe de incidencias del análisis de facturas.
- Hay un informe de incidencias de la conciliación.
- Hay un plan de acción con impacto y beneficios.

**Cómo probarla.** Generar los informes sobre datos que ya se sabe que tienen incidencias, y confirmar que las detecta y las presenta bien.

**Smoke tests para QA.**
- Generar el informe sobre un conjunto con incidencias conocidas y ver que aparecen.
- Confirmar que el plan de acción hace referencia a las incidencias detectadas.

**Subtareas (lo que hay que hacer para lograrla).**

- **Informe de incidencias del análisis** · `Nuevo · C1 · prio Alta`  
  Entregable de la licitación.
- **Plan de acción con impacto y beneficios** · `Nuevo · C1 · prio Media`  
  Se elabora junto con el cliente.

---

### E.3 Volver la conciliación interactiva con semáforos

`Nuevo · C2`

En vez de solo un informe estático, esta función convierte la conciliación en algo interactivo: un tablero con semáforos (verde/amarillo/rojo) que muestran en el momento dónde hay diferencias, y que reacciona cuando el usuario cambia los filtros. Es valor agregado: reutiliza el cálculo de E.1 pero lo vuelve una herramienta de exploración.

**Qué se entrega al terminar.** Un tablero interactivo de conciliación con semáforos que reaccionan a los filtros.

**Cuándo se considera aceptada.**
- Los semáforos reflejan las diferencias que calculó la conciliación.
- Coincide con los resultados del motor de E.1.

**Cómo probarla.** Comparar el semáforo interactivo contra el informe estático del mismo periodo para confirmar que dicen lo mismo.

**Smoke tests para QA.**
- Confirmar que el semáforo coincide con el resultado de E.1.
- Cambiar un filtro y ver que el semáforo se recalcula.

**Subtareas (lo que hay que hacer para lograrla).**

- **Semáforos de diferencias en tiempo real** · `Nuevo · C2 · prio Baja`  
  Reutiliza el cálculo de E.1 y lo vuelve una herramienta visual de exploración.

---

### E.4 Conciliación de auditoría: lo timbrado en la plataforma vs. lo que el SAT tiene registrado

`Nuevo · C2 · Alta · requiere AutoPAC`

Esta es una herramienta de auditoría para la propia entidad, y responde a una pregunta muy concreta: *"¿todo lo que timbré por la plataforma coincide con lo que el SAT tiene registrado a mi nombre? ¿Falta algo? ¿Sobra algo?"* La pantalla consulta directo al SAT (por eso requiere AutoPAC) y lo compara contra el histórico local, emparejando cada CFDI por su **UUID** (el folio fiscal, que es idéntico en ambos lados). El resultado clasifica cada comprobante en tres casos:

- **En ambos (coincide):** está local y está en el SAT. Todo en orden.
- **Local pero no en el SAT:** la entidad tiene el CFDI, pero el SAT no lo reconoce. Señal de alerta: probablemente **no se timbró bien** o algo falló en el registro ante el SAT.
- **En el SAT pero no local:** el SAT tiene un CFDI a nombre de la entidad que no está en la plataforma. Significa que **se timbró por otro medio** (fuera de la plataforma).

Es distinta de la conciliación fiscal (E.1): aquella compara importes (timbrado vs. retenido vs. enterado); esta compara *existencia* de comprobantes entre dos registros. Ambas son valiosas y complementarias.

**Qué se entrega al terminar.** Una pantalla que, para un periodo dado, consulta al SAT y al histórico local, empareja por UUID y presenta los tres casos (coincide / solo local / solo SAT) de forma clara y exportable.

**Cuándo se considera aceptada.**
- Empareja los CFDI por UUID entre las dos fuentes.
- Clasifica correctamente los tres casos.
- Explica cada caso en lenguaje claro (qué significa "solo local" y "solo SAT").
- Solo se ofrece a entidades con AutoPAC (necesita consultar al SAT).
- El resultado se puede exportar para el expediente de auditoría.

**Cómo probarla.** Tomar un periodo con casos conocidos —algunos CFDI que están en ambos lados, uno que solo esté local, uno que solo esté en el SAT— y confirmar que la pantalla clasifica cada uno donde debe.

**Smoke tests para QA.**
- Un CFDI presente en ambos lados aparece como "coincide".
- Un CFDI que está local pero se elimina del lado SAT aparece como "solo local / no se timbró bien".
- Un CFDI que el SAT tiene pero no está local aparece como "solo SAT / timbrado por otro medio".
- Con una entidad sin AutoPAC, la pantalla no está disponible.

**Subtareas (lo que hay que hacer para lograrla).**

- **Traer lo del SAT y lo local del mismo periodo** · `Nuevo · C2 · prio Alta`  
  Consultar al SAT (vía descarga/consulta) y al histórico local para el rango elegido.
- **Emparejar por UUID y clasificar en tres casos** · `Nuevo · C2 · prio Alta`  
  Cruzar ambas listas por folio fiscal y marcar cada CFDI como coincide, solo local, o solo SAT.
- **Presentar y explicar los resultados** · `Nuevo · C2 · prio Media`  
  Mostrar los tres grupos con su explicación en lenguaje claro, y permitir exportarlos.
- **Ofrecerla solo si la entidad tiene AutoPAC** · `Nuevo · C2 · prio Media`  
  La pantalla depende de poder consultar al SAT; ocultarla si la entidad no tiene ese acceso.

---

## HITO F — Ingresos (crecer el producto más allá de la licitación)

La licitación se enfoca en egresos (nómina, lo que el gobierno paga). Pero cualquier empresa también recibe y emite facturas de ingreso, y ahí hay un mercado mucho más grande. La buena noticia: usa el mismo motor de descarga que ya se construye para egresos; lo que cambia es qué se hace con los datos. Todo este hito es valor agregado (C2).

### F.1 Ver ingresos: lo que se factura contra lo que se recibe

`Nuevo · C2`

La vista básica de ingresos: comparar las facturas de ingreso que la entidad emitió (lo que cobró) contra las que recibió de sus proveedores (lo que gastó). Es la base sobre la que se construye todo el análisis de ingresos. Aprovecha la descarga que ya existe.

**Qué se entrega al terminar.** Una vista que contrasta las facturas de ingreso emitidas contra las recibidas.

**Cuándo se considera aceptada.**
- Distingue claramente lo emitido de lo recibido.
- Los números cuadran con los datos procesados.

**Cómo probarla.** Cargar facturas de ingreso emitidas y recibidas y verificar que las separa bien.

**Smoke tests para QA.**
- Confirmar que los totales de emitidas y recibidas coinciden con los datos en bruto.

**Subtareas (lo que hay que hacer para lograrla).**

- **Emitidas contra recibidas** · `Nuevo · C2 · prio Media`  
  La vista base de ingresos. Reutiliza el motor de descarga.

---

### F.2 Detectar facturas cobradas sin su comprobante de pago

`Nuevo · C2`

Cuando se factura a crédito, después debe registrarse el pago con su comprobante (complemento de pago). Es común que ese comprobante se olvide, y eso es un problema fiscal. Esta función revisa las facturas de ingreso a crédito y detecta cuáles no tienen su pago registrado. Aprovecha la función de pagos que ya existe (A.3).

**Qué se entrega al terminar.** Un reporte de facturas de ingreso a crédito que les falta el comprobante de pago.

**Cuándo se considera aceptada.**
- Detecta facturas a crédito sin su pago registrado.
- Relaciona correctamente cada pago con su factura.

**Cómo probarla.** Preparar facturas con y sin comprobante de pago y verificar que detecta solo las que les falta.

**Smoke tests para QA.**
- Confirmar que una factura a crédito sin pago aparece como pendiente.
- Confirmar que una que sí tiene pago NO aparece.

**Subtareas (lo que hay que hacer para lograrla).**

- **Detectar facturas a crédito sin comprobante de pago** · `Nuevo · C2 · prio Media`  
  Aprovecha la función de pagos ya existente.

---

### F.3 Vigilar las cancelaciones de facturas de ingreso

`Nuevo · C2`

Cancelar una factura de ingreso tiene reglas y plazos (por la reforma de cancelación del SAT). Esta función detecta cancelaciones hechas fuera de esas reglas, o que afectan un periodo del que ya se declararon impuestos, que son las que traen problemas.

**Qué se entrega al terminar.** Un reporte de cancelaciones de ingreso que tienen riesgo por norma.

**Cuándo se considera aceptada.**
- Detecta cancelaciones hechas fuera de plazo o norma.
- Marca las que afectan periodos ya declarados.

**Cómo probarla.** Preparar cancelaciones dentro y fuera de norma y verificar que las clasifica bien.

**Smoke tests para QA.**
- Confirmar que una cancelación fuera de norma se marca.
- Confirmar que una normal no genera alerta.

**Subtareas (lo que hay que hacer para lograrla).**

- **Detectar cancelaciones fuera de norma** · `Nuevo · C2 · prio Baja`  
  Según las reglas de la reforma de cancelación del SAT.

---

### F.4 Detectar proveedores en la lista negra del SAT (69-B)

`Nuevo · C2`

El SAT publica una lista de contribuyentes que emiten facturas falsas (conocida como lista 69-B o EFOS). Si una entidad recibe facturas de alguien en esa lista, tiene un problema serio. Esta función cruza automáticamente los proveedores que le facturan a la entidad contra esa lista y avisa. Es de mucho valor, y además conecta con un requisito que la propia licitación menciona (el artículo 69-B aparece como causa de descalificación).

**Qué se entrega al terminar.** Un reporte de proveedores que le facturan a la entidad y que están en la lista negra del SAT.

**Cuándo se considera aceptada.**
- Cruza los proveedores contra la lista 69-B.
- Se mantiene actualizado con la lista vigente del SAT.

**Cómo probarla.** Cruzar un conjunto que incluya al menos un proveedor conocido de la lista negra y confirmar que lo detecta.

**Smoke tests para QA.**
- Incluir un proveedor de la lista negra y confirmar que lo marca.
- Confirmar que un proveedor limpio no genera falsa alarma.

**Subtareas (lo que hay que hacer para lograrla).**

- **Cruce contra la lista negra del SAT** · `Nuevo · C2 · prio Media`  
  Conecta con la causa de descalificación 69-B que menciona la licitación.

---

## HITO G — Inteligencia de datos (lo más avanzado, va al final)

Esta es la capa más avanzada: detección automática de cosas raras, tendencias, y preguntas en lenguaje natural. Va **al final** por una razón importante: se construye encima de los datos ya descargados y procesados. Si los datos de abajo están mal, esta capa da respuestas mal. Primero bien los cimientos, luego lo inteligente.

### G.1 Detectar automáticamente cosas raras en los datos

`Nuevo · C2`

Un tablero que revisa solo los datos y avisa de cosas que se salen de lo normal: sueldos fuera de rango, empleados duplicados, saltos raros de un periodo a otro. Funciona con reglas definidas, encima de los datos ya procesados.

**Qué se entrega al terminar.** Un tablero de alertas configurable por reglas.

**Cuándo se considera aceptada.**
- Detecta las anomalías definidas.
- Con pocas falsas alarmas (el nivel se acuerda con el cliente).

**Cómo probarla.** Sembrar anomalías conocidas en los datos y verificar que las detecta.

**Smoke tests para QA.**
- Meter un sueldo fuera de rango a propósito y confirmar que lo detecta.
- Meter un duplicado a propósito y confirmar que lo detecta.

**Subtareas (lo que hay que hacer para lograrla).**

- **Detección de sueldos fuera de rango, duplicados y saltos** · `Nuevo · C2 · prio Baja`  
  Reglas sobre los datos ya procesados.

---

### G.2 Mostrar tendencias y proyecciones

`Nuevo · C2`

Vistas de cómo evolucionan los números en el tiempo: por dependencia, por tipo de nómina, por fuente de recurso. Útil para el cliente y vendible a otros. Se apoya en el histórico ya procesado.

**Qué se entrega al terminar.** Vistas de tendencia con la evolución histórica por las categorías clave.

**Cuándo se considera aceptada.**
- Las tendencias cuadran con los datos procesados.
- Cubre las categorías principales.

**Cómo probarla.** Comparar una tendencia contra el cálculo directo de esos mismos periodos.

**Smoke tests para QA.**
- Confirmar que la línea de tendencia coincide con los datos base.

**Subtareas (lo que hay que hacer para lograrla).**

- **Tendencias históricas por dependencia, nómina y fuente** · `Nuevo · C2 · prio Baja`  
  Vendible también a otros clientes.

---

### G.3 Preguntar en lenguaje natural (IA)

`Nuevo · C2`

Una función donde el usuario escribe una pregunta normal —'cuánto se retuvo de ISR en la Secretaría X en el segundo semestre'— y el sistema la traduce a una consulta sobre los datos y responde. Es lo último que se construye, sobre una base ya sólida y validada, porque una respuesta de IA solo es tan buena como los datos que tiene debajo.

**Qué se entrega al terminar.** Una interfaz que responde preguntas en lenguaje natural, y cuyas respuestas se pueden verificar contra el reporteo normal.

**Cuándo se considera aceptada.**
- Traduce bien las preguntas frecuentes a consultas correctas.
- Las respuestas se pueden comprobar contra la consulta de D.1.
- Ante una pregunta ambigua, pide que se aclare en vez de inventar.

**Cómo probarla.** Hacer preguntas cuya respuesta ya se conoce y comparar contra la consulta manual equivalente.

**Smoke tests para QA.**
- Preguntar algo de respuesta conocida y confirmar que coincide con D.1.
- Confirmar que ante una pregunta ambigua pide precisión en vez de inventar un dato.

**Subtareas (lo que hay que hacer para lograrla).**

- **Traducir preguntas a consultas sobre los datos** · `Nuevo · C2 · prio Baja`  
  Va al final, sobre una base ya sólida. Las respuestas deben ser verificables.

---

## HITO H — Infraestructura y operación

Aquí van solo las piezas que se programan. La licencia en papel y el contrato de soporte, al ser trámites administrativos y no código, quedan fuera de este backlog.

### H.1 Publicar la plataforma en la nube

`Nuevo · C1`

Poner la plataforma en un servicio de nube para que esté disponible por internet las 24 horas, todos los días, durante los 5 años del contrato, y que cada entidad entre con sus propias credenciales.

**Qué se entrega al terminar.** La plataforma funcionando en la nube, accesible por una dirección web pública y con alta disponibilidad.

**Cuándo se considera aceptada.**
- La dirección web pública funciona 24/7.
- Cada entidad entra con sus credenciales.
- Preparada para operar durante 5 años.

**Cómo probarla.** Pruebas de que está disponible y accesible desde internet con las credenciales de una entidad.

**Smoke tests para QA.**
- Entrar por la dirección pública e identificarse.
- Confirmar que sigue disponible después de reiniciar el servicio.

**Subtareas (lo que hay que hacer para lograrla).**

- **Servicio en la nube disponible 24/7** · `Nuevo · C1 · prio Alta`  
  Requisito de la licitación por 5 años.

---

### H.2 Mantener el sistema al día con los cambios del SAT

`Nuevo · C1`

El SAT cambia de vez en cuando la estructura de las facturas. Esta tarea es tener la forma de actualizar el sistema cuando eso pase, sin romper los datos que ya se tenían guardados.

**Qué se entrega al terminar.** Una forma de actualizar la lectura de facturas cuando el SAT cambie su estructura, sin perder lo histórico.

**Cuándo se considera aceptada.**
- El sistema se adapta a los cambios de estructura del SAT.
- Las actualizaciones no dañan los datos viejos.

**Cómo probarla.** Simular un cambio del SAT y verificar que el sistema se ajusta sin perder lo anterior.

**Smoke tests para QA.**
- Aplicar un cambio simulado y reprocesar un lote.
- Confirmar que los datos anteriores siguen consultables.

**Subtareas (lo que hay que hacer para lograrla).**

- **Actualizaciones por cambios del SAT** · `Nuevo · C1 · prio Alta`  
  Mantenimiento continuo durante la vida del servicio.

---

### H.3 Entregar los datos al terminar el servicio

`Nuevo · C1`

Al final de los 5 años, hay que poder entregarle al cliente toda su información procesada en un formato que pueda llevarse a otra nube o a sus propios servidores. Es un requisito de la licitación para que el cliente no quede 'atrapado'.

**Qué se entrega al terminar.** Un proceso que exporta toda la información procesada en un formato que se puede volver a cargar en otro lado.

**Cuándo se considera aceptada.**
- Exporta toda la información procesada.
- El formato permite volver a cargarla en otra instalación.

**Cómo probarla.** Exportar un conjunto de prueba y volver a cargarlo en un entorno limpio.

**Smoke tests para QA.**
- Exportar y verificar que el paquete está completo.
- Volver a cargarlo en un entorno limpio y confirmar que los datos quedan consultables.

**Subtareas (lo que hay que hacer para lograrla).**

- **Exportación final de datos** · `Nuevo · C1 · prio Baja`  
  Al terminar los 5 años, para que el cliente pueda migrar a otra nube o a sus servidores.

---

## Orden recomendado para trabajar

1. **Hito 0** — primero y obligatorio: dejar sólido y seguro lo que ya existe.
2. **Hito C (modelo de datos) + A.7 (desmenuzado local)** — el verdadero cimiento. En cuanto exista el modelo de datos y el desmenuzado al timbrar, toda entidad empieza a acumular histórico analizable, sin depender del SAT. Es el camino más corto para tener análisis funcionando.
3. **Hito B** — configuración por entidad (cómo timbra, si tiene acceso al SAT).
4. **Hito D (reporteo, incluido el selector de fuente D.0)** — con datos locales ya se puede reportar; no hay que esperar al SAT.
5. **A.6 (descarga del SAT)** — agrega la segunda fuente y desbloquea la cobertura completa y la conciliación de auditoría (E.4). Requiere AutoPAC.
6. **Hito E** — conciliación fiscal (E.1–E.3) y de auditoría (E.4, que necesita A.6).
7. **Hitos F y G** — crecimiento del producto: ingresos e inteligencia de datos.
8. **Hito H** — corre en paralelo: infraestructura y operación.

**La pieza de la que depende casi todo es el modelo de datos analítico (C.1).** Sobre él se apoyan las dos fuentes (local A.7 y SAT A.6) y todo el análisis. Corrección clave respecto a la versión anterior: **la analítica ya no depende de la descarga del SAT.** Con el desmenuzado local (A.7) toda entidad tiene análisis desde el primer CFDI que timbra; la descarga del SAT (A.6) solo amplía la cobertura y habilita la conciliación de auditoría. Por eso conviene priorizar C.1 + A.7 antes que A.6.
