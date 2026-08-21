// Siembra el proyecto de demostración: vincula examples/demo-repo y le registra
// unos cuantos cambios con su antes/después y su porqué. Sirve para la primera
// toma de contacto ("levántalo y mira qué es esto") y para las capturas del
// README, sin necesidad de enchufarle un repo tuyo.
//
//   node scripts/seed-demo.mjs
//
// Escribe en data/, que está en .gitignore: no toca el historial de nadie.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProject, addChange, addProposal, decideProposal, updateChange, listProjects } from '../lib/store.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, 'examples', 'demo-repo');

// Los números de línea se buscan en el archivo real en vez de escribirlos a
// mano: si alguien edita el demo-repo, las capturas y la vista de pantalla
// completa siguen apuntando a la función correcta en vez de a un hueco.
function rango(archivo, firma) {
  const lineas = readFileSync(join(REPO, archivo), 'utf8').split('\n');
  const inicio = lineas.findIndex((l) => l.includes(firma));
  if (inicio === -1) throw new Error(`No encuentro "${firma}" en ${archivo}`);
  let fin = inicio;
  while (fin < lineas.length && lineas[fin] !== '}') fin++;
  return { lineStart: inicio + 1, lineEnd: fin + 1 };
}

function ahora(dia, hora) {
  return `2026-03-${String(dia).padStart(2, '0')}T${hora}:00.000Z`;
}

if (listProjects().some((p) => p.id === 'demo-carrito')) {
  console.error('Ya existe el proyecto "demo-carrito". Borra data/ si quieres volver a sembrarlo.');
  process.exit(1);
}

const p = createProject({ name: 'Demo Carrito', repoPath: REPO, githubRemote: null });
console.log('proyecto:', p.id);

const c1 = addChange(p.id, {
  date: ahora(11, '09:14'),
  unitType: 'función',
  unitName: 'anadir()',
  title: 'anadir() rechaza las entradas imposibles en vez de guardarlas',
  files: [{
    file: 'src/carrito.js',
    ...rango('src/carrito.js', 'export function anadir('),
    language: 'javascript',
    before: `export function anadir(carrito, articulo, uds = 1) {
  const previa = carrito.lineas.get(articulo.sku);
  carrito.lineas.set(articulo.sku, {
    articulo,
    uds: previa ? previa.uds + uds : uds,
  });
  return carrito;
}`,
    after: `export function anadir(carrito, articulo, uds = 1) {
  if (!articulo || !articulo.sku) throw new Error('El artículo necesita un sku.');
  if (!Number.isInteger(uds) || uds < 1) throw new Error('Las unidades deben ser un entero positivo.');

  const previa = carrito.lineas.get(articulo.sku);
  carrito.lineas.set(articulo.sku, {
    articulo,
    uds: previa ? previa.uds + uds : uds,
  });
  return carrito;
}`,
  }],
  explanation:
    'Sin las dos guardas, un artículo sin sku entraba en el Map bajo la clave ' +
    '"undefined" y se comía cualquier otro artículo igual de roto; y un uds ' +
    'negativo restaba unidades por la puerta de atrás, saltándose quitar(). ' +
    'Los dos fallos son silenciosos: el carrito no peta, solo enseña un total ' +
    'que no cuadra con lo que el cliente cree que lleva. Mejor reventar aquí.',
});

const c2 = addChange(p.id, {
  date: ahora(11, '10:02'),
  unitType: 'función',
  unitName: 'quitar()',
  title: 'quitar() puede quitar solo parte de la línea, no siempre entera',
  files: [{
    file: 'src/carrito.js',
    ...rango('src/carrito.js', 'export function quitar('),
    language: 'javascript',
    before: `export function quitar(carrito, sku) {
  carrito.lineas.delete(sku);
  return carrito;
}`,
    after: `export function quitar(carrito, sku, uds = Infinity) {
  const linea = carrito.lineas.get(sku);
  if (!linea) return carrito;

  if (uds >= linea.uds) carrito.lineas.delete(sku);
  else linea.uds -= uds;
  return carrito;
}`,
  }],
  explanation:
    'El botón "−" de la ficha tenía que bajar de 3 unidades a 2, y con el ' +
    'delete de antes vaciaba la línea entera. El parámetro por defecto es ' +
    'Infinity para que las llamadas que ya existían — quitar(carrito, sku) — ' +
    'sigan borrando la línea completa sin tocarlas.',
});

