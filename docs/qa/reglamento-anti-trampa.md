# Reglamento anti-trampa del COIN Investment Challenge

- Estado: **borrador de QA, sin aprobar**. Las conductas prohibidas, las sanciones y el proceso
  los decide el Gerente General. Los puntos marcados con **[Decide el Gerente]** están abiertos.
- Versión: 0.2, del 2026-11-18. Versión anterior: 0.1, del 2026-11-16.
- Reglas de la plataforma: `docs/engine-rules.md`. Decisiones: `docs/decisiones-gerente.md`.

### Decisiones del Gerente aplicadas en esta versión

| ID   | Tema                          | Sección |
| ---- | ----------------------------- | ------- |
| D-01 | Redondeo y monto mínimo       | 5       |
| D-05 | Catálogo y horario 24/7       | 3       |
| D-08 | Origen de los precios         | 3       |
| D-11 | Precio obsoleto y tick futuro | 5       |
| D-12 | Desempate del ranking         | 9       |
| D-13 | Bots y scripts prohibidos     | 4 y 5   |
| D-19 | Aprobación del ranking final  | 9       |

## 1. Alcance

Aplica a todos los participantes del Challenge durante las dos ventanas del ranking: 2 días y
30 días. Participar implica aceptar este reglamento.

## 2. Principios

1. Una persona, una cuenta.
2. Gana quien obtiene el mayor retorno operando, no quien explota un error de la plataforma.
3. Las señales automáticas son indicios, no pruebas. Nadie es sancionado solo por una señal.
4. QA entrega evidencia. La decisión de sancionar es del Gerente.

## 3. Mercado: horario, catálogo y precios

**Horario y catálogo (D-05)**

- Se operan los 31 símbolos de `packages/shared/src/instrument.ts`.
- Todos operan 24 horas, 7 días a la semana, incluidos fines de semana y festivos. No hay
  calendario de bolsa: un símbolo de acciones o materias primas no cierra cuando cierra su bolsa.
- Un símbolo solo está cerrado si la organización lo deshabilita o si su precio está obsoleto
  (sección 5). Mientras esté cerrado no se aceptan órdenes en él.
- Las órdenes solo se aceptan dentro de la ventana de la competencia, entre su inicio y su cierre.

**Origen de los precios (D-08)**

- El único proveedor de precios es Binance. Todos los precios cotizan contra USDT y se muestran
  como USD.
- Criptomonedas y EURUSD salen del mercado spot de Binance. Acciones, ETF y materias primas salen
  de contratos perpetuos de Binance que siguen al activo real.
- Por eso los precios pueden diferir de los de la bolsa o del mercado de referencia, sobre todo
  cuando esa bolsa está cerrada. El precio válido para el Challenge es el de la plataforma.
- Las órdenes se ejecutan al precio de la plataforma en el momento de recibirlas: las compras al
  `ask` y las ventas al `bid`. El participante no puede enviar su propio precio.
- Si el proveedor falla y el precio queda obsoleto, las órdenes en ese símbolo se rechazan. No
  hay reclamos por órdenes rechazadas ni por movimientos ocurridos mientras el precio estaba
  obsoleto.

## 4. Conductas prohibidas

| N.º | Conducta                                                                                         |
| --- | ------------------------------------------------------------------------------------------------ |
| 1   | Tener o usar más de una cuenta                                                                   |
| 2   | Compartir, prestar, vender u operar la cuenta de otra persona                                    |
| 3   | Coordinar cuentas: posiciones opuestas o espejo entre dos o más cuentas para asegurar un ganador |
| 4   | Explotar errores de la plataforma: redondeo, precios obsoletos, gaps de apertura, duplicación    |
| 5   | Enviar peticiones manipuladas: precios propios, cantidades inválidas, símbolos falsos            |
| 6   | Acceder o intentar acceder a datos de otra cuenta o a funciones de administración                |
| 7   | Degradar el servicio: ráfagas de peticiones, conexiones masivas o escaneos                       |
| 8   | Operar con scripts, bots o cualquier programa que envíe órdenes de forma automática (D-13)       |

La conducta 8 incluye llamar a la API directamente fuera de la aplicación web, extensiones del
navegador que operen solas y programas que repitan órdenes. Usar herramientas de análisis que no
envían órdenes está permitido.

Quien encuentre un error debe reportarlo a la organización y no usarlo. **[Decide el Gerente:
si se reconoce de alguna forma a quien reporta un error.]**

## 5. Controles de la plataforma

Se aplican por igual a todas las cuentas. Los límites de peticiones los propone el Backend y los
valida QA con pruebas de carga (D-13); los valores de QA de la versión 0.1 quedan como
referencia.

