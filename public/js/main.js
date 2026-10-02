// ============================================
// CONFIGURACIÓN
// ============================================

let currentPeriod = "day";


// ============================================
// REFERENCIAS
// ============================================

const themeButton =
    document.getElementById("theme-button");

const periodButtons =
    document.querySelectorAll(".period-button");

const expandButtons =
    document.querySelectorAll(".expand-button");

const estadoRobotIndicator =
    document.getElementById("estado-robot-indicator");

const estadoRobotTexto =
    document.getElementById("estado-robot-texto");

const estadoRobotTimestamp =
    document.getElementById("estado-robot-timestamp");

const estadoRobotNumero =
    document.getElementById("estado-robot-numero");

const estadoAvanceFlecha =
    document.getElementById("estado-avance-flecha");

const estadoAvanceTexto =
    document.getElementById("estado-avance-texto");

const estadoGiroFlecha =
    document.getElementById("estado-giro-flecha");

const estadoGiroTexto =
    document.getElementById("estado-giro-texto");


// ============================================
// GRÁFICAS EN VIVO (CHART.JS)
// ============================================

const MAX_PUNTOS = 20;

function crearHistorial() {
    return {
        etiquetas: [],
        valores: []
    };
}

const historial = {
    temperatura: crearHistorial(),
    humedad: crearHistorial(),
    altura: crearHistorial(),
    distancia: crearHistorial()
};

function agregarPunto(historial, etiqueta, valor) {

    historial.etiquetas.push(etiqueta);
    historial.valores.push(valor);

    if (historial.etiquetas.length > MAX_PUNTOS) {
        historial.etiquetas.shift();
        historial.valores.shift();
    }
}

function crearConfigChart(color, unidad) {
    return {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: color,
                backgroundColor: color + '22',
                borderWidth: 2,
                pointRadius: 2,
                pointHoverRadius: 4,
                pointBackgroundColor: color,
                pointBorderColor: color,
                tension: 0.35,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ctx.parsed.y + ' ' + unidad
                    }
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    grid: { color: 'rgba(150,150,150,0.15)' },
                    ticks: { color: '#9aa0a8' }
                }
            }
        }
    };
}

const canvasTemperatura = document.getElementById("temperatureChart");
const canvasHumedad = document.getElementById("humidityChart");
const canvasAltura = document.getElementById("altitudeChart");
const canvasDistancia = document.getElementById("distanceChart");

const chartTemperatura = canvasTemperatura
    ? new Chart(canvasTemperatura, crearConfigChart('#5b7cfa', '°C'))
    : null;

const chartHumedad = canvasHumedad
    ? new Chart(canvasHumedad, crearConfigChart('#39b96b', '%'))
    : null;

const chartAltura = canvasAltura
    ? new Chart(canvasAltura, crearConfigChart('#e0a13e', 'm'))
    : null;

const chartDistancia = canvasDistancia
    ? new Chart(canvasDistancia, crearConfigChart('#e0578c', 'cm'))
    : null;

function actualizarChart(chart, historial, etiqueta, valor) {

    if (!chart) return;

    agregarPunto(historial, etiqueta, valor);

    chart.data.labels = historial.etiquetas;
    chart.data.datasets[0].data = historial.valores;

    chart.update('none');
}


// ============================================
// ESTADO DEL ROBOT (DATOS DE LA APP)
// ============================================

async function actualizarEstadoRobot() {

    try {

        const respuesta = await fetch('/api/estado');

        if (!respuesta.ok) {
            throw new Error('Respuesta no válida del servidor');
        }

        const estado = await respuesta.json();

        if (!estado.recibido) {

            // Todavía no ha llegado ningún dato de la app,
            // pero el servidor sí responde con normalidad.
            estadoRobotNumero.textContent = 0;
            estadoRobotTexto.textContent = "Esperando datos de la app...";
            estadoRobotIndicator.style.backgroundColor = "#9aa0a8";
            estadoRobotTimestamp.textContent = "Sin datos recibidos todavía";

            actualizarIndicadorAvance(0);
            actualizarIndicadorGiro(0);

            return;
        }

        // Valor numérico: 1 = en movimiento, 0 = detenido.
        const numero = estado.en_movimiento ? 1 : 0;

        estadoRobotNumero.textContent = numero;

        if (estado.en_movimiento) {

            estadoRobotTexto.textContent = "En movimiento";
            estadoRobotIndicator.style.backgroundColor = "#39b96b";

        } else {

            estadoRobotTexto.textContent = "Detenido";
            estadoRobotIndicator.style.backgroundColor = "#e45757";
        }

        actualizarIndicadorAvance(estado.aceleracion || 0);
        actualizarIndicadorGiro(estado.direccion || 0);

        const fecha = new Date(estado.timestamp);

        const etiquetaHora = fecha.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        actualizarChart(
            chartTemperatura,
            historial.temperatura,
            etiquetaHora,
            estado.temperatura ?? 0
        );

        actualizarChart(
            chartHumedad,
            historial.humedad,
            etiquetaHora,
            estado.humedad ?? 0
        );

        actualizarChart(
            chartAltura,
            historial.altura,
            etiquetaHora,
            estado.altura ?? 0
        );

        actualizarChart(
            chartDistancia,
            historial.distancia,
            etiquetaHora,
            estado.distancia ?? 0
        );

        estadoRobotTimestamp.textContent =
            "Última actualización: " + fecha.toLocaleTimeString();

    } catch (error) {

        // No se pudo contactar al servidor (caído, sin red, etc.).
        // Se muestra -1 como valor predeterminado y diferenciable
        // de 0 (detenido) y 1 (en movimiento).
        estadoRobotNumero.textContent = -1;

        estadoRobotTexto.textContent = "Sin conexión con el servidor";
        estadoRobotIndicator.style.backgroundColor = "#9aa0a8";
        estadoRobotTimestamp.textContent = "Mostrando valor predeterminado (-1)";

        actualizarIndicadorAvance(0);
        actualizarIndicadorGiro(0);

        console.log('Error consultando /api/estado:', error);
    }
}


