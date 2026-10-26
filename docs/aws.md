# Configuración de AWS por etapas

## Ahora: cuenta y presupuesto

1. Usa la cuenta del equipo o el sandbox autorizado. Activa MFA para el usuario raíz y trabaja con una identidad administrativa del equipo; no generes claves del usuario raíz.
2. En Billing and Cost Management → Budgets → Create budget, crea un presupuesto de costo mensual llamado `spookython-manta`. Ejemplo de umbral de aviso: USD 10; ajústalo al presupuesto real del equipo. No es una estimación del proyecto.
3. Incluye todos los servicios y configura avisos de costo real al 50 %, 80 % y 100 %, y de costo previsto al 100 %, a tu correo.
4. Verifica el correo destinatario si AWS lo solicita. Revisa la confirmación recibida.
5. Guarda una captura que muestre presupuesto y alertas en `docs/budget.png`, sin datos sensibles. Budget avisa: no constituye un límite duro del gasto y puede haber retraso.
6. Confirma con la organización la región `us-east-1` antes de crear infraestructura de pago.

Documentación: https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html y https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-email-recipients.html

## Siguiente etapa: despliegue, después de externalizar estado

Arquitectura prevista: contenedor en ECS Fargate detrás de un Application Load Balancer HTTPS; DynamoDB para snapshots versionados y simulador con un solo escritor. La selección debe revisarse contra el presupuesto antes de crear servicios. ALB y cómputo tienen cargos aunque haya poco tráfico.

Preparar entonces:

- ECR: repositorio privado `manta-rescue`, análisis de imagen y política de retención de imágenes.
- DynamoDB: tabla `manta-world`, clave de partición `pk` de tipo String, modo bajo demanda. El código actual NO la utiliza; no crear aún como si estuviese conectada.
- Secrets Manager: secreto con la clave `API_KEY`; inyectarlo mediante la definición de tarea. No ponerlo en Git ni dentro de la imagen. Limitar el rol de ejecución al ARN del secreto.
- ECS Fargate: Linux/x86_64, puerto del contenedor 8080, `HOST=0.0.0.0`, health check HTTP `/health`. Dimensionar CPU/memoria mediante carga real, no por intuición.
- ALB: acceso HTTPS con certificado ACM y dominio del equipo. Security group del contenedor acepta 8080 únicamente desde el security group del ALB. No exponer 8080 directamente a Internet.
- CloudWatch: logs con retención explícita y alarmas de errores y latencia. Medir p95 también desde un cliente externo.

No activar escalado horizontal hasta usar estado compartido y coordinar el escritor del simulador. La versión local en memoria no es compatible con varias tareas independientes.

Documentación: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data-tutorial.html y https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html

No se han creado recursos AWS desde este proyecto. No compartir contraseñas ni access keys en el chat.
