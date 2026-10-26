# Arquitectura

## Implementada localmente

```mermaid
flowchart LR
  Browser[Panel web] -->|HTTP + API key: estado / control| Server[Servidor Node.js único]
  Client[Cliente evaluador] -->|POST /paso + API key| Server
  Server --> Router[Dijkstra con riesgo]
  Server --> Simulator[Simulador cada 2 segundos]
  Simulator --> Router
  Router --> Memory[Estado en memoria]
  Simulator --> Memory
```

## Objetivo AWS, pendiente de implementar

```mermaid
flowchart LR
  Public[Usuarios / evaluador] -->|HTTPS público| ALB[Application Load Balancer]
  ALB --> ECS[ECS Fargate: API / panel]
  ECS -->|lectura por versión| DB[(DynamoDB: turnos inmutables)]
  Sim[Simulador: escritor único] -->|publica turno confirmado| DB
  ECS --> CW[CloudWatch]
  SM[Secrets Manager] -->|inyección al iniciar tarea| ECS
```

ECS no debe ser accesible directamente desde Internet. Un turno debe publicarse completo antes de estar disponible para decisiones. Las rutas y las métricas deben identificar la versión del mundo. Exportar el diagrama final a PNG/SVG para cumplir el entregable.