| Control                               | Valor                                                    | Estado                       |
| ------------------------------------- | -------------------------------------------------------- | ---------------------------- |
| Órdenes por cuenta                    | Propone el Backend. Referencia QA: 5/s y 2.000 por día   | No implementado              |
| Intentos de ingreso por IP            | Propone el Backend. Referencia QA: 10 por minuto         | No implementado              |
| Monto mínimo por orden (D-01)         | 10 USD; por debajo se rechaza                            | No implementado (DEF-001)    |
| Redondeo en contra del participante   | Compra hacia arriba al centavo; venta hacia abajo (D-01) | No implementado (DEF-001)    |
| Órdenes solo con precio fresco (D-11) | Umbral por símbolo definido en `packages/shared`         | Parcial: hoy 30 s para todos |
| Tick con fecha futura (D-11)          | Más de 2 s en el futuro se considera inválido            | No implementado (DEF-002)    |
| Órdenes solo dentro de la ventana     | Entre el inicio y el cierre de la competencia            | Implementado                 |
| Sesiones simultáneas por cuenta       | **[Decide el Gerente]**                                  | No implementado              |

## 6. Señales que QA vigila

Ninguna es una prueba. Cada una abre una revisión manual.

| Señal                                                          | Qué puede indicar          | Explicación inocente frecuente      |
| -------------------------------------------------------------- | -------------------------- | ----------------------------------- |
| Varias cuentas desde la misma IP o dispositivo                 | Multicuenta                | Wi-Fi del campus, equipo compartido |
| Una cuenta con muchas IP o dispositivos a la vez               | Cuenta compartida          | Datos móviles y Wi-Fi               |
| Dos cuentas con órdenes opuestas en el mismo símbolo y segundo | Cuentas coordinadas        | Coincidencia en un símbolo popular  |
| Dos cuentas con las mismas órdenes, una tras otra              | Copia o un solo operador   | Amigos que comentan sus jugadas     |
| Muchas órdenes mínimas o a intervalos regulares                | Bot o abuso de redondeo    | Ninguna habitual                    |
| Órdenes concentradas tras una caída del feed                   | Abuso de precios obsoletos | Entusiasmo al volver el precio      |
| Retorno muy alto con riesgo casi nulo                          | Explotación de un error    | Ninguna habitual                    |

La señal por IP pesa poco en este evento: casi todos operarán desde la misma red del campus.

## 7. Proceso de revisión

1. QA detecta la señal y arma la evidencia: órdenes, horas, precios del tick y registros de
   acceso. Todo sale de `audit_logs`, `fills` y `ledger_entries`.
2. QA entrega un informe al Gerente con los hechos, sin acusar a nadie.
3. El Gerente decide si hay caso y escucha al participante. **[Decide el Gerente: plazo y forma
   de los descargos.]**
4. El Gerente resuelve y la decisión queda por escrito.

## 8. Sanciones

**[Decide el Gerente.]** Opciones a considerar, de menor a mayor:

1. Advertencia.
2. Anulación de las operaciones afectadas y recálculo del retorno.
3. Exclusión del ranking y de los premios.
4. Descalificación del Challenge.

## 9. Ranking y premiación

**Desempate (D-12, provisional)**

1. Se ordena por retorno, calculado con 4 decimales.
2. Si dos cuentas empatan, gana la que tenga menos órdenes ejecutadas.
3. Si siguen empatadas, gana la que llegó primero a ese retorno.

**Aprobación del ranking final (D-19)**

- Antes de cada premiación QA audita el ranking con `audit:leaderboard`: lo reconstruye desde el
  libro contable y lo compara con el mostrado. Cualquier diferencia detiene la premiación.
- Se revisan las cuentas en puestos de premio y las que tengan señales abiertas.
- El Gerente aprueba el ranking final con el informe de QA. Sin esa aprobación no se premia.
- **[Decide el Gerente: cuánto tiempo hay entre el cierre y la premiación para revisar.]**

## 10. Datos personales

- Para verificar una persona por cuenta se usa el dato mínimo necesario. **[Decide el Gerente:
  qué dato y cómo se verifica: documento, correo institucional o registro del congreso.]**
- IP y dispositivo se guardan solo para estos controles y se informan al participante al
  inscribirse.
- Las pruebas de QA no usan datos reales de asistentes.

## 11. Pendientes para aprobar este reglamento

1. Valores de los límites de peticiones (propuesta del Backend, validación de QA).
2. Sesiones simultáneas por cuenta y reconocimiento a quien reporta un error.
3. Sanciones y proceso de descargos.
4. Verificación de identidad y plazo entre el cierre y la premiación.
5. Desempate definitivo (D-12 es provisional).
6. Licencia de uso de los precios de Binance (D-08, la consulta el Gerente).
7. Revisión legal del tratamiento de datos personales.