const c3 = addChange(p.id, {
  date: ahora(11, '12:40'),
  unitType: 'función',
  unitName: 'totalCentimos()',
  title: 'El total se calcula en céntimos enteros de principio a fin',
  files: [
    {
      file: 'src/carrito.js',
      ...rango('src/carrito.js', 'export function totalCentimos('),
      language: 'javascript',
      before: `export function total(carrito) {
  let base = 0;
  for (const linea of carrito.lineas.values()) {
    base += (linea.articulo.precio * linea.uds);
  }
  return (base * (1 + IVA)).toFixed(2);
}`,
      after: `export function totalCentimos(carrito) {
  let base = 0;
  for (const linea of carrito.lineas.values()) {
    base += precioConDescuento(linea.articulo, linea.uds, carrito.cupon) * linea.uds;
  }
  return Math.round(base * (1 + IVA));
}`,
    },
    {
      file: 'src/precios.js',
      lineStart: 1,
      lineEnd: 1,
      language: 'javascript',
      before: 'export const IVA = 0.21;\n// los precios venían en euros con decimales',
      after: 'export const IVA = 0.21;',
    },
  ],
  explanation:
    'Sumar euros en coma flotante y redondear al final descuadra los tickets ' +
    'largos: 0.1 + 0.2 no es 0.3, y hacia la vigésima línea el total dejaba de ' +
    'coincidir con la suma de las líneas que el cliente ve. Ahora todo el ' +
    'cálculo vive en enteros de céntimo y solo se vuelve a euros al formatear. ' +
    'Cambia el nombre a totalCentimos() a propósito: quien la llame tiene que ' +
    'enterarse de que la unidad ya no es la misma.',
});

const c4 = addChange(p.id, {
  date: ahora(12, '08:20'),
  unitType: 'función',
  unitName: 'buscarCupon()',
  title: 'Los cupones se buscan normalizados: "  bienvenida " es BIENVENIDA',
  relationType: 'jump',
  relationNote:
    'Nada que ver con el cálculo del total de ayer. Viene de soporte: la gente ' +
    'pega el código desde el email con espacios y en minúsculas, y el cupón ' +
    '"no existía".',
  files: [{
    file: 'src/precios.js',
    ...rango('src/precios.js', 'export function buscarCupon('),
    language: 'javascript',
    before: `export function buscarCupon(codigo) {
  return CUPONES.get(codigo) || null;
}`,
    after: `export function buscarCupon(codigo) {
  if (!codigo) return null;
  return CUPONES.get(String(codigo).trim().toUpperCase()) || null;
}`,
  }],
  explanation:
    'Un Map con claves en mayúsculas y una búsqueda sin normalizar solo acierta ' +
    'si el usuario teclea exactamente igual. String() antes del trim porque el ' +
    'código llega del querystring y a veces viene como array cuando el ' +
    'parámetro aparece dos veces en la URL.',
});

const c5 = addChange(p.id, {
  date: ahora(12, '09:05'),
  unitType: 'función',
  unitName: 'precioConDescuento()',
  title: 'Volumen primero, cupón después — y nunca los dos multiplicándose a ciegas',
  files: [{
    file: 'src/precios.js',
    ...rango('src/precios.js', 'export function precioConDescuento('),
    language: 'javascript',
    before: `export function precioConDescuento(articulo, uds, cupon) {
  let precio = articulo.precioCentimos;
  if (cupon && cupon.tipo === 'porcentaje') precio *= (1 - cupon.valor);
  if (uds >= 10) precio *= 0.95;
  return Math.round(precio);
}`,
    after: `export function precioConDescuento(articulo, uds, cupon) {
  let precio = articulo.precioCentimos;
  precio = Math.round(precio * (1 - descuentoVolumen(uds)));

  if (!cupon) return precio;
  if (precio * uds < cupon.minimo) return precio;

  if (cupon.tipo === 'porcentaje') return Math.round(precio * (1 - cupon.valor));
  if (cupon.tipo === 'fijo') return Math.max(0, precio - Math.round(cupon.valor / uds));
  return precio;
}`,
  }],
  explanation:
    'Tres cosas que antes no estaban. El orden es fijo y explícito (volumen y ' +
    'luego cupón) para que el descuento total sea reproducible en vez de ' +
    'depender de en qué if entró. El mínimo del cupón se comprueba contra el ' +
    'importe de la línea, que es lo que promete la letra pequeña. Y el cupón ' +
    'fijo reparte su valor entre las unidades en lugar de restar 5 € a cada ' +
    'una: con 10 unidades regalaba 50 € en vez de 5.',
});

