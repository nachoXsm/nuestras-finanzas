# Presupuesto — Puesta a punto de trailers

`presupuesto_doc.html` es la fuente del presupuesto. El PDF se genera desde ahí,
así que **los cambios se hacen en el HTML**, nunca sobre el PDF.

## Regenerar el PDF

```bash
node render.js presupuesto_doc.html Presupuesto_Puesta_a_Punto_Trailers.pdf
```

`render.js` usa Playwright/Chromium con `preferCSSPageSize`, que respeta el
`@page` del HTML (595,92 × 842,88 pt, márgenes 37,5 / 36,96 / 42,85 pt).

## Cómo cierran los números

- TC: USD 1 = $ 1.520. Los importes en USD salen de dividir los pesos por el TC.
- Los materiales ($ 44.609.331) son los mismos en las tres opciones.
- Opción A = materiales + jornales cuadrilla + contratistas A/A + contratista de
  piso + viáticos.
- Opciones B y C = materiales + su respectiva mano de obra.

Al tocar cualquier importe hay que revisar, en cascada: las tres tarjetas del
encabezado, la nota del TC, el total de materiales, los subtotales de la
sección 2, la tabla de la sección 3, la comparativa de la sección 4, el recuadro
de destaque (importes y porcentajes) y la nota "Bases de la comparación".

## Archivos

| Archivo | Qué es |
|---|---|
| `presupuesto_doc.html` | Fuente editable |
| `render.js` | Script de renderizado a PDF |
| `Presupuesto_Puesta_a_Punto_Trailers.pdf` | Salida vigente |
| `Presupuesto_Puesta_a_Punto_Trailers_original.pdf` | Versión previa, de referencia |
