// =====================================================
// Coding Markov - Stock Markov Chain Analyzer (p5.js)
// =====================================================

let symbolInput, loadBtn, statusText;
let closes = [];
let dates = [];
let returns = [];
let states = [];
let rsiValues = [];
let transitionMatrix = Array(7).fill().map(() => Array(7).fill(0));
let transitionProbs = Array(7).fill().map(() => Array(7).fill(0));
let currentState = 3; // default flat
let nextDayProbs = Array(7).fill(0);
let expectedNextClose = 0;
let meanReturn = 0;
let stdReturn = 0;

const STATE_LABELS = ["-3σ", "-2σ", "-1σ", "Flat", "+1σ", "+2σ", "+3σ"];
const LOOKBACK = 200; // trading days

function setup() {
  createCanvas(1100, 920);
  textFont("monospace");

  // UI
  symbolInput = createInput("SNDK");
  symbolInput.position(20, 20);
  symbolInput.size(120);

  loadBtn = createButton("Load");
  loadBtn.position(150, 20);
  loadBtn.mousePressed(loadStock);

  statusText = createP("Enter a symbol and click Load");
  statusText.position(220, 12);
  statusText.style("color", "#aaa");
  statusText.style("font-family", "monospace");

  loadStock();
}

function draw() {
  background(18, 18, 24);

  // Header
  fill(220);
  textSize(18);
  text("Coding Markov — 7-State Stock Markov Chain", 20, 70);

  if (closes.length === 0) {
    fill(160);
    textSize(14);
    text("Waiting for data...", 20, 120);
    return;
  }

  // ========== PRICE CHART ==========
  drawPriceChart(20, 90, 640, 220);

  // ========== RSI CHART ==========
  drawRSIChart(20, 340, 640, 160);

  // ========== TRANSITION MATRIX ==========
  drawTransitionMatrix(680, 90);

  // ========== NEXT DAY PROBABILITIES ==========
  drawNextDayProbs(680, 340);

  // ========== EXPECTED PRICE ==========
  drawExpectedPrice(680, 560);
}

// -----------------------------------------------------
// DATA LOADING
// -----------------------------------------------------
async function loadStock() {
  const symbol = symbolInput.value().trim().toUpperCase();
  if (!symbol) return;

  statusText.html(`Loading ${symbol}...`);
  statusText.style("color", "#f0c040");

  try {
    // Using corsproxy to avoid CORS issues with Yahoo Finance
    const url = `https://corsproxy.io/?https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=3y`;
    const res = await fetch(url);
    const data = await res.json();

    const result = data.chart.result[0];
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const closeArr = quote.close;

    // Clean data
    closes = [];
    dates = [];
    for (let i = 0; i < closeArr.length; i++) {
      if (closeArr[i] != null) {
        closes.push(closeArr[i]);
        dates.push(new Date(timestamps[i] * 1000));
      }
    }

    // Keep last 252 trading days
    if (closes.length > LOOKBACK) {
      closes = closes.slice(-LOOKBACK);
      dates = dates.slice(-LOOKBACK);
    }

    processData();
    statusText.html(`Loaded ${symbol} • ${closes.length} days`);
    statusText.style("color", "#4caf50");
  } catch (err) {
    console.error(err);
    statusText.html("Error loading data. Try again.");
    statusText.style("color", "#f44336");
  }
}

// -----------------------------------------------------
// PROCESSING
// -----------------------------------------------------
function processData() {
  // Daily returns
  returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }

  // Mean & Std of returns
  meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / returns.length;
  stdReturn = Math.sqrt(variance);

  // Assign states (-3σ ... +3σ)
  states = returns.map(r => {
    const z = (r - meanReturn) / stdReturn;
    if (z <= -2.5) return 0;
    if (z <= -1.5) return 1;
    if (z <= -0.5) return 2;
    if (z < 0.5) return 3;
    if (z < 1.5) return 4;
    if (z < 2.5) return 5;
    return 6;
  });

  // Build transition matrix (counts)
  transitionMatrix = Array(7).fill().map(() => Array(7).fill(0));
  for (let i = 0; i < states.length - 1; i++) {
    transitionMatrix[states[i]][states[i + 1]]++;
  }

  // Convert to probabilities (empirical)
  transitionProbs = transitionMatrix.map(row => {
    const total = row.reduce((a, b) => a + b, 0);
    return total === 0 ? Array(7).fill(0) : row.map(c => c / total);
  });

  // Current state = last observed
  currentState = states[states.length - 1];
  nextDayProbs = transitionProbs[currentState];

  // Expected next return & price
  const expectedReturn = nextDayProbs.reduce((sum, p, i) => {
    // approximate center of each bucket
    const centers = [-3, -2, -1, 0, 1, 2, 3];
    return sum + p * (meanReturn + centers[i] * stdReturn);
  }, 0);

  expectedNextClose = closes[closes.length - 1] * (1 + expectedReturn);

  // RSI
  calculateRSI();
}

