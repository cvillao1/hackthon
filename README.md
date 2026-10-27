# Manta Rescue

Motor de evacuación para Spookython 2026, Track A: calles de Manta de OpenStreetMap, planificación temporal de rutas, simulador HTTP y panel en vivo. Versión local 0.2; despliegue AWS pendiente.

## Ejecutar en Windows

Requiere Node.js 22 o superior. No necesita instalar paquetes.

```powershell
$env:API_KEY = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
$env:ADMIN_KEY = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
# Para introducir la clave de operador en el panel, puedes copiarla al portapapeles:
$env:ADMIN_KEY | Set-Clipboard
npm.cmd start
```

Abre http://127.0.0.1:8080, pega la clave de operador y pulsa Conectar. Prepara el escenario, inicia o avanza un turno. Pausa antes de avanzar manualmente. Al reiniciar conserva el mundo pero siempre arranca pausado. La clave del navegador solo permanece en memoria. `.env.example` documenta variables; Node no carga `.env` automáticamente. Docker Compose sí lee `.env` si se crea localmente; está excluido de Git.

## Qué está implementado

- Extracto conectado de Manta: 300 nodos, 432 calles OSM, geometría original, coordenadas, distancias y tipo. El panel conserva curvas y atribución. Se ejecuta sin tiles ni peticiones a terceros.
- Tres escenarios de 20/80/200 personas, cuatro tipos de zombis, cuatro refugios simulados, eventos del turno 30 y semillas reproducibles. Sin superposición inicial de zombis/personas/refugios; personas inicialmente en nodos distintos.
- Corredores persiguen por distancia en grafo; el planificador anticipa su persecución y penaliza exposición. No consulta zombis dormidos ocultos.
- Planificación en espacio-tiempo de cuatro turnos con espera, bloqueo de hordas y vecinos, validación de cruces conocidos contra cada segmento recorrido por zombis. Recalcula cada turno, con distancias estáticas y rutas cacheadas por versión del estado.
- El simulador prepara el movimiento zombi, publica el estado, hace una solicitud HTTP por persona en paralelo y aplica las respuestas. Timeout de 500 ms o respuesta inválida implica esperar.
- Estado JSON persistente con checksum SHA-256, escritura a temporal y rename, backup anterior, bloqueo de escritor y RNG serializado. Se guarda antes y después de resolver movimientos. Puede retomar un turno preparado sin mover zombis otra vez.
- Clave de evaluador separada de operador, límites de cuerpo, encabezados de seguridad y health check. En producción las claves deben ser diferentes.

## Pruebas y mediciones

```powershell
npm.cmd test
npm.cmd run benchmark
npm.cmd run benchmark:http
```

`benchmark` compara Dijkstra base y planificador predictivo en el mismo mapa y las semillas 7, 42 y 123. No mide HTTP. `benchmark:http` abre un puerto efímero, mide cinco ráfagas de 200 solicitudes, y ejecuta los tres escenarios mediante HTTP con semilla 42. Rondas aceleradas sin esperar 2 segundos. No crea recursos AWS.

Resultados versionados y límites de interpretación: [docs/verificacion.md](docs/verificacion.md). Informes de cada ejecución se guardan en `results/`, excluido de Git. Los resultados locales no certifican latencia, disponibilidad ni supervivencia en AWS.

## API

Todas las rutas de datos/control requieren `x-api-key`. HTML, CSS, JS y `/health` son públicos.

| Ruta | Función |
| --- | --- |
| `GET /health` | Salud del proceso y detección de fallo de persistencia |
| `GET /estado` | Grafo, amenazas visibles, trazas del turno, personas, refugios y bloqueos |
| `POST /paso` | `{"sobrevivienteId":"S-0000","nodoActual":"OSM-id-real","turno":1}` → `{"siguienteNodo":"OSM-id-vecino"}`. Copiar IDs del estado; no usar literalmente estos ejemplos. Sin efecto sobre la posición. |
| `GET /metricas` | p95 interno de cálculo y p95 HTTP observado por simulador local, errores y timeouts |
| `POST /control` | Solo operador: `reset` con `round` 1–3 y `seed` entero; `start`, `pause`, `step`; `block` con nodos vecinos `a` y `b` |

