# Reglamento anti-trampa del COIN Investment Challenge

- Estado: **borrador de QA, sin aprobar**. Las conductas prohibidas, las sanciones y el proceso
  los decide el Gerente General. Los puntos marcados con **[Decide el Gerente]** están abiertos.
- Versión: 0.1, del 2026-11-16.
- Reglas de la plataforma: `docs/engine-rules.md`.

## 1. Alcance

Aplica a todos los participantes del Challenge durante las dos ventanas del ranking: 2 días y
30 días. Participar implica aceptar este reglamento.

## 2. Principios

1. Una persona, una cuenta.
2. Gana quien obtiene el mayor retorno operando, no quien explota un error de la plataforma.
3. Las señales automáticas son indicios, no pruebas. Nadie es sancionado solo por una señal.
4. QA entrega evidencia. La decisión de sancionar es del Gerente.

## 3. Conductas prohibidas

| N.º | Conducta                                                                                         |
| --- | ------------------------------------------------------------------------------------------------ |
| 1   | Tener o usar más de una cuenta                                                                   |
| 2   | Compartir, prestar, vender u operar la cuenta de otra persona                                    |
| 3   | Coordinar cuentas: posiciones opuestas o espejo entre dos o más cuentas para asegurar un ganador |
| 4   | Explotar errores de la plataforma: redondeo, precios obsoletos, gaps de apertura, duplicación    |
| 5   | Enviar peticiones manipuladas: precios propios, cantidades inválidas, símbolos falsos            |
| 6   | Acceder o intentar acceder a datos de otra cuenta o a funciones de administración                |
| 7   | Degradar el servicio: ráfagas de peticiones, conexiones masivas o escaneos                       |
| 8   | Operar con scripts o bots **[Decide el Gerente: prohibido, o permitido con límites]**            |

Quien encuentre un error debe reportarlo a la organización y no usarlo. **[Decide el Gerente:
si se reconoce de alguna forma a quien reporta un error.]**

## 4. Controles de la plataforma

Límites que QA recomienda aplicar por igual a todas las cuentas. Los valores son propuestas.

| Control                           | Propuesta                         | Estado          |
| --------------------------------- | --------------------------------- | --------------- |
| Órdenes por cuenta                | 5 por segundo y 2.000 por día     | No implementado |
| Monto mínimo por orden            | 10 USD                            | No implementado |
| Intentos de ingreso por IP        | 10 por minuto                     | No implementado |
| Sesiones simultáneas por cuenta   | **[Decide el Gerente]**           | No implementado |
| Órdenes solo con precio fresco    | Umbral de 30 segundos por símbolo | Implementado    |
| Órdenes solo dentro de la ventana | `[startsAt, endsAt)`              | Implementado    |

## 5. Señales que QA vigila

Ninguna es una prueba. Cada una abre una revisión manual.

| Señal                                                          | Qué puede indicar                    | Explicación inocente frecuente      |
| -------------------------------------------------------------- | ------------------------------------ | ----------------------------------- |
| Varias cuentas desde la misma IP o dispositivo                 | Multicuenta                          | Wi-Fi del campus, equipo compartido |
| Una cuenta con muchas IP o dispositivos a la vez               | Cuenta compartida                    | Datos móviles y Wi-Fi               |
| Dos cuentas con órdenes opuestas en el mismo símbolo y segundo | Cuentas coordinadas                  | Coincidencia en un símbolo popular  |
| Dos cuentas con las mismas órdenes, una tras otra              | Copia o un solo operador             | Amigos que comentan sus jugadas     |
| Miles de órdenes mínimas en poco tiempo                        | Abuso de redondeo o un bot           | Ninguna habitual                    |
| Órdenes concentradas justo al abrir o tras una caída del feed  | Abuso de gaps o de precios obsoletos | Entusiasmo de apertura              |
| Retorno muy alto con riesgo casi nulo                          | Explotación de un error              | Ninguna habitual                    |

La señal por IP pesa poco en este evento: casi todos operarán desde la misma red del campus.

## 6. Proceso de revisión

1. QA detecta la señal y arma la evidencia: órdenes, horas, precios del tick y registros de
   acceso. Todo sale de `audit_logs`, `fills` y `ledger_entries`.
2. QA entrega un informe al Gerente con los hechos, sin acusar a nadie.
3. El Gerente decide si hay caso y escucha al participante. **[Decide el Gerente: plazo y forma
   de los descargos.]**
4. El Gerente resuelve y la decisión queda por escrito.

## 7. Sanciones

**[Decide el Gerente.]** Opciones a considerar, de menor a mayor:

1. Advertencia.
2. Anulación de las operaciones afectadas y recálculo del retorno.
3. Exclusión del ranking y de los premios.
4. Descalificación del Challenge.

## 8. Premiación

- Antes de cada premiación QA audita el ranking: lo reconstruye desde el libro contable y lo
  compara con el mostrado. Cualquier diferencia detiene la premiación.
- Se revisan las cuentas en puestos de premio y las que tengan señales abiertas.
- **[Decide el Gerente: quién aprueba el ranking final y cuánto tiempo hay entre el cierre y la
  premiación para revisar.]**

## 9. Datos personales

- Para verificar una persona por cuenta se usa el dato mínimo necesario. **[Decide el Gerente:
  qué dato y cómo se verifica: documento, correo institucional o registro del congreso.]**
- IP y dispositivo se guardan solo para estos controles y se informan al participante al
  inscribirse.
- Las pruebas de QA no usan datos reales de asistentes.

## 10. Pendientes para aprobar este reglamento

1. Regla sobre scripts y bots (conducta 8).
2. Valores de los límites de la sección 4.
3. Sanciones y proceso de descargos.
4. Verificación de identidad y aprobación del ranking final.
5. Revisión legal del tratamiento de datos personales.
