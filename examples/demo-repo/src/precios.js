export const IVA = 0.21;

const CUPONES = new Map([
  ['BIENVENIDA', { tipo: 'porcentaje', valor: 0.1, minimo: 0 }],
  ['ENVIO5', { tipo: 'fijo', valor: 500, minimo: 3000 }],
]);

export function buscarCupon(codigo) {
  if (!codigo) return null;
  return CUPONES.get(String(codigo).trim().toUpperCase()) || null;
}

// Descuento por volumen: a partir de 10 unidades del mismo artículo, un 5%.
// Se aplica ANTES que el cupón para que dos descuentos no se multipliquen
// entre sí sin control.
function descuentoVolumen(uds) {
  return uds >= 10 ? 0.05 : 0;
}

export function precioConDescuento(articulo, uds, cupon) {
  let precio = articulo.precioCentimos;
  precio = Math.round(precio * (1 - descuentoVolumen(uds)));

  if (!cupon) return precio;
  if (precio * uds < cupon.minimo) return precio;

  if (cupon.tipo === 'porcentaje') return Math.round(precio * (1 - cupon.valor));
  if (cupon.tipo === 'fijo') return Math.max(0, precio - Math.round(cupon.valor / uds));
  return precio;
}