// -----------------------------------------------------
// RSI (14) + Adaptive levels
// -----------------------------------------------------
function calculateRSI() {
  const period = 14;
  rsiValues = Array(closes.length).fill(null);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsiValues[period] = 100 - (100 / (1 + avgGain / (avgLoss || 1e-10)));

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsiValues[i] = 100 - (100 / (1 + avgGain / (avgLoss || 1e-10)));
  }
}

// Adaptive overbought / oversold (10th & 90th percentile)
function getAdaptiveRSILevels() {
  const valid = rsiValues.filter(v => v != null);
  if (valid.length < 20) return { oversold: 30, overbought: 70 };

  const sorted = [...valid].sort((a, b) => a - b);
  const p10 = sorted[Math.floor(sorted.length * 0.10)];
  const p90 = sorted[Math.floor(sorted.length * 0.90)];
  return { oversold: p10, overbought: p90 };
}

// -----------------------------------------------------
// DRAWING FUNCTIONS
// -----------------------------------------------------
function drawPriceChart(x, y, w, h) {
  // Background
  fill(28, 28, 36);
  noStroke();
  rect(x, y, w, h, 6);

  fill(200);
  textSize(13);
  text("Closing Price", x + 10, y + 18);

  if (closes.length < 2) return;

  const minP = Math.min(...closes);
  const maxP = Math.max(...closes);
  const range = maxP - minP || 1;

  // Price line
  noFill();
  stroke(0, 180, 255);
  strokeWeight(1.5);
  beginShape();
  for (let i = 0; i < closes.length; i++) {
    const px = map(i, 0, closes.length - 1, x + 10, x + w - 10);
    const py = map(closes[i], minP, maxP, y + h - 20, y + 30);
    vertex(px, py);
  }
  endShape();

  // Today label
  fill(255);
  noStroke();
  textSize(12);
  text(`Today: $${closes[closes.length - 1].toFixed(2)}`, x + 10, y + h - 8);
}

function drawRSIChart(x, y, w, h) {
  fill(28, 28, 36);
  noStroke();
  rect(x, y, w, h, 6);

  fill(200);
  textSize(13);
  text("RSI(14) — Adaptive Levels", x + 10, y + 18);

  const levels = getAdaptiveRSILevels();
  const validRSI = rsiValues.filter(v => v != null);
  if (validRSI.length < 5) return;

  // Overbought / Oversold bands
  const yOB = map(levels.overbought, 0, 100, y + h - 15, y + 30);
  const yOS = map(levels.oversold, 0, 100, y + h - 15, y + 30);

  fill(255, 80, 80, 40);
  rect(x + 10, y + 30, w - 20, yOB - (y + 30));
  fill(80, 255, 120, 40);
  rect(x + 10, yOS, w - 20, (y + h - 15) - yOS);

  // RSI line
  noFill();
  stroke(255, 180, 50);
  strokeWeight(1.5);
  beginShape();
  for (let i = 0; i < rsiValues.length; i++) {
    if (rsiValues[i] == null) continue;
    const px = map(i, 0, closes.length - 1, x + 10, x + w - 10);
    const py = map(rsiValues[i], 0, 100, y + h - 15, y + 30);
    vertex(px, py);
  }
  endShape();

  // Labels
  fill(200);
  noStroke();
  textSize(11);
  text(`OB ${levels.overbought.toFixed(0)}`, x + w - 70, yOB - 4);
  text(`OS ${levels.oversold.toFixed(0)}`, x + w - 70, yOS + 12);

  // Simple divergence markers (last 30 bars)
  detectAndDrawDivergence(x, y, w, h);
}

