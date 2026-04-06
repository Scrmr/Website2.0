// probability.js

const ORDER4 = 4;
const MODELS = ['freq', 'order1', 'order4', 'ensemble'];

let userInputHistory = [];
let guessHistory     = [];
let freqCounts       = { a: 0, d: 0 };
let order1Table      = {};  // { 'a': {a,d}, 'd': {a,d} }
let order4Table      = {};  // { 'adda': {a,d}, ... }
let pending          = { freq: null, order1: null, order4: null, ensemble: null };
let correct          = { freq: 0, order1: 0, order4: 0, ensemble: 0 };
let attempts         = { freq: 0, order1: 0, order4: 0, ensemble: 0 };
let accuracyHistory  = { freq: [], order1: [], order4: [], ensemble: [] };

// Each model's chart type survives reset — user preference
const activeChart = { freq: 'accuracy', order1: 'accuracy', order4: 'accuracy', ensemble: 'accuracy' };
let showPredictions = false;

document.addEventListener('DOMContentLoaded', () => {

    // ------------------------------------------------------------------ //
    // Recording — called after pushing the new input to userInputHistory  //
    // ------------------------------------------------------------------ //

    function recordAll(history) {
        const curr = history[history.length - 1];

        freqCounts[curr]++;

        if (history.length >= 2) {
            const prev = history[history.length - 2];
            if (!order1Table[prev]) order1Table[prev] = { a: 0, d: 0 };
            order1Table[prev][curr]++;
        }

        if (history.length >= ORDER4 + 1) {
            const state = history.slice(-(ORDER4 + 1), -1).join('');
            if (!order4Table[state]) order4Table[state] = { a: 0, d: 0 };
            order4Table[state][curr]++;
        }
    }

    // ------------------------------------------------------------------ //
    // Estimation — returns {p, weight} or null                            //
    //   p      = P(next='a'), weight = |countA - countD|                 //
    //   null   = no data at all for this context                         //
    // ------------------------------------------------------------------ //

    function estimateFreq() {
        const total = freqCounts.a + freqCounts.d;
        if (total === 0) return null;
        return { p: freqCounts.a / total, weight: Math.abs(freqCounts.a - freqCounts.d) };
    }

    function estimateOrder1(history) {
        if (history.length === 0) return null;
        const counts = order1Table[history[history.length - 1]];
        if (!counts) return null;
        const total = counts.a + counts.d;
        if (total === 0) return null;
        return { p: counts.a / total, weight: Math.abs(counts.a - counts.d) };
    }

    function estimateOrder4(history) {
        if (history.length < ORDER4) return null;
        const counts = order4Table[history.slice(-ORDER4).join('')];
        if (!counts) return null;
        const total = counts.a + counts.d;
        if (total === 0) return null;
        return { p: counts.a / total, weight: Math.abs(counts.a - counts.d) };
    }

    // ------------------------------------------------------------------ //
    // Prediction — argmax on each model's estimate                        //
    // ------------------------------------------------------------------ //

    function predictFreq() {
        const est = estimateFreq();
        return est ? (est.p >= 0.5 ? 'a' : 'd') : null;
    }

    function predictOrder1(history) {
        const est = estimateOrder1(history);
        return est ? (est.p >= 0.5 ? 'a' : 'd') : null;
    }

    function predictOrder4(history) {
        const est = estimateOrder4(history);
        if (est) return est.p >= 0.5 ? 'a' : 'd';
        return predictFreq(); // unseen state — fall back to global frequency
    }

    function predictEnsemble(history) {
        const ests = [estimateFreq(), estimateOrder1(history), estimateOrder4(history)]
            .filter(e => e !== null && e.weight > 0);
        if (ests.length === 0) return predictFreq();
        const totalW    = ests.reduce((s, e) => s + e.weight, 0);
        const weightedP = ests.reduce((s, e) => s + e.weight * e.p, 0);
        return (weightedP / totalW) >= 0.5 ? 'a' : 'd';
    }

    // ------------------------------------------------------------------ //
    // Accuracy line chart (SVG, drawn inline)                             //
    //                                                                     //
    // Line is blue when the player is winning (AI accuracy <= 50%)       //
    // and red when the AI is winning (accuracy > 50%).                   //
    // ------------------------------------------------------------------ //

    function drawAccuracyChart(model) {
        const container = document.getElementById(model + 'Chart');
        if (!container) return;

        const data = accuracyHistory[model];
        const W    = Math.max(container.offsetWidth, 120);
        const H    = 110;
        const pad  = { top: 12, right: 10, bottom: 10, left: 26 };
        const iW   = W - pad.left - pad.right;
        const iH   = H - pad.top  - pad.bottom;

        if (data.length === 0) {
            container.innerHTML = `<div style="height:${H}px;display:flex;align-items:center;justify-content:center;color:#2a2a2a;font-size:0.78rem;">no data yet</div>`;
            return;
        }

        const toX = i   => pad.left + (data.length === 1 ? iW / 2 : (i / (data.length - 1)) * iW);
        const toY = acc => pad.top  + (1 - acc / 100) * iH;

        const lastAcc   = data[data.length - 1];
        const lineColor = lastAcc > 50 ? '#e05555' : '#4a9eff';
        const y50       = toY(50);
        const points    = data.map((a, i) => `${toX(i).toFixed(1)},${toY(a).toFixed(1)}`).join(' ');
        const lastX     = toX(data.length - 1);
        const lastY     = toY(lastAcc);

        const axisLabels = [0, 50, 100].map(v =>
            `<text x="${pad.left - 4}" y="${(toY(v) + 4).toFixed(1)}" fill="#383838" font-size="9" text-anchor="end">${v}</text>`
        ).join('');

        // Current accuracy label near the last point
        const labelX = Math.min(lastX + 5, W - pad.right - 16);
        const labelY = Math.max(lastY - 4, pad.top + 8);

        container.innerHTML = `
            <svg width="${W}" height="${H}" style="display:block">
                ${axisLabels}
                <line x1="${pad.left}" y1="${y50.toFixed(1)}"
                      x2="${(W - pad.right).toFixed(1)}" y2="${y50.toFixed(1)}"
                      stroke="#2a2a2a" stroke-width="1" stroke-dasharray="4,3"/>
                ${data.length > 1
                    ? `<polyline points="${points}" fill="none" stroke="${lineColor}"
                           stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`
                    : ''}
                <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${lineColor}"/>
                <text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}"
                      fill="${lineColor}" font-size="9">${lastAcc}%</text>
            </svg>`;
    }

    // ------------------------------------------------------------------ //
    // Hit/miss stream                                                      //
    //                                                                     //
    // Each block shows the predicted letter.                              //
    // Green  = prediction was correct.                                    //
    // Red    = prediction was wrong.                                      //
    // Hover tooltip shows "predicted X, actual Y".                       //
    // ------------------------------------------------------------------ //

    function drawHitMissStream(model) {
        const container = document.getElementById(model + 'Chart');
        if (!container) return;

        const relevant = guessHistory.filter(e => e[model] !== null);
        if (relevant.length === 0) {
            container.innerHTML = `<div style="min-height:60px;display:flex;align-items:center;justify-content:center;color:#2a2a2a;font-size:0.78rem;">no data yet</div>`;
            return;
        }

        const blocks = relevant.map(e => {
            const hit = e[model] === e.user;
            const cls = hit ? 'hm-hit' : 'hm-miss';
            return `<span class="hm-block ${cls}" title="predicted: ${e[model]}, actual: ${e.user}">${e[model].toUpperCase()}</span>`;
        }).join('');

        container.innerHTML = `<div class="hm-stream">${blocks}</div>`;
    }

    function updateChart(model) {
        if (activeChart[model] === 'accuracy') drawAccuracyChart(model);
        else drawHitMissStream(model);
    }

    function updateAllCharts() {
        MODELS.forEach(updateChart);
    }

    // ------------------------------------------------------------------ //
    // Chart toggle buttons                                                 //
    // ------------------------------------------------------------------ //

    document.querySelectorAll('.chart-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const model = this.dataset.model;
            activeChart[model] = this.dataset.chart;
            document.querySelectorAll(`.chart-btn[data-model="${model}"]`).forEach(b => {
                b.classList.toggle('chart-btn-active', b === this);
            });
            updateChart(model);
        });
    });

    // ------------------------------------------------------------------ //
    // Predictions toggle                                                   //
    // ------------------------------------------------------------------ //

    document.getElementById('togglePredictions').addEventListener('click', function () {
        showPredictions = !showPredictions;
        document.querySelectorAll('.next-guess-row').forEach(el => {
            el.style.display = showPredictions ? 'block' : 'none';
        });
        this.textContent = showPredictions ? 'Hide predictions' : 'Show predictions';
    });

    // ------------------------------------------------------------------ //
    // Reset                                                                //
    // ------------------------------------------------------------------ //

    document.getElementById('resetButton').addEventListener('click', function () {
        userInputHistory = [];
        guessHistory     = [];
        freqCounts       = { a: 0, d: 0 };
        order1Table      = {};
        order4Table      = {};
        pending          = { freq: null, order1: null, order4: null, ensemble: null };
        correct          = { freq: 0, order1: 0, order4: 0, ensemble: 0 };
        attempts         = { freq: 0, order1: 0, order4: 0, ensemble: 0 };
        accuracyHistory  = { freq: [], order1: [], order4: [], ensemble: [] };

        document.getElementById('buttonPressCount').textContent = '0';
        MODELS.forEach(model => {
            document.getElementById(model + 'Accuracy').textContent = '0%';
            document.getElementById(model + 'Guess').textContent    = '—';
        });
        updateAllCharts();
    });

    // ------------------------------------------------------------------ //
    // Main input handler                                                   //
    // ------------------------------------------------------------------ //

    function handleUserInput(input) {

        // Step 1: Score the predictions that were made before this press.
        // Each model is only scored when it actually made a (non-null) prediction.
        if (userInputHistory.length > 0) {
            MODELS.forEach(model => {
                if (pending[model] !== null) {
                    attempts[model]++;
                    if (pending[model] === input) correct[model]++;
                    const acc = Math.round((correct[model] / attempts[model]) * 100);
                    document.getElementById(model + 'Accuracy').textContent = acc + '%';
                    accuracyHistory[model].push(acc);
                }
            });

            guessHistory.push({
                freq:     pending.freq,
                order1:   pending.order1,
                order4:   pending.order4,
                ensemble: pending.ensemble,
                user:     input
            });

            updateAllCharts();
        }

        // Step 2: Record the new input into all model tables.
        userInputHistory.push(input);
        document.getElementById('buttonPressCount').textContent = userInputHistory.length.toString();
        recordAll(userInputHistory);

        // Step 3: Make new predictions for the next press.
        pending.freq     = predictFreq();
        pending.order1   = predictOrder1(userInputHistory);
        pending.order4   = predictOrder4(userInputHistory);
        pending.ensemble = predictEnsemble(userInputHistory);

        // Step 4: Display the predictions (row is hidden by default).
        MODELS.forEach(model => {
            document.getElementById(model + 'Guess').textContent = pending[model] ?? '—';
        });
    }

    // ------------------------------------------------------------------ //
    // Event listeners                                                      //
    // ------------------------------------------------------------------ //

    document.getElementById('buttonA').addEventListener('click', () => handleUserInput('a'));
    document.getElementById('buttonD').addEventListener('click', () => handleUserInput('d'));

    document.addEventListener('keypress', event => {
        if (event.key === 'a' || event.key === 'A')      handleUserInput('a');
        else if (event.key === 'd' || event.key === 'D') handleUserInput('d');
    });

    // Initialise all chart areas on load to show the empty state
    updateAllCharts();
});
