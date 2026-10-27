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

## Pasos detallados de consola

Los nombres siguientes son convenciones del proyecto. La fase A se puede hacer ahora. Las fases B y C son la receta de despliegue: no implican que la integración de DynamoDB ya esté terminada. El despliegue actual con una tarea es solamente una demostración y pierde estado al reiniciar.

### A. Presupuesto, región y repositorio de contenedores

1. En la barra de búsqueda de AWS escribe **Billing and Cost Management**. En **Budgets → Create budget**, elige configuración personalizada y **Cost budget**.
2. Nombre `spookython-manta`, periodo **Monthly**, recurrencia continua y método **Fixed**. Introduce el presupuesto que el equipo acepte. USD 10 es un ejemplo de alerta, no el costo previsto de Fargate + ALB durante un mes.
3. Deja el alcance en todos los servicios. Añade tres alertas **Actual** al 50, 80 y 100 por ciento y una **Forecasted** al 100 por ciento. Añade el correo destinatario en cada una, revisa y crea. Completa la verificación de correo y guarda la captura.
4. En el selector superior de región, usa **US East (N. Virginia) / us-east-1**, sujeto a confirmación de la organización. Mantén esta región en los demás pasos.
5. Busca **Elastic Container Registry**. En **Private registry → Repositories → Create repository**, nombre `manta-rescue`; usa etiquetas inmutables para identificar cada compilación por commit, cifrado predeterminado y activa análisis básico de imágenes al subir en la configuración de escaneo del registro.
6. Guarda el URI mostrado, por ejemplo `ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/manta-rescue`. No es un secreto.
7. En el repositorio elige **View push commands**. Esos comandos contienen el identificador correcto de tu cuenta. Se ejecutarán en una máquina con Docker y AWS CLI autenticada; CloudShell no sustituye automáticamente un entorno de compilación Docker.

### B. Preparar secreto, logs y permisos

1. **Secrets Manager → Store a new secret → Other type of secret**. Añade una pareja `API_KEY` con valor aleatorio fuerte, por ejemplo 32 bytes aleatorios en hexadecimal. Usa la clave de cifrado predeterminada, nombre `manta-rescue/api`, sin rotación automática por ahora. No reutilices la clave del preview local.
2. Copia el ARN del secreto para la definición de tarea. Al usar el secreto JSON completo como variable se enviaría un JSON en lugar de la clave: selecciona específicamente el campo `API_KEY` mediante `ARN_DEL_SECRETO:API_KEY::` en la referencia de ECS. Requiere Fargate Linux plataforma 1.4.0 o superior.
3. **CloudWatch → Logs → Log groups → Create log group**: `/ecs/manta-rescue`. Establece retención de 7 días para el evento; exporta las evidencias que deban conservarse.
4. **IAM → Roles → Create role → AWS service → Elastic Container Service → Elastic Container Service Task**. Crea `manta-execution-role` con `AmazonECSTaskExecutionRolePolicy`. Añade una política inline que permita únicamente `secretsmanager:GetSecretValue` sobre el ARN exacto anterior. Si cambias a una clave KMS propia, también necesitarás `kms:Decrypt` limitado a esa clave.
5. El **execution role** permite descargar la imagen, enviar logs e inyectar el secreto. El **task role** será otro rol para permisos del código sobre DynamoDB cuando se implemente; no adjuntes AdministratorAccess a ninguno.

### C. Red y servicio Fargate

Antes de ejecutar esta fase calcula su costo. Para un primer despliegue del contenedor se puede usar una sola tarea, sin escalado; no satisface aún los objetivos de persistencia y alta disponibilidad.

