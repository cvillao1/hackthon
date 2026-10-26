# Manta Rescue

Prototipo para Spookython 2026, Track A. Motor de evacuación, simulador reproducible y panel web en vivo. No es todavía una entrega final del concurso.

## Ejecutar en Windows

Requiere Node.js 22 o superior. No necesita instalar paquetes.

```powershell
$env:API_KEY = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
# Conserva esta clave en tu gestor de contraseñas. Introdúcela en el panel web.
npm.cmd start
```

Abre http://127.0.0.1:8080, introduce la clave y pulsa Conectar. Selecciona escenario y semilla, prepara e inicia. Puedes pausar, avanzar un turno y seleccionar una persona para visualizar su ruta. La clave se mantiene únicamente en memoria del navegador. `.env.example` es una referencia: el servidor no carga `.env` automáticamente.

## Validación

```powershell
npm.cmd test
npm.cmd run benchmark
```

El benchmark ejecuta 150 turnos por escenario con semilla 42. Mide cálculo local, NO latencia HTTP ni rendimiento AWS. No equivale a la prueba oficial y una única semilla no demuestra robustez.

## API

Todas las rutas de datos y control requieren la cabecera `x-api-key`. El HTML, JS, CSS y `/health` son públicos.

- `GET /health`: disponibilidad del proceso.
- `GET /estado`: grafo, amenazas visibles, personas, refugios, turno y bloqueos.
- `POST /paso`: `{"sobrevivienteId":"S-0000","nodoActual":"N-0117","turno":0}`. Devuelve `{"siguienteNodo":"N-0118"}`; usa IDs reales de `/estado`. Rechaza turno o posición incorrectos con HTTP 400.
- `GET /metricas`: p95 del cálculo en peticiones reales a `/paso`, últimas 10.000 muestras. Excluye red, lectura del cuerpo y serialización. No debe presentarse como p95 extremo a extremo.
- `POST /control`: acciones `reset` (con `round`:1–3 y `seed`:entero), `start`, `pause`, `step`, `block` (con nodos `a`, `b`).

## Diseño actual

Dijkstra recalcula por sobreviviente. Penaliza proximidad de corredores y excluye nodos con zombis visibles, vecinos de hordas y aristas bloqueadas. Distancia y tipo de calle participan en el costo. Si no hay ruta, espera. Los zombis se mueven primero; todas las decisiones de sobrevivientes usan el mismo estado posterior al movimiento. Se comprueban encuentros al final del turno y cruces opuestos contra cada segmento recorrido por zombis.

El panel consulta el estado cada segundo. Cada turno automático dura 2 segundos; una ronda para a los 150 turnos o al no quedar personas activas. El estado vive en un único proceso; se pierde al reiniciar. No ejecutar múltiples réplicas de esta versión.

## Limitaciones y pendientes antes de competir

- El mapa es una cuadrícula sintética, NO OpenStreetMap ni calles reales de Manta. Las personas pueden compartir nodo inicial y los refugios no tienen capacidad.
- El simulador integrado llama directamente al motor: falta el modo de evaluación HTTP con timeout de 500 ms y carga concurrente.
- Falta estado externo versionado para despliegue y varias réplicas. No hay integración AWS todavía.
- El corredor persigue mediante distancia Manhattan de la cuadrícula; sustituir por distancia en grafo al incorporar Manta.
- La penalización de riesgo no es planificación temporal ni garantiza evitar cruces futuros. No están implementados camionetas ni capacidad de refugios.
- Confirmar con organización: velocidad de sobrevivientes por tipo de calle, momento exacto de aparición de dormidos y mordidas intermedias de corredores. Se interpreta una calle por turno para sobrevivientes y horda inmóvil.
- Faltan métricas oficiales de eficiencia, disponibilidad, rondas múltiples y p95 HTTP desde un cliente externo.
- El acceso de control usa la misma clave que `/paso`; separar permisos de operador y evaluador antes de publicar.
- Falta HTTPS público, política IAM, alarmas CloudWatch, diagrama final exportado, costos con precios vigentes, captura del Budget y presentación.

## AWS y entregables

Consulta [configuración AWS](docs/aws.md), [arquitectura](docs/arquitectura.md) y [costos](docs/costos.md). `Dockerfile` prepara el contenedor; aún no ha sido construido ni desplegado. Mantener la aplicación pública hasta el pitch. Nunca incluir claves AWS o de la API en Git, capturas o README.
