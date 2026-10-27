# Verificación local — 26 de octubre de 2026 (Ecuador)

Resultados de Node.js v22.11.0 sobre el mapa OSM versionado. Los JSON incluyen timestamp UTC (27 de octubre UTC corresponde a la noche del 26 en Ecuador). No son resultados AWS ni una certificación oficial.

## Comparación del algoritmo

Nueve escenarios: rondas 1, 2 y 3 × semillas 7, 42 y 123. Cada pareja parte del mismo estado; al cambiar decisiones, la persecución zombi puede divergir. Se comparan implementaciones en el simulador actual, no con la simulación sintética de la primera versión.

| Estrategia | Personas a salvo | Total | Proporción |
| --- | --- | --- | --- |
| Dijkstra base (amenazas actuales) | 606 | 900 | 67.3 % |
| Horizonte temporal con predicción | 820 | 900 | 91.1 % |

En la ronda 3, por semillas 7/42/123: base 116/146/150 de 200; predictivo 164/191/189. Se cuentan como a salvo únicamente quienes llegaron a un refugio. Personas que siguen activas al terminar 150 turnos no cuentan como salvadas.

Este conjunto pequeño permite detectar regresiones; no demuestra superioridad universal. Ajustamos las penalizaciones tras observar que un primer prototipo excesivamente conservador dejaba personas esperando. Se necesita un conjunto adicional de semillas no usado para ajustar, y confirmar la definición oficial de supervivencia y eficiencia.

El informe incluye `efficiencyAmongSaved` (promedio de saltos mínimos sin amenazas / turnos usados entre quienes llegaron). Es una métrica diagnóstica local y no la fórmula oficial, que las imágenes no detallan completamente.

[Resultados por escenario](verification/simulation-local.json)

## HTTP: 200 solicitudes simultáneas

Cinco ráfagas de 200 solicitudes, 1.000 en total. Incluye el primer acceso tras cada reset. Cliente y servidor comparten proceso y host; hay HTTP real y parsing JSON, pero no tráfico de Internet ni separación física de carga.

| Medida | Resultado |
| --- | --- |
| p50 | 126.21 ms |
| p95 | 268.12 ms |
| Máximo | 278.79 ms |
| Solicitudes ≥500 ms | 0 |
| Errores / timeouts / movimientos inválidos | 0 / 0 / 0 |

Pasa el límite de 500 ms en esta máquina. El p95 de ráfagas todavía supera el objetivo de 150 ms para la máxima nota. El resultado depende de equipo, carga concurrente y red; no prometer el mismo valor en AWS.

## Escenarios completos por HTTP

Semilla 42, ejecución acelerada (sin dormir dos segundos entre turnos). Se finaliza antes de 150 si no quedan personas activas. Esto no sustituye el ensayo real sostenido de 15 minutos.

| Ronda | A salvo | Decisiones HTTP | p95 | Máximo | Errores / timeouts |
| --- | --- | --- | --- | --- | --- |
| 1 | 20/20 | 168 | 13.33 ms | 14.61 ms | 0 / 0 |
| 2 | 73/80 | 2.172 | 41.47 ms | 53.84 ms | 0 / 0 |
| 3 | 191/200 | 3.804 | 100.46 ms | 146.51 ms | 0 / 0 |

[Informe HTTP reproducible](verification/http-local.json)

## Otras comprobaciones

La suite verifica integridad y conectividad del mapa, semillas reproducibles, calles bloqueadas, vecinos de horda, rechazo de cruces opuestos en ambos segmentos de un corredor, privacidad de dormidos, invalidación de caché, espera si no hay salida, checksum, continuación exacta del RNG y fase de turno, timeout HTTP real, permisos de operador/evaluador, 200 peticiones concurrentes, reinicio persistente y recuperación de backup.

Verificado visualmente en el navegador: conexión del panel, escenario de 200 personas, geometría OSM y avance de turno HTTP. [Captura del mapa](mapa-manta.png).

Docker Desktop está instalado, pero su motor Linux no estaba iniciado. No se pudo construir ni ejecutar el contenedor; Dockerfile y Compose están preparados, pendientes de esa verificación. No se creó ningún recurso AWS.

## Reproducir

```powershell
npm.cmd test
npm.cmd run benchmark
npm.cmd run benchmark:http
```

Los scripts guardan los nuevos reportes en `results/`. No sustituir estos informes versionados con cifras editadas manualmente; al cambiar algoritmo o mapa, volver a medir y copiar el resultado completo.
