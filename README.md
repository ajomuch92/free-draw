# Free Draw

Clon ligero de CorelDRAW hecho con Tauri + Vue 3 + Tailwind CSS v4. Dibujo vectorial sobre SVG nativo, unidades en milímetros.

```bash
bun install
bun run dev          # navegador en http://localhost:1420
bun run tauri dev    # app de escritorio
```

Las operaciones de **Dar forma** (soldar, recortar, intersecar, simplificar, frente/detrás) usan [paper.js](http://paperjs.org) solo para cálculo y conservan las curvas. El objetivo es el objeto de más atrás de la selección. Las **cotas** (paralela, horizontal/vertical, angular) se ajustan a los nodos de los objetos al dibujarlas.

## Atajos (estilo CorelDRAW)

| Acción | Tecla |
|---|---|
| Selección / alternar herramienta | Espacio |
| Mano alzada, Rectángulo, Elipse, Texto | F5, F6, F7, F8 |
| Polígono, Zoom, Desplazamiento | Y, Z, H |
| Forma (editar nodos) | F10 |
| Forma: doble clic en nodo / en segmento | Eliminar nodo / agregar nodo |
| Convertir a curvas, Combinar, Separar | Ctrl+Q, Ctrl+L, Ctrl+K |
| Clic sobre objeto ya seleccionado | Alterna escalar / rotar |
| Ctrl al dibujar / mover / rotar | Cuadrado-círculo / eje fijo / pasos de 15° |
| Shift al dibujar o escalar | Desde el centro |
| Paleta: clic / clic derecho | Relleno / contorno |
| Duplicar, Duplicar en sitio | Ctrl+D, + (teclado numérico) |
| Orden | Ctrl/Shift + RePág/AvPág |
| Zoom a objetos / página | F4 / Shift+F4 |
| Nuevo, Abrir, Guardar, Exportar SVG | Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+E |