1. **VPC → Your VPCs**: usa una VPC existente del equipo si tiene dos subredes públicas en zonas distintas y salida a Internet. Si no existe, **Create VPC → VPC and more**, nombre `manta-vpc`, 2 AZ, 2 subredes públicas, 0 privadas y 0 NAT gateways para esta variante inicial. Verifica DNS y ruta `0.0.0.0/0` al Internet Gateway.
2. Crea security group `manta-alb-sg`: entrada TCP 443 desde Internet; TCP 80 solo para redirigir a HTTPS. Crea `manta-task-sg`: entrada TCP 8080 **desde el grupo `manta-alb-sg`**, nunca desde `0.0.0.0/0`. Mantén salida para descargar ECR y acceder a logs/secrets.
3. **EC2 → Target Groups → Create target group**: tipo **IP addresses**, nombre `manta-api`, HTTP, puerto 8080, misma VPC. Health check HTTP `/health`, código esperado 200. No registres manualmente IPs: ECS lo hará.
4. Si tienes un dominio, **Certificate Manager → Request public certificate**, agrega el subdominio que usarás y valida por DNS. Espera estado **Issued**. El certificado debe estar en la región del ALB.
5. **EC2 → Load Balancers → Create → Application Load Balancer**: nombre `manta-alb`, internet-facing, IPv4, misma VPC, dos subredes públicas, grupo `manta-alb-sg`. Listener HTTPS 443 con el certificado y destino `manta-api`; HTTP 80 redirige a HTTPS. Sin dominio/certificado esta receta HTTPS no está completa: no mandes la API key por HTTP público.
6. **ECS → Clusters → Create cluster**: nombre `manta-cluster`, infraestructura Fargate.
7. **Task definitions → Create new task definition**: familia `manta-rescue`, Fargate, Linux/X86_64, red `awsvpc`. Punto de partida para medir: 0.5 vCPU y 1 GB RAM; ajustar después de carga real. Execution role `manta-execution-role`.
8. Contenedor `app`, URI de ECR con etiqueta del commit, puerto TCP 8080, variables `HOST=0.0.0.0` y `PORT=8080`. Variable secreta `API_KEY` desde la referencia del campo del secreto. Logging `awslogs`, grupo `/ecs/manta-rescue`, región `us-east-1`, prefijo `app`.
9. En el cluster, **Services → Create**: Fargate, definición anterior, nombre `manta-service`, desired tasks **1**, sin autoscaling. Usa las subredes públicas y grupo `manta-task-sg`, **Public IP enabled** para salida a ECR/logs/secrets sin NAT. Tener IP pública no abre 8080: el grupo de seguridad lo restringe al ALB. Para tareas privadas después se necesita NAT o endpoints VPC y sus costos.
10. Load balancing: ALB existente `manta-alb`, contenedor `app:8080`, target group `manta-api`. Configura health check grace period de 60 segundos. Espera servicio estable y target healthy.
11. Crea el registro DNS del subdominio hacia el ALB (Alias A en Route 53 o CNAME en otro proveedor para un subdominio). Comprueba `/health` por HTTPS antes de introducir la clave en el panel.
12. Prueba `/estado` y `/paso` desde fuera de AWS y registra latencia extremo a extremo, errores y disponibilidad. No confundas `/metricas` con esta medición.

Para publicar una nueva versión, construye y sube una etiqueta nueva a ECR, registra otra revisión de la definición de tarea y actualiza el servicio. La versión actual pierde el mundo durante el cambio; corregir persistencia antes del ensayo final.

### D. DynamoDB, antes de escalar

Receta prevista, sujeta al modelo de datos definitivo: **DynamoDB → Tables → Create table**, nombre `manta-world`, partition key `pk` String, sort key `sk` String, capacidad **On-demand**. No crear aún a partir de esta receta sin integrar primero el código: actualiza la especificación anterior, que solo proponía `pk`.

Se prevé `pk=WORLD#id`, `sk=TURN#000142` para snapshots inmutables y un puntero a turno confirmado con escritura condicional. Las réplicas solo leen turnos completos. El simulador tendrá un solo escritor coordinado; el rol de API tendrá lectura únicamente. Esta integración y sus pruebas son trabajo pendiente.

### E. Evidencias y cierre

- Captura del Budget y alertas, sin identificadores o correos que no quieras hacer públicos.
- URL pública HTTPS, instrucciones reproducibles, p95 externo y resultados de las tres rondas.
- Diagrama exportado a PNG/SVG y declaración de costos reales y mensuales.
- Mantener servicio hasta el pitch. Después eliminar servicio/tareas, ALB, recursos de red dedicados e imágenes que ya no se necesiten, revisando también secretos, logs y tablas. Escalar tareas a cero no elimina los cargos del ALB.

Referencias oficiales adicionales:

- https://docs.aws.amazon.com/cost-management/latest/userguide/create-cost-budget.html
- https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-create.html
- https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/getting-started-fargate.html
- https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-load-balancing.html

No se han creado recursos AWS desde este proyecto. No compartir contraseñas ni access keys en el chat.