Turno o posición falsa: 400. Falta de clave: 401. Evaluador intentando controlar: 403. Control durante operación: 409, reintentar al terminar. Fallo de almacenamiento: servicio no saludable 503. El simulador no modifica el mundo mientras se recogen decisiones. Repetir `/paso` en el mismo estado da la misma respuesta.

La clave de operador permite leer y controlar. La de evaluador permite consultar y decidir. El panel puede conectarse con cualquiera; sus controles solo funcionan con la de operador.

## Persistencia y recuperación

Archivo por defecto: `runtime/world.json`; configurable con `STATE_FILE`. Se crea `.bak` con la versión anterior válida. Si el principal está corrupto, se recupera el backup y el sistema queda pausado. Si ambos están corruptos, se rechaza el arranque: no se reinicia silenciosamente la partida.

Solo un proceso puede usar un archivo de estado. `runtime/world.json.lock` contiene su PID. Tras una terminación abrupta puede quedar el lock; confirma en el Administrador de tareas que ese proceso ya no existe antes de retirar únicamente el archivo `.lock`. No borres el snapshot para liberar un bloqueo. `Ctrl+C` o SIGTERM cierra y libera el lock normalmente.

El snapshot no contiene claves API. El checksum detecta corrupción accidental, no sustituye permisos del sistema de archivos. La durabilidad ante corte eléctrico depende del sistema de archivos. Mantener backup externo antes de la demo. Los contadores de latencia se reinician al reiniciar el proceso.

## Preparación de despliegue

`Dockerfile` usa Node 22 Alpine y usuario no root, incluye el mapa y declara volumen `/app/runtime`. `compose.yaml` prepara volumen persistente y health check; requiere Docker Desktop en ejecución:

```powershell
docker compose up --build
```

El puerto del host se limita a localhost. `.dockerignore` excluye claves, estado y datos crudos. El motor Docker no estaba iniciado al preparar esta versión: imagen y Compose todavía no se han verificado ejecutándolos.

[Guía AWS](docs/aws.md), [arquitectura](docs/arquitectura.md), [costos](docs/costos.md), [datos OSM y licencia](data/README.md).

## Pendientes y decisiones a confirmar

- El extracto geográfico es parcial: no incluye todos los barrios del enunciado. Los refugios son simulados y no tienen capacidad. Sin camionetas.
- Velocidades asumidas: un vecino por turno para personas; tipo y distancia ponderan costo de ruta (avenida 1.5 m/s, calle 1.2, puente 1.0 como parámetros del prototipo). Horda inmóvil. Confirmar con organización velocidades/reglas definitivas; no son velocidades oficiales.
- La predicción de cuatro turnos es heurística, no garantiza supervivencia. El mapa muestra una cola de ruta estática después del horizonte; solo se ejecuta el próximo movimiento y se replantea al siguiente turno.
- Mordidas: coincidencia al final del turno y cruces opuestos por segmentos de la traza. Confirmar si un corredor que pasa por una persona inmóvil en un nodo intermedio también debe morderla.
- El simulador y el motor comparten proceso actualmente. HTTP local comprueba contrato, pero falta cliente de carga en otro host y prueba sostenida de 15 minutos en AWS.
- Persistencia de archivo es local y de un escritor. ECS Fargate no conserva el disco efímero entre tareas: necesita EFS con configuración apropiada o un adaptador DynamoDB, con coordinación de escritor y turnos versionados, antes de escalar o afirmar persistencia AWS.
- Falta deploy público HTTPS, observabilidad AWS, costos verificados, captura de Budget y presentación final.
