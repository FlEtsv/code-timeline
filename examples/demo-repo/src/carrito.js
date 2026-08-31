import { precioConDescuento, IVA } from './precios.js';

// Un carrito mínimo: sirve de repo de ejemplo para las capturas y para que
// cualquiera pueda levantar Code Timeline con datos reales sin tener que
// enchufarle un proyecto suyo.

export function crearCarrito() {
  return { lineas: new Map(), cupon: null };
}

export function anadir(carrito, articulo, uds = 1) {
  if (!articulo || !articulo.sku) throw new Error('El artículo necesita un sku.');
  if (!Number.isInteger(uds) || uds < 1) throw new Error('Las unidades deben ser un entero positivo.');

  const previa = carrito.lineas.get(articulo.sku);
  carrito.lineas.set(articulo.sku, {
    articulo,
    uds: previa ? previa.uds + uds : uds,
  });
  return carrito;
}

export function quitar(carrito, sku, uds = Infinity) {
  const linea = carrito.lineas.get(sku);
  if (!linea) return carrito;

  if (uds >= linea.uds) carrito.lineas.delete(sku);
  else linea.uds -= uds;
  return carrito;
}

export function contar(carrito) {
  let total = 0;
  for (const linea of carrito.lineas.values()) total += linea.uds;
  return total;
}

// El total se calcula en enteros de céntimo de principio a fin. Sumar euros
// en coma flotante y redondear al final descuadra los tickets largos: 0.1 +
// 0.2 no es 0.3, y a la vigésima línea el ticket ya no cuadra con la suma de
// sus líneas. Solo se vuelve a euros al formatear.
export function totalCentimos(carrito) {
  let base = 0;
  for (const linea of carrito.lineas.values()) {
    base += precioConDescuento(linea.articulo, linea.uds, carrito.cupon) * linea.uds;
  }
  return Math.round(base * (1 + IVA));
}

export function formatear(centimos) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
    .format(centimos / 100);
}
