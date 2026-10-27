# Datos de Manta

`manta-graph.json` contiene un extracto conectado de 300 nodos y 432 aristas derivado de OpenStreetMap. Las coordenadas y las geometrías corresponden a calles reales. Fuente: © OpenStreetMap contributors, datos bajo [ODbL 1.0](https://www.openstreetmap.org/copyright).

El grafo derivado se distribuye bajo ODbL 1.0. La licencia de estos datos es independiente de la del código. El archivo incluye consulta Overpass, fecha de descarga, límites y SHA-256 del original.

## Alcance y transformación

Consulta bbox sur/oeste/norte/este: `-0.99,-80.77,-0.925,-80.665`. Se conservan vías urbanas accesibles que coinciden con los tipos indicados en la consulta. Se extrae la mayor componente conectada; se simplifican cadenas de grado 2 conservando su geometría y sumando distancias. Luego se seleccionan 300 intersecciones por BFS desde una coordenada central aproximada.

Límites del extracto seleccionado: latitud -0.9607397 a -0.9444469, longitud -80.7307153 a -80.7105729. **No cubre todos los barrios del enunciado**. Ampliar cobertura requiere aumentar el tamaño o seleccionar otro extracto conectado; nunca añadir conexiones artificiales para unir barrios.

Se usa un grafo peatonal sin dirección. El atributo original `oneway` se conserva como metadato, pero no limita evacuación a pie. Eso no serviría directamente para camionetas. Las restricciones peatonales específicas y la accesibilidad requieren una validación adicional antes de un uso real. Los cuatro refugios y su ubicación son simulados, no albergues oficiales.

## Reproducir

`npm.cmd run map:import` consulta Overpass si no hay caché. Si existe `data/manta-osm.raw.json`, la reutiliza sin red. El original está excluido de Git por tamaño. Para otra descarga, mueve ese original fuera de la carpeta y ejecuta nuevamente el importador. La consulta está en `scripts/import-manta.js`. El resultado se versiona y puede ejecutarse sin Internet.

Los nodos de grado 1 y los cambios de dirección/sinuosidad no son necesariamente intersecciones semaforizadas. El origen OSM no garantiza que todas las calles estén transitables hoy. Es un mapa para la simulación del concurso.
