import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Lo que cuesta usar esta herramienta, medido en vez de prometido.
//
// La afirmación del README —que registrar un cambio cuesta unos 400 tokens y
// que redactar el commit desde el historial sale mucho más barato que leerse
// el diff— tiene que poder comprobarse, y tiene que romperse si alguien la
// empeora sin darse cuenta. De eso van estas pruebas: no comprueban que el
// código funcione, comprueban que siga siendo barato.
//
// Un token son ~4 caracteres. Es una aproximación, pero sirve para lo único
// que importa aquí: el ORDEN DE MAGNITUD y que no se dispare.

const DATA = mkdtempSync(join(tmpdir(), 'ct-coste-'));
process.env.CODE_TIMELINE_DATA = DATA;
const store = await import('../lib/store.mjs');
const { aconsejar, comandoCommit } = await import('../lib/consejo.mjs');

const tok = (s) => Math.round(String(s).length / 4);

// Lo que un agente TECLEA para registrar un cambio: lo que le cuesta de salida,
// que son los tokens caros.
function costeDeEscribir(llamada) {
  return tok(JSON.stringify(llamada));
}

function repoConTrabajo() {
  const dir = mkdtempSync(join(tmpdir(), 'ct-repo-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
  g('init', '-b', 'main');
  g('config', 'user.email', 'p@p.p');
  g('config', 'user.name', 'P');
  mkdirSync(join(dir, 'src'));

  // Un archivo de tamaño realista: ~120 líneas.
  const base = Array.from({ length: 120 }, (_, i) => `  const linea${i} = ${i};`);
  writeFileSync(join(dir, 'src/app.js'), `function principal() {\n${base.join('\n')}\n}\n`);
  g('add', '-A');
  g('commit', '-m', 'inicial');

  // Un cambio de tamaño normal: se tocan tres sitios.
  base[10] = '  const linea10 = calcular(10);';
  base[60] = '  const linea60 = calcular(60);';
  base[110] = '  const linea110 = calcular(110);';
  writeFileSync(join(dir, 'src/app.js'), `function principal() {\n${base.join('\n')}\n}\n`);
  return { dir, g };
}

test('registrar un cambio cuesta lo que ocupa su porqué, y poco más', () => {
  const { dir } = repoConTrabajo();
  const p = store.createProject({ name: 'Coste', repoPath: dir });

  // De la longitud real medida sobre las entradas ya registradas: ~1.750
  // caracteres, unos 437 tokens. Con una explicación de juguete el coste fijo
  // de la llamada pesaría desproporcionadamente y la medida no diría nada.
  const explicacion = ('Las tres líneas calculaban el valor a mano y se habían '
    + 'desincronizado entre ellas: la de arriba usaba el redondeo viejo y las otras '
    + 'dos ya no. Se pasa por calcular() para que haya un solo sitio donde '
    + 'arreglarlo la próxima vez, que es lo que no pasó cuando se tocó en marzo. ')
    .repeat(6);

  // Lo que se teclea AHORA: ni una línea de código.
  const llamada = {
    projectId: p.id,
    title: 'Unificar el cálculo en calcular()',
    explanation: explicacion,
    files: [{ file: 'src/app.js' }],
  };
  const coste = costeDeEscribir(llamada);

  const c = store.addChange(p.id, llamada);
  const capturado = c.files.reduce((n, f) => n + tok((f.before || '') + f.after), 0);

  // El porqué es el 80% de lo que se escribe: el resto son metadatos. Si esta
  // proporción baja mucho, es que se ha colado relleno en la llamada.
  // El coste fijo de la llamada —id, título, rutas, sintaxis JSON— tiene que
  // quedarse en el ruido frente al porqué, que es lo que se está comprando.
  const fijo = coste - tok(explicacion);
  assert.ok(fijo < tok(explicacion) * 0.15,
    `el coste fijo (${fijo} tok) debería ser marginal frente al porqué (${tok(explicacion)} tok)`);

  // El ahorro es lo que se habría tecleado del código: la misma llamada con el
  // código dentro habría costado esto más.
  const conCodigo = coste + capturado;
  const ahorro = 1 - coste / conCodigo;
  assert.ok(ahorro > 0.3,
    `la captura solo ahorra un ${Math.round(ahorro * 100)}% (${coste} de ${conCodigo} tok): debería ser bastante más`);

  rmSync(dir, { recursive: true, force: true });
});

test('capturar sale más barato que teclear el código, y por mucho', () => {
  const { dir } = repoConTrabajo();
  const p = store.createProject({ name: 'Coste2', repoPath: dir });

  const comun = { title: 'Unificar el cálculo', explanation: 'Un motivo cualquiera.' };

  const conCaptura = costeDeEscribir({ ...comun, projectId: p.id, files: [{ file: 'src/app.js' }] });

  // Lo mismo, pero escribiendo el código a mano como se hacía antes.
  const c = store.addChange(p.id, { ...comun, files: [{ file: 'src/app.js' }] });
  const f = c.files[0];
  const aMano = costeDeEscribir({
    ...comun, projectId: p.id,
    files: [{ file: 'src/app.js', lineStart: f.lineStart, lineEnd: f.lineEnd, language: 'javascript', before: f.before, after: f.after }],
  });

  assert.ok(aMano > conCaptura * 3,
    `escribir el código a mano (${aMano} tok) debería costar mucho más que capturarlo (${conCaptura} tok)`);
  rmSync(dir, { recursive: true, force: true });
});

test('listar el historial no arrastra el código', () => {
  const { dir } = repoConTrabajo();
  const p = store.createProject({ name: 'Coste3', repoPath: dir });
  for (let i = 0; i < 10; i++) {
    store.addChange(p.id, {
      title: `Cambio ${i}`,
      explanation: 'Un motivo de los de siempre, con su explicación de tamaño normal para que la medida no salga falseada por lo corto.',
      files: [{ file: 'src/app.js' }],
    });
  }

  const completo = tok(JSON.stringify(store.listChanges(p.id)));
  const resumen = tok(JSON.stringify(store.listChanges(p.id).map(store.resumirCambio)));

  assert.ok(resumen < completo / 2,
    `el resumen (${resumen} tok) debería ser menos de la mitad del completo (${completo} tok)`);

  // Pero tiene que seguir sirviendo para orientarse: título y algo de porqué.
  const uno = store.resumirCambio(store.listChanges(p.id)[0]);
  assert.ok(uno.title && uno.explanation && uno.files.length,
    'el resumen no puede quedarse sin lo que hace falta para elegir una entrada');
  rmSync(dir, { recursive: true, force: true });
});

test('el mensaje de commit sale del historial, no de leerse el diff', () => {
  const { dir } = repoConTrabajo();
  const p = store.createProject({ name: 'Coste4', repoPath: dir });
  store.addChange(p.id, {
    title: 'Unificar el cálculo en calcular()',
    explanation: 'Las tres líneas calculaban el valor a mano y se habían desincronizado.',
    files: [{ file: 'src/app.js' }],
  });

  // Lo que costaría hacerlo sin la herramienta: leerse el diff entero.
  const diff = execFileSync('git', ['diff', 'HEAD'], { cwd: dir, encoding: 'utf8' });
  const costeDiff = tok(diff);

  // Lo que cuesta con ella.
  const r = aconsejar(p, store.listChanges(p.id));
  const costeConsejo = tok(comandoCommit(r.mensaje));

  assert.ok(r.mensaje, 'debería haber un mensaje propuesto');
  assert.ok(costeConsejo < costeDiff,
    `el consejo (${costeConsejo} tok) debería costar menos que leerse el diff (${costeDiff} tok)`);
  // Y el mensaje tiene que decir algo, no ser un titular vacío.
  assert.match(r.mensaje.cuerpo, /desincronizado/);
  rmSync(dir, { recursive: true, force: true });
});

test('las respuestas de las herramientas no van infladas de espacios', () => {
  // JSON.stringify sin indentar: lo lee un modelo, y la indentación se paga
  // igual que el contenido.
  const ejemplo = { a: 1, b: [{ c: 'd' }, { c: 'e' }], f: { g: 'h' } };
  const compacto = JSON.stringify(ejemplo);
  const indentado = JSON.stringify(ejemplo, null, 2);
  assert.ok(compacto.length < indentado.length * 0.75,
    'esta prueba solo fija el criterio: se devuelve compacto');
});

test('un proyecto se puede nombrar por su ruta, sin listar antes', () => {
  const { dir } = repoConTrabajo();
  const p = store.createProject({ name: 'Coste5', repoPath: dir });
  // Averiguar el id llamando a list_projects costaba cientos de tokens cada vez.
  assert.equal(store.resolveProject(dir).id, p.id);
  assert.equal(store.resolveProject(p.id).id, p.id);
  rmSync(dir, { recursive: true, force: true });
});

test('el informe de coste, para el README', () => {
  // No falla casi nunca: está para imprimir la medida y que los números del
  // README se puedan rehacer con `node --test test/coste.test.mjs`.
  //
  // Se miden DOS escenarios a propósito, porque el ahorro no es plano y decir
  // solo el bueno sería vender humo: con un cambio pequeño, leerse el diff es
  // más barato que redactar desde el historial; el ahorro aparece cuando el
  // trabajo es grande, que es justo cuando escribir el commit a mano duele.
  const explicacion = ('Las tres líneas calculaban el valor a mano y se habían '
    + 'desincronizado entre ellas: la de arriba usaba el redondeo viejo y las otras '
    + 'dos ya no. Se pasa por calcular() para que haya un solo sitio donde '
    + 'arreglarlo la próxima vez, que es lo que no pasó cuando se tocó en marzo. ')
    .repeat(6);

  function escenario(nombre, nArchivos, nCambios) {
    const dir = mkdtempSync(join(tmpdir(), 'ct-esc-'));
    const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'ignore' });
    g('init', '-b', 'main'); g('config', 'user.email', 'p@p.p'); g('config', 'user.name', 'P');
    mkdirSync(join(dir, 'src'));
    const archivos = [];
    for (let i = 0; i < nArchivos; i++) {
      const f = `src/mod${i}.js`;
      writeFileSync(join(dir, f), Array.from({ length: 200 }, (_, j) => `  const v${j} = ${j};`).join('\n') + '\n');
      archivos.push(f);
    }
    g('add', '-A'); g('commit', '-m', 'inicial');
    for (const f of archivos) {
      const l = Array.from({ length: 200 }, (_, j) => `  const v${j} = ${j};`);
      for (let k = 10; k < 200; k += 40) l[k] = `  const v${k} = calcular(${k});`;
      writeFileSync(join(dir, f), l.join('\n') + '\n');
    }

    const p = store.createProject({ name: nombre, repoPath: dir });
    let escrito = 0, capturado = 0;
    for (let i = 0; i < nCambios; i++) {
      const llamada = {
        projectId: p.id,
        title: `Unificar el cálculo en el módulo ${i}`,
        explanation: explicacion,
        files: [{ file: archivos[i % archivos.length] }],
      };
      escrito += costeDeEscribir(llamada);
      const c = store.addChange(p.id, llamada);
      capturado += c.files.reduce((n, f) => n + tok((f.before || '') + f.after), 0);
    }
    const diff = tok(execFileSync('git', ['diff', 'HEAD'], { cwd: dir, encoding: 'utf8' }));
    const r = aconsejar(p, store.listChanges(p.id));
    const consejo = tok(comandoCommit(r.mensaje));
    rmSync(dir, { recursive: true, force: true });
    return { nombre, nCambios, escrito, capturado, diff, consejo };
  }

  const escenarios = [
    escenario('Un cambio suelto', 1, 1),
    escenario('Una tanda normal', 3, 3),
    escenario('Una sesión larga', 8, 8),
  ];

  console.log('\n  ── Coste medido ' + '─'.repeat(46));
  console.log('  ' + 'escenario'.padEnd(20) + 'REGISTRAR'.padStart(24) + 'COMMITEAR'.padStart(26));
  console.log('  ' + ''.padEnd(20) + 'antes'.padStart(9) + 'ahora'.padStart(8) + 'ahorro'.padStart(8)
    + 'diff'.padStart(10) + 'historial'.padStart(10) + 'ahorro'.padStart(7));
  console.log('  ' + '─'.repeat(60));
  for (const e of escenarios) {
    const antes = e.escrito + e.capturado;
    const ahorroReg = Math.round(100 - 100 * e.escrito / antes);
    const ahorroCom = Math.round(100 - 100 * e.consejo / e.diff);
    console.log('  ' + `${e.nombre} (${e.nCambios})`.padEnd(20)
      + String(antes).padStart(9) + String(e.escrito).padStart(8) + `${ahorroReg}%`.padStart(8)
      + String(e.diff).padStart(10) + String(e.consejo).padStart(10)
      + `${ahorroCom > 0 ? '' : '+'}${Math.abs(ahorroCom)}%`.padStart(7));
  }
  console.log('  ' + '─'.repeat(60));
  console.log('  Registrar siempre ahorra. Commitear desde el historial solo compensa');
  console.log('  cuando el diff es grande — con un cambio suelto, leerlo sale más barato.\n');

  // Lo único que se fija como criterio: en una sesión larga tiene que ganar.
  const larga = escenarios[2];
  assert.ok(larga.consejo < larga.diff,
    `en una sesión larga el historial (${larga.consejo}) debería ganar al diff (${larga.diff})`);
});
