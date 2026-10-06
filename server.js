const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
const PUBLIC = path.join(__dirname, 'public');

// ============================================
// CLAVE DE API PARA EL ENDPOINT DE CONTROL
// ============================================
// CAMBIA ESTE VALOR por algo propio antes de publicar el
// servidor. Sin esto, cualquiera en internet podría enviar
// comandos al robot. La app debe mandar este mismo valor
// en el header 'X-API-Key' de cada POST a /api/control.
//
// Mejor aún: define la variable de entorno API_KEY en vez
// de dejar el valor escrito aquí (ver nota más abajo).
const API_KEY = process.env.API_KEY || '366f82280d7b1ef411bc10b61e8d24d229d52f040758acca';

// ============================================
// ÚLTIMO ESTADO RECIBIDO DE LA APP
// Se guarda en memoria para que el dashboard
// pueda consultarlo vía GET /api/estado.
// ============================================

let ultimoEstado = {
    en_movimiento: false,
    aceleracion: 0,
    direccion: 0,
    temperatura: null,
    humedad: null,
    presion: null,
    altura: null,
    distancia: null,
    co2: null,
    timestamp: null,
    recibido: false
};

// ============================================
// DETECTAR IP LOCAL (IPv4) AUTOMÁTICAMENTE
// ============================================

function obtenerIPRedPrincipal() {

    const interfaces = os.networkInterfaces();

    // Palabras clave típicas de adaptadores virtuales a ignorar
    const patronesVirtuales = [
        /^vEthernet/i,
        /^WSL/i,
        /^Loopback/i,
        /^docker/i,
        /^veth/i,
        /^VirtualBox/i,
        /^VMware/i,
        /^Hyper-V/i,
        /^Bluetooth/i
    ];

    // Palabras clave que sí queremos priorizar
    const patronesPrioritarios = [
        /wi-?fi/i,
        /wlan/i,
        /hotspot/i,
        /local area connection/i,
        /ethernet/i
    ];

    const candidatas = [];

    for (const nombre of Object.keys(interfaces)) {

        // Descartar adaptadores virtuales por nombre
        if (patronesVirtuales.some(p => p.test(nombre))) {
            continue;
        }

        for (const info of interfaces[nombre]) {

            if (info.family === 'IPv4' && !info.internal) {

                candidatas.push({
                    interfaz: nombre,
                    direccion: info.address,
                    prioritaria: patronesPrioritarios.some(p => p.test(nombre))
                });
            }
        }
    }

    // Priorizar Wi-Fi/Hotspot/Ethernet real sobre cualquier otra cosa que haya quedado
    candidatas.sort((a, b) => (b.prioritaria ? 1 : 0) - (a.prioritaria ? 1 : 0));

    return candidatas;
}

