# Arquitectura de Manta Rescue

## Implementada y probada localmente

```mermaid
flowchart LR
  OSM[OpenStreetMap / Overpass] -->|importación reproducible| Map[data/manta-graph.json]
  Browser[Panel web] -->|estado + controles con clave de operador| API[Servidor Node.js]
  Sim[Simulador: escritor único] -->|HTTP POST /paso por persona: timeout 500 ms| API
  API --> Planner[Horizonte temporal 4 turnos + Dijkstra inverso]
  Map --> World[Mundo del turno]
  World --> Planner
  API --> World
  Sim -->|preparar / resolver| World
  World --> Store[Snapshot + checksum + backup + lock]
  API --> Metrics[Métricas de cálculo y HTTP local]
```

Servidor, simulador y planificador viven en un mismo proceso. El puerto escucha en localhost por defecto. Los archivos estáticos y health son públicos; estado y paso requieren API key; control requiere clave de operador. Las claves se inyectan por entorno y no se persisten en el snapshot.

El simulador prepara el turno y lo guarda antes de pedir decisiones; todas usan ese estado estable. Al terminar los timeouts aplica una única resolución y guarda el turno confirmado. Recuperar una fase `deciding` repite decisiones idempotentes, no el movimiento de zombis. La conexión HTTP y su timeout están implementados aunque el cliente esté en el mismo host.

## Objetivo AWS, todavía pendiente

```mermaid
flowchart LR
  Public[Usuarios y evaluador] -->|HTTPS público| ALB[Application Load Balancer]
  ALB --> ECS[ECS Fargate: API y panel]
  ECS -->|lectura versión confirmada| DB[(DynamoDB)]
  Sim[Simulador: escritor coordinado] -->|snapshot inmutable y puntero de turno| DB
  Secrets[Secrets Manager: API_KEY y ADMIN_KEY] --> ECS
  ECS --> CW[CloudWatch]
```

No existe aún adaptador DynamoDB. El volumen Docker local no se convierte automáticamente en almacenamiento persistente Fargate. No activar varias réplicas del servidor actual: cada una tendría un mundo distinto. Exportar esta arquitectura a PNG/SVG al cerrar el diseño para cumplir el entregable del concurso.
