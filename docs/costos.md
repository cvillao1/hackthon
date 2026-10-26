# Declaración de costos — pendiente de completar

No hay infraestructura desplegada ni gasto AWS verificado por este proyecto. No interpretar este documento como declaración final.

Registrar región, fecha de consulta y enlaces a precios vigentes en AWS Pricing Calculator antes de aprovisionar.

| Componente previsto | Cálculo mensual a completar |
| --- | --- |
| Fargate | tareas × horas × (vCPU × precio/vCPU-h + GB × precio/GB-h) |
| ALB | horas × precio/h + LCU-h × precio/LCU-h |
| DynamoDB | unidades lectura/escritura × precio + almacenamiento |
| ECR | GB de imagen × precio/GB-mes |
| CloudWatch | ingestión + almacenamiento de logs + alarmas |
| Secrets Manager | secretos × precio/mes + llamadas |
| Red | IPv4 públicas + transferencia + NAT si se usa |

Mostrar por separado: costo de mantener el servicio durante el evento, proyección mensual y gasto real obtenido de Billing/Cost Explorer. Registrar descuentos/créditos por separado. Evitar añadir NAT Gateway sin justificar su costo. Falta adjuntar captura de Budget.