function detectAndDrawDivergence(x, y, w, h) {
  // Very simplified divergence detection on last 40 bars
  const look = 40;
  const start = Math.max(14, closes.length - look);

  // Find recent swing lows/highs (crude)
  let lastPriceLow = null;
  let lastRSILow = null;
  let lastPriceHigh = null;
  let lastRSIHigh = null;

  for (let i = start; i < closes.length - 2; i++) {
    // local low
    if (closes[i] < closes[i - 1] && closes[i] < closes[i + 1]) {
      if (lastPriceLow !== null && closes[i] < lastPriceLow && rsiValues[i] > lastRSILow) {
        // Bullish divergence
        const px = map(i, 0, closes.length - 1, x + 10, x + w - 10);
        fill(0, 255, 120);
        noStroke();
        textSize(11);
        text("Bull Div", px - 20, y + h - 25);
      }
      lastPriceLow = closes[i];
      lastRSILow = rsiValues[i];
    }
    // local high
    if (closes[i] > closes[i - 1] && closes[i] > closes[i + 1]) {
      if (lastPriceHigh !== null && closes[i] > lastPriceHigh && rsiValues[i] < lastRSIHigh) {
        // Bearish divergence
        const px = map(i, 0, closes.length - 1, x + 10, x + w - 10);
        fill(255, 80, 80);
        noStroke();
        textSize(11);
        text("Bear Div", px - 20, y + 45);
      }
      lastPriceHigh = closes[i];
      lastRSIHigh = rsiValues[i];
    }
  }
}

function drawTransitionMatrix(x, y) {
  fill(28, 28, 36);
  noStroke();
  rect(x, y, 390, 230, 6);

  fill(200);
  textSize(13);
  text("Transition Matrix (empirical)", x + 10, y + 20);

  textSize(11);
  // Header
  for (let j = 0; j < 7; j++) {
    fill(180);
    text(STATE_LABELS[j], x + 55 + j * 46, y + 42);
  }

  for (let i = 0; i < 7; i++) {
    fill(180);
    text(STATE_LABELS[i], x + 10, y + 62 + i * 22);

    for (let j = 0; j < 7; j++) {
      const p = transitionProbs[i][j];
      const bright = map(p, 0, 0.5, 40, 220);
      fill(bright, bright * 0.8, 40);
      text(p.toFixed(2), x + 55 + j * 46, y + 62 + i * 22);
    }
  }
}

function drawNextDayProbs(x, y) {
  fill(28, 28, 36);
  noStroke();
  rect(x, y, 390, 200, 6);

  fill(200);
  textSize(13);
  text(`Next-Day Probabilities  (from ${STATE_LABELS[currentState]})`, x + 10, y + 20);

  const maxP = Math.max(...nextDayProbs, 0.01);

  for (let i = 0; i < 7; i++) {
    const barW = map(nextDayProbs[i], 0, maxP, 0, 220);
    fill(i < 3 ? color(255, 90, 90) : i > 3 ? color(80, 220, 120) : color(180));
    rect(x + 90, y + 40 + i * 22, barW, 16, 3);

    fill(220);
    textSize(12);
    text(STATE_LABELS[i], x + 12, y + 52 + i * 22);
    text((nextDayProbs[i] * 100).toFixed(1) + "%", x + 320, y + 52 + i * 22);
  }
}

function drawExpectedPrice(x, y) {
  fill(28, 28, 36);
  noStroke();
  rect(x, y, 390, 100, 6);

  fill(200);
  textSize(13);
  text("Probability-Weighted Estimate", x + 10, y + 22);

  const today = closes[closes.length - 1];
  const change = expectedNextClose - today;
  const pct = (change / today) * 100;

  textSize(16);
  fill(220);
  text(`Today:   $${today.toFixed(2)}`, x + 15, y + 55);

  fill(change >= 0 ? color(80, 220, 120) : color(255, 90, 90));
  text(`Tomorrow est: $${expectedNextClose.toFixed(2)}  (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`, x + 15, y + 80);
}