// ============================================
// INDICADOR DE AVANCE (ADELANTE / ATRÁS)
// ============================================

function actualizarIndicadorAvance(aceleracion) {

    const UMBRAL = 0.05;

    if (aceleracion > UMBRAL) {

        estadoAvanceFlecha.textContent = "▲";
        estadoAvanceTexto.textContent =
            "Adelante (" + aceleracion.toFixed(2) + ")";

    } else if (aceleracion < -UMBRAL) {

        estadoAvanceFlecha.textContent = "▼";
        estadoAvanceTexto.textContent =
            "Atrás (" + aceleracion.toFixed(2) + ")";

    } else {

        estadoAvanceFlecha.textContent = "■";
        estadoAvanceTexto.textContent = "Detenido";
    }
}


// ============================================
// INDICADOR DE GIRO (IZQUIERDA / DERECHA)
// ============================================

function actualizarIndicadorGiro(direccion) {

    const UMBRAL = 0.05;

    if (direccion > UMBRAL) {

        estadoGiroFlecha.textContent = "►";
        estadoGiroTexto.textContent =
            "Derecha (" + direccion.toFixed(2) + ")";

    } else if (direccion < -UMBRAL) {

        estadoGiroFlecha.textContent = "◄";
        estadoGiroTexto.textContent =
            "Izquierda (" + direccion.toFixed(2) + ")";

    } else {

        estadoGiroFlecha.textContent = "•";
        estadoGiroTexto.textContent = "Centro";
    }
}


// Primera consulta inmediata, y luego cada 3 segundos.
actualizarEstadoRobot();

setInterval(actualizarEstadoRobot, 3000);


// ============================================
// TEMA
// ============================================

function setTheme(theme) {

    if (theme === "dark") {

        document.body.classList.add(
            "dark-theme"
        );

        themeButton.textContent = "☀️";

        localStorage.setItem(
            "theme",
            "dark"
        );

    } else {

        document.body.classList.remove(
            "dark-theme"
        );

        themeButton.textContent = "🌙";

        localStorage.setItem(
            "theme",
            "light"
        );
    }
}


// ============================================
// DETECTAR TEMA DEL SISTEMA
// ============================================

function detectSystemTheme() {

    const darkMode =
        window.matchMedia(
            "(prefers-color-scheme: dark)"
        ).matches;

    setTheme(
        darkMode
            ? "dark"
            : "light"
    );
}


// ============================================
// CARGAR TEMA
// ============================================

const savedTheme =
    localStorage.getItem("theme");


if (savedTheme) {

    setTheme(savedTheme);

} else {

    detectSystemTheme();
}


// ============================================
// CAMBIAR TEMA
// ============================================

themeButton.addEventListener(
    "click",
    () => {

        const isDark =
            document.body.classList.contains(
                "dark-theme"
            );

        setTheme(
            isDark
                ? "light"
                : "dark"
        );
    }
);


// ============================================
// PERÍODOS
// ============================================

periodButtons.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            periodButtons.forEach(
                otherButton => {

                    otherButton.classList.remove(
                        "active"
                    );

                }
            );


            button.classList.add(
                "active"
            );


            currentPeriod =
                button.dataset.period;


            changeChartPeriod(
                currentPeriod
            );

        }
    );

});


// ============================================
// CAMBIAR PERÍODO
// ============================================

function changeChartPeriod(period) {

    console.log(
        "Período seleccionado:",
        period
    );


    /*
     * Más adelante:
     *
     * /api/data?period=day
     * /api/data?period=week
     * /api/data?period=month
     * /api/data?period=year
     *
     * El servidor devolverá los datos
     * históricos del ESP32.
     */
}


// ============================================
// AMPLIAR GRÁFICA
// ============================================

expandButtons.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            const chartContainer =
                button.closest(
                    ".chart-container"
                );


            chartContainer.classList.toggle(
                "expanded"
            );


            document.body.classList.toggle(
                "chart-expanded"
            );


            const expanded =
                chartContainer.classList.contains(
                    "expanded"
                );


            if (expanded) {

                button.textContent = "×";

                button.title =
                    "Cerrar gráfica";

            } else {

                button.textContent = "⛶";

                button.title =
                    "Ampliar gráfica";
            }
        }
    );

});


// ============================================
// CERRAR CON ESC
// ============================================

document.addEventListener(
    "keydown",
    event => {

        if (event.key !== "Escape") {
            return;
        }


        const expandedChart =
            document.querySelector(
                ".chart-container.expanded"
            );


        if (!expandedChart) {
            return;
        }


        expandedChart.classList.remove(
            "expanded"
        );


        document.body.classList.remove(
            "chart-expanded"
        );


        const button =
            expandedChart.querySelector(
                ".expand-button"
            );


        button.textContent = "⛶";

        button.title =
            "Ampliar gráfica";
    }
);


// ============================================
// CONEXIÓN ESP32
// ============================================

/*
 * La simulación fue eliminada.
 *
 * Aquí posteriormente tendremos:
 *
 * const socket = new WebSocket(
 *     "ws://localhost:3000"
 * );
 *
 * Los datos reales del ESP32
 * actualizarán las gráficas.
 */


console.log(
    "ESP32 Dashboard iniciado."
);