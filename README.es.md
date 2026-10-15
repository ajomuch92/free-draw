# Free Draw

[English](README.md) · **Español**

Clon ligero de CorelDRAW hecho con Tauri + Vue 3 + Tailwind CSS v4. Dibujo vectorial sobre SVG nativo, unidades en milímetros.

```bash
bun install
bun run dev          # navegador en http://localhost:1420
bun run tauri dev    # app de escritorio
```

En la app de escritorio, abrir, guardar y exportar usan los diálogos nativos de Windows y avisa antes de cerrar con cambios sin guardar; en el navegador los archivos se descargan. **Archivo** muestra los documentos abiertos recientemente (solo escritorio). El documento puede tener **varias páginas** (pestañas abajo del lienzo), con reglas, guías y cuadrícula.

La interfaz está en **español e inglés** (selector ES/EN en la barra de menú; arranca en el idioma del sistema). Los textos viven en `src/i18n.ts`: el texto en español es la clave, y `bun run check:i18n` falla si a alguno le falta su traducción.

Los **rectángulos** pueden tener las esquinas redondeadas con un mismo radio o uno distinto por esquina (candado en la barra de propiedades).

Las operaciones de **Dar forma** (soldar, recortar, intersecar, simplificar, frente/detrás) usan [paper.js](http://paperjs.org) solo para cálculo y conservan las curvas. El objetivo es el objeto de más atrás de la selección. Las **cotas** (paralela, horizontal/vertical, angular) se ajustan a los nodos de los objetos al dibujarlas; **Separar** (Ctrl+K) convierte una cota en líneas, flechas y texto editables.

**Exportar a PNG** pide la resolución (72–600 ppp) y si el fondo es transparente, y recorta la imagen a los objetos en lugar de toda la página.

## Atajos (estilo CorelDRAW)

| Acción | Tecla |
|---|---|
| Selección / alternar herramienta | Espacio |
| Mano alzada, Rectángulo, Elipse, Texto | F5, F6, F7, F8 |
| Polígono, Zoom, Desplazamiento | Y, Z, H |
| Forma (editar nodos) | F10 |
| Forma: doble clic en nodo / en segmento | Eliminar nodo / agregar nodo |
| Forma: arrastrar un segmento | Curvarlo (las líneas rectas pasan a curva) |
| Convertir a curvas (también texto, solo escritorio), Combinar, Separar (curvas y cotas) | Ctrl+Q, Ctrl+L, Ctrl+K |
| Agrupar, Desagrupar | Ctrl+G, Ctrl+U |
| Ctrl+clic | Seleccionar un objeto dentro de un grupo |
| Alinear izquierda, derecha, arriba, abajo | L, R, T, B |
| Alinear centros (misma fila / misma columna), centrar en página | E, C, P |
| Página anterior / siguiente | RePág / AvPág |
| Arrastrar desde una regla / soltar sobre ella | Crear guía / borrar guía |
| Alt al mover | Sin ajuste a guías, cuadrícula ni objetos |
| Ajustar a objetos | Alt+Z |
| Clic sobre objeto ya seleccionado | Alterna escalar / rotar |
| Ctrl al dibujar / mover / rotar | Cuadrado-círculo / eje fijo / pasos de 15° |
| Alt al escalar desde una esquina | Sin mantener proporción |
| Shift al dibujar o escalar | Desde el centro |
| Paleta: clic / clic derecho | Relleno / contorno |
| Paleta: "+" / Mayús+clic en un color propio | Agregar / quitar color personalizado |
| Duplicar, Duplicar en sitio | Ctrl+D, + (teclado numérico) |
| Orden | Ctrl/Shift + RePág/AvPág |
| Zoom a objetos / página | F4 / Shift+F4 |
| Nuevo, Abrir, Guardar, Guardar como, Importar imagen, Exportar SVG | Ctrl+N, Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+I, Ctrl+E |