// Una propuesta pendiente: código que NO está en demo-repo. Es el caso que
// justifica que la vista completa avise de que el archivo que lee del disco es
// el actual y no el propuesto.
addProposal(p.id, {
  date: ahora(12, '10:30'),
  unitType: 'módulo',
  unitName: 'CUPONES',
  title: 'Sacar los cupones a un fichero de configuración',
  files: [{
    file: 'src/precios.js',
    ...rango('src/precios.js', 'const CUPONES = new Map(['),
    language: 'javascript',
    before: `const CUPONES = new Map([
  ['BIENVENIDA', { tipo: 'porcentaje', valor: 0.1, minimo: 0 }],
  ['ENVIO5', { tipo: 'fijo', valor: 500, minimo: 3000 }],
]);`,
    after: `import cupones from '../config/cupones.json' with { type: 'json' };

// Los cupones cambian por campaña, no por versión del código. Manteniéndolos
// aquí, cada promoción de marketing es un despliegue.
const CUPONES = new Map(Object.entries(cupones));`,
  }],
  explanation:
    'Cada campaña nueva obliga hoy a tocar precios.js, revisarlo y desplegar, ' +
    'para algo que no es una decisión de código sino de negocio. Con el JSON ' +
    'aparte, cambiar un cupón deja de ser un cambio de código. Lo dejo como ' +
    'propuesta y no hecho porque implica decidir dónde vive ese fichero en ' +
    'producción y quién puede editarlo — y eso no es mío.',
});

// Una descartada, con su motivo: saber qué se rechazó y por qué evita que se
// vuelva a proponer lo mismo dentro de tres semanas.
const rechazada = addProposal(p.id, {
  date: ahora(12, '10:45'),
  unitType: 'dependencia',
  unitName: 'decimal.js',
  title: 'Usar decimal.js para el dinero en vez de enteros de céntimo',
  files: [{
    file: 'src/carrito.js',
    ...rango('src/carrito.js', 'export function totalCentimos('),
    language: 'javascript',
    before: `export function totalCentimos(carrito) {
  let base = 0;
  for (const linea of carrito.lineas.values()) {
    base += precioConDescuento(linea.articulo, linea.uds, carrito.cupon) * linea.uds;
  }
  return Math.round(base * (1 + IVA));
}`,
    after: `import Decimal from 'decimal.js';

export function total(carrito) {
  let base = new Decimal(0);
  for (const linea of carrito.lineas.values()) {
    base = base.plus(new Decimal(precioConDescuento(linea.articulo, linea.uds, carrito.cupon)).times(linea.uds));
  }
  return base.times(new Decimal(1).plus(IVA)).toDecimalPlaces(0);
}`,
  }],
  explanation:
    'Una librería de decimales haría el redondeo explícito y quitaría de en ' +
    'medio los Math.round repartidos por precios.js.',
});

decideProposal(p.id, rechazada.id, {
  decision: 'reject',
  note: 'Los enteros de céntimo ya resuelven el problema sin meter una dependencia ' +
        'en un módulo que hoy no tiene ninguna. decimal.js pesa más que todo el carrito.',
});

// Un par marcados como revisados: así la barra de progreso y el árbol de la
// vista completa se ven como se ven de verdad después de una sesión.
updateChange(p.id, c1.id, { verified: true, note: 'Probado con sku vacío y con uds = -2. Peta como debe.' });
updateChange(p.id, c2.id, { verified: true });

console.log('cambios sembrados: 5 (2 revisados) · 1 propuesta pendiente · 1 descartada');
console.log('ahora: npm start  →  http://localhost:4173');