const server = http.createServer((req, res) => {

    console.log('Petición:', req.url);

    // ============================================
    // CORS: permitir que la app Flutter (u otro
    // origen) consuma este servidor sin bloqueos.
    // ============================================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // El navegador (o algunos clientes HTTP) envían un preflight
    // OPTIONS antes del POST real. Se responde vacío y sin cuerpo.
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    let archivo;

    // Quitar parámetros de consulta (?algo=valor) y el fragmento (#)
    // antes de resolver la ruta del archivo, para evitar 404 innecesarios.
    const rutaLimpia = req.url.split('?')[0].split('#')[0];

    // ============================================
    // ENDPOINT: recibir datos de control de la app
    // ============================================
    if (req.method === 'POST' && rutaLimpia === '/api/control') {

        // ------------------------------------------------
        // VALIDAR CLAVE DE API
        // ------------------------------------------------
        const claveRecibida = req.headers['x-api-key'];

        if (claveRecibida !== API_KEY) {

            console.log('Intento de acceso sin clave válida a /api/control');

            res.writeHead(401, {
                'Content-Type': 'application/json; charset=utf-8'
            });

            res.end(JSON.stringify({
                ok: false,
                error: 'No autorizado'
            }));

            return;
        }

        let cuerpo = '';

        req.on('data', chunk => {

            cuerpo += chunk;

            // Protección básica contra payloads gigantes/maliciosos
            if (cuerpo.length > 1e6) {
                req.destroy();
            }
        });

        req.on('end', () => {

            let datos;

            try {
                datos = JSON.parse(cuerpo);
            } catch (error) {

                console.log('JSON inválido recibido:', cuerpo);

                res.writeHead(400, {
                    'Content-Type': 'application/json; charset=utf-8'
                });

                res.end(JSON.stringify({
                    ok: false,
                    error: 'JSON inválido'
                }));

                return;
            }

            console.log('Datos de control recibidos:', datos);

            // Guardamos el último estado para que el dashboard
            // pueda consultarlo vía GET /api/estado. Los campos de
            // sensores son opcionales: si no vienen, se conserva
            // el último valor conocido en vez de borrarlo con null.
            ultimoEstado = {
                en_movimiento: Boolean(datos.en_movimiento),
                aceleracion: datos.aceleracion !== undefined
                    ? Number(datos.aceleracion)
                    : ultimoEstado.aceleracion,
                direccion: datos.direccion !== undefined
                    ? Number(datos.direccion)
                    : ultimoEstado.direccion,
                temperatura: datos.temperatura !== undefined
                    ? Number(datos.temperatura)
                    : ultimoEstado.temperatura,
                humedad: datos.humedad !== undefined
                    ? Number(datos.humedad)
                    : ultimoEstado.humedad,
                presion: datos.presion !== undefined
                    ? Number(datos.presion)
                    : ultimoEstado.presion,
                altura: datos.altura !== undefined
                    ? Number(datos.altura)
                    : ultimoEstado.altura,
                distancia: datos.distancia !== undefined
                    ? Number(datos.distancia)
                    : ultimoEstado.distancia,
                co2: datos.co2 !== undefined
                    ? Number(datos.co2)
                    : ultimoEstado.co2,
                timestamp: new Date().toISOString(),
                recibido: true
            };

            // Aquí es donde procesarías/reenviarías los datos
            // (por ejemplo, hacia el ESP32 vía WebSocket con 'ws').

            res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8'
            });

            res.end(JSON.stringify({
                ok: true,
                mensaje: 'Datos recibidos correctamente'
            }));
        });

        req.on('error', error => {

            console.log('Error leyendo el cuerpo de la petición:', error);

            res.writeHead(500, {
                'Content-Type': 'application/json; charset=utf-8'
            });

            res.end(JSON.stringify({
                ok: false,
                error: 'Error interno del servidor'
            }));
        });

        return;
    }

    // ============================================
    // ENDPOINT: consultar el último estado recibido
    // (usado por el dashboard para mostrarlo en pantalla)
    // ============================================
    if (req.method === 'GET' && rutaLimpia === '/api/estado') {

        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8'
        });

        res.end(JSON.stringify(ultimoEstado));

        return;
    }

    if (rutaLimpia === '/' || rutaLimpia === '') {
        archivo = path.join(PUBLIC, 'index.html');
    } else {
        archivo = path.join(PUBLIC, decodeURIComponent(rutaLimpia));
    }

    // Evitar rutas inválidas
    if (!archivo.startsWith(PUBLIC)) {
        res.writeHead(403);
        res.end('Acceso denegado');
        return;
    }

    fs.readFile(archivo, (error, contenido) => {

        if (error) {
            console.log('Archivo no encontrado:', archivo);

            res.writeHead(404, {
                'Content-Type': 'text/plain; charset=utf-8'
            });

            res.end('Archivo no encontrado');

            return;
        }

        const extension = path.extname(archivo).toLowerCase();

        const tipos = {
            '.html': 'text/html; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.js': 'application/javascript; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };

        const tipo = tipos[extension] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': tipo
        });

        res.end(contenido);
    });
});

// Escuchar en todas las interfaces de red (0.0.0.0) para que sea
// accesible desde otros dispositivos en la misma red / hotspot.
server.listen(PORT, '0.0.0.0', () => {

    const ipsLocales = obtenerIPRedPrincipal();

    console.log('');
    console.log('========================================');
    console.log('           ESP32 DASHBOARD');
    console.log('========================================');
    console.log('');
    console.log('Servidor iniciado correctamente');
    console.log('');

    if (ipsLocales.length > 0) {

        console.log('Accesible desde la red (celular, etc.):');

        ipsLocales.forEach(({ interfaz, direccion }) => {
            console.log(`  http://${direccion}:${PORT}   (${interfaz})`);
        });

    } else {

        console.log('No se detectó ninguna interfaz de red IPv4 externa.');
        console.log('Conéctate a una red Wi-Fi o activa el hotspot.');
    }

    console.log('');
    console.log('========================================');
});