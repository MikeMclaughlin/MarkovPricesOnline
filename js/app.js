let closes = [];
let markov;
let tomorrowProbs = [];
let returns = [];
let rsiValues = [];
let estimatedTomorrow = 0;

let symbolInput;
let loadButton;
let currentSymbol = 'SNDK';

// Divergence results
let bullishDivergence = false;
let bearishDivergence = false;
let divInfo = '';

const LOOKBACK = 252;
const RSI_PERIOD = 14;
const DIV_LOOKBACK = 40;
const PIVOT_WINDOW = 5;

function setup() {
  createCanvas(1100, 1000);
  textFont('monospace');
  
  symbolInput = createInput(currentSymbol);
  symbolInput.position(40, 20);
  symbolInput.size(120);
  
  loadButton = createButton('Load');
  loadButton.position(175, 20);
  loadButton.mousePressed(loadNewSymbol);
  
  loadNewSymbol();
}

async function loadNewSymbol() {
  currentSymbol = symbolInput.value().trim().toUpperCase() || 'SNDK';
  
  closes = [];
  returns = [];
  rsiValues = [];
  tomorrowProbs = [];
  estimatedTomorrow = 0;
  markov = null;
  bullishDivergence = false;
  bearishDivergence = false;
  divInfo = '';
  
  background(18);
  fill(200);
  textSize(16);
  text(`Loading ${currentSymbol}...`, 40, 100);
  
  closes = await loadStockCloses(currentSymbol, LOOKBACK);
  
  if (closes.length < 50) {
    background(18);
    fill(255, 80, 80);
    textSize(16);
    text(`Failed to load enough data for ${currentSymbol}`, 40, 100);
    return;
  }
  
  returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  
  rsiValues = calculateRSI(closes, RSI_PERIOD);
  
  detectRSIDivergence();
  
  markov = new MarkovTree(closes);
  tomorrowProbs = markov.predictTomorrow();
  
  estimatedTomorrow = 0;
  for (let p of tomorrowProbs) {
    estimatedTomorrow += p.prob * p.estimatedPrice;
  }
  
  redraw();
}

async function loadStockCloses(symbol, lookback) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=2y&interval=1d`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const json = await response.json();
    const result = json.chart.result[0];
    const rawCloses = result.indicators.quote[0].close;
    
    let prices = rawCloses.filter(c => c != null);
    if (prices.length > lookback) prices = prices.slice(-lookback);
    console.log(`Loaded ${prices.length} closes for ${symbol}`);
    return prices;
  } catch (err) {
    console.error('Direct fetch failed, trying proxy...', err);
    try {
      const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
      const response = await fetch(proxyUrl);
      const json = await response.json();
      const rawCloses = json.chart.result[0].indicators.quote[0].close;
      let prices = rawCloses.filter(c => c != null);
      if (prices.length > lookback) prices = prices.slice(-lookback);
      return prices;
    } catch (err2) {
      console.error('Proxy also failed:', err2);
      return [];
    }
  }
}

function calculateRSI(prices, period = 14) {
  let rsi = new Array(prices.length).fill(null);
  if (prices.length < period + 1) return rsi;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    let change = prices[i] - prices[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  
  for (let i = period + 1; i < prices.length; i++) {
    let change = prices[i] - prices[i - 1];
    let gain = change > 0 ? change : 0;
    let loss = change < 0 ? -change : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
  }
  
  return rsi;
}

function percentile(arr, p) {
  let sorted = arr.slice().sort((a, b) => a - b);
  let index = (p / 100) * (sorted.length - 1);
  let lower = Math.floor(index);
  let upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function detectRSIDivergence() {
  bullishDivergence = false;
  bearishDivergence = false;
  divInfo = '';
  
  let n = closes.length;
  if (n < DIV_LOOKBACK + 10) return;
  
  let priceLows = [];
  let priceHighs = [];
  let rsiLows = [];
  let rsiHighs = [];
  
  let start = Math.max(RSI_PERIOD + PIVOT_WINDOW, n - DIV_LOOKBACK);
  
  for (let i = start; i < n - PIVOT_WINDOW; i++) {
    let isPriceLow = true;
    for (let k = 1; k <= PIVOT_WINDOW; k++) {
      if (closes[i] > closes[i - k] || closes[i] > closes[i + k]) {
        isPriceLow = false;
        break;
      }
    }
    if (isPriceLow) priceLows.push({ idx: i, val: closes[i] });
    
    let isPriceHigh = true;
    for (let k = 1; k <= PIVOT_WINDOW; k++) {
      if (closes[i] < closes[i - k] || closes[i] < closes[i + k]) {
        isPriceHigh = false;
        break;
      }
    }
    if (isPriceHigh) priceHighs.push({ idx: i, val: closes[i] });
    
    if (rsiValues[i] != null) {
      let isRsiLow = true;
      for (let k = 1; k <= PIVOT_WINDOW; k++) {
        if (rsiValues[i] > rsiValues[i - k] || rsiValues[i] > rsiValues[i + k]) {
          isRsiLow = false;
          break;
        }
      }
      if (isRsiLow) rsiLows.push({ idx: i, val: rsiValues[i] });
      
      let isRsiHigh = true;
      for (let k = 1; k <= PIVOT_WINDOW; k++) {
        if (rsiValues[i] < rsiValues[i - k] || rsiValues[i] < rsiValues[i + k]) {
          isRsiHigh = false;
          break;
        }
      }
      if (isRsiHigh) rsiHighs.push({ idx: i, val: rsiValues[i] });
    }
  }
  
  // Bullish divergence
  if (priceLows.length >= 2 && rsiLows.length >= 2) {
    let p1 = priceLows[priceLows.length - 2];
    let p2 = priceLows[priceLows.length - 1];
    let r1 = rsiLows[rsiLows.length - 2];
    let r2 = rsiLows[rsiLows.length - 1];
    
    if (Math.abs(p2.idx - r2.idx) < 8 && Math.abs(p1.idx - r1.idx) < 8) {
      if (p2.val < p1.val && r2.val > r1.val) {
        bullishDivergence = true;
        divInfo = `Bullish divergence (price LL + RSI HL)`;
      }
    }
  }
  
  // Bearish divergence
  if (priceHighs.length >= 2 && rsiHighs.length >= 2) {
    let p1 = priceHighs[priceHighs.length - 2];
    let p2 = priceHighs[priceHighs.length - 1];
    let r1 = rsiHighs[rsiHighs.length - 2];
    let r2 = rsiHighs[rsiHighs.length - 1];
    
    if (Math.abs(p2.idx - r2.idx) < 8 && Math.abs(p1.idx - r1.idx) < 8) {
      if (p2.val > p1.val && r2.val < r1.val) {
        bearishDivergence = true;
        divInfo = `Bearish divergence (price HH + RSI LH)`;
      }
    }
  }
}

function draw() {
  background(18);
  
  fill(230);
  textSize(18);
  text(`${currentSymbol} – Price + RSI + Markov + Divergence`, 40, 70);
  textSize(12);
  text(`Last ${closes.length} trading days  |  RSI period: ${RSI_PERIOD}`, 40, 90);
  
  if (closes.length === 0 || !markov) return;
  
  drawPriceChart(40, 110, width - 80, 200);
  drawRSIChart(40, 335, width - 80, 130);
  
  if (bullishDivergence || bearishDivergence) {
    if (bullishDivergence) fill(80, 255, 120);
    else fill(255, 100, 100);
    textSize(14);
    text(`⚠ ${divInfo}`, 40, 485);
  }
  
  let todayClose = closes[closes.length - 1];
  let change = estimatedTomorrow - todayClose;
  let changePct = (change / todayClose) * 100;
  
  fill(230);
  textSize(14);
  text(`Today: $${nf(todayClose, 0, 2)}`, 40, 515);
  
  if (change >= 0) fill(80, 220, 120);
  else fill(255, 100, 100);
  text(`Est. Tomorrow: $${nf(estimatedTomorrow, 0, 2)}  (${change >= 0 ? '+' : ''}${nf(changePct, 1, 2)}%)`, 280, 515);
  
  fill(230);
  textSize(13);
  text(`Last state: ${markov.lastState}   |   σ = ${nf(markov.std * 100, 1, 2)}%`, 40, 545);
  
  let y = 580;
  textSize(12);
  text('Tomorrow probability distribution:', 40, y);
  y += 18;
  
  for (let p of tomorrowProbs) {
    fill(70, 140, 255, 160);
    rect(40, y - 10, p.prob * 200, 14);
    fill(230);
    text(`${p.state.padEnd(5)} ${nf(p.prob * 100, 2, 1)}%  → $${nf(p.estimatedPrice, 0, 2)}`, 40, y);
    y += 17;
  }
  
  drawCompactMatrix(420, 580);
}

function drawPriceChart(x, y, w, h) {
  fill(25);
  noStroke();
  rect(x, y, w, h, 6);
  
  fill(180);
  textSize(12);
  textAlign(LEFT);
  text('Closing Price', x + 8, y + 16);
  
  let minP = Math.min(...closes);
  let maxP = Math.max(...closes);
  let pad = (maxP - minP) * 0.05;
  minP -= pad;
  maxP += pad;
  
  noFill();
  stroke(80, 180, 255);
  strokeWeight(1.8);
  beginShape();
  for (let i = 0; i < closes.length; i++) {
    let px = map(i, 0, closes.length - 1, x + 10, x + w - 10);
    let py = map(closes[i], minP, maxP, y + h - 12, y + 25);
    vertex(px, py);
  }
  endShape();
  
  if (bullishDivergence) {
    fill(80, 255, 120);
    noStroke();
    textSize(14);
    text('▲ Bullish Div', x + w - 130, y + h - 15);
  }
  if (bearishDivergence) {
    fill(255, 100, 100);
    noStroke();
    textSize(14);
    text('▼ Bearish Div', x + w - 130, y + 30);
  }
  
  fill(80, 180, 255);
  noStroke();
  textAlign(RIGHT);
  text('$' + nf(closes[closes.length-1], 0, 2), x + w - 10, y + 16);
  textAlign(LEFT);
}

function drawRSIChart(x, y, w, h) {
  fill(25);
  noStroke();
  rect(x, y, w, h, 6);
  
  let validRSI = rsiValues.filter(v => v != null);
  let oversold   = percentile(validRSI, 10);
  let overbought = percentile(validRSI, 90);
  
  fill(180);
  textSize(12);
  text(`RSI (${RSI_PERIOD})  |  Adaptive: ${nf(oversold,1,1)} / ${nf(overbought,1,1)}`, x + 8, y + 16);
  
  noStroke();
  let yOB = map(overbought, 0, 100, y + h - 12, y + 25);
  let yOS = map(oversold, 0, 100, y + h - 12, y + 25);
  
  fill(255, 60, 60, 35);
  rect(x + 10, y + 25, w - 20, yOB - (y + 25));
  
  fill(60, 200, 80, 30);
  rect(x + 10, yOS, w - 20, (y + h - 12) - yOS);
  
  stroke(180, 80, 80);
  strokeWeight(1);
  line(x + 10, yOB, x + w - 10, yOB);
  
  stroke(80, 180, 80);
  line(x + 10, yOS, x + w - 10, yOS);
  
  stroke(90);
  strokeWeight(0.7);
  let y50 = map(50, 0, 100, y + h - 12, y + 25);
  line(x + 10, y50, x + w - 10, y50);
  
  noFill();
  stroke(200, 120, 255);
  strokeWeight(1.7);
  beginShape();
  for (let i = 0; i < rsiValues.length; i++) {
    if (rsiValues[i] == null) continue;
    let px = map(i, 0, rsiValues.length - 1, x + 10, x + w - 10);
    let py = map(rsiValues[i], 0, 100, y + h - 12, y + 25);
    vertex(px, py);
  }
  endShape();
  
  if (bullishDivergence) {
    fill(80, 255, 120);
    noStroke();
    textSize(13);
    text('▲ Bullish', x + w - 100, y + h - 15);
  }
  if (bearishDivergence) {
    fill(255, 100, 100);
    noStroke();
    textSize(13);
    text('▼ Bearish', x + w - 100, y + 30);
  }
  
  let lastRSI = rsiValues[rsiValues.length - 1];
  if (lastRSI != null) {
    fill(200, 120, 255);
    noStroke();
    textAlign(RIGHT);
    text(nf(lastRSI, 1, 1), x + w - 10, y + 16);
    textAlign(LEFT);
  }
}

function drawCompactMatrix(x, y) {
  const states = markov.allStates;
  const cell = 40;
  
  fill(180);
  textSize(11);
  text('Transition Matrix', x, y - 6);
  
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      let prob = markov.getTransitionProb(states[r], states[c]);
      let intensity = map(prob, 0, 1, 20, 200);
      
      fill(30, 70, intensity);
      stroke(50);
      strokeWeight(0.5);
      rect(x + c * cell, y + r * cell, cell - 1, cell - 1);
      
      if (states[r] === markov.lastState) {
        noFill();
        stroke(255, 220, 80);
        strokeWeight(1.5);
        rect(x + c * cell, y + r * cell, cell - 1, cell - 1);
      }
      
      noStroke();
      fill(240);
      textAlign(CENTER, CENTER);
      textSize(9);
      text(nf(prob * 100, 0, 0), x + c * cell + cell/2, y + r * cell + cell/2);
    }
  }
  textAlign(LEFT);
}

class MarkovTree {
  constructor(prices) {
    this.prices = prices;
    this.allStates = ['-3σ', '-2σ', '-1σ', 'flat', '+1σ', '+2σ', '+3σ'];
    this.states = [];
    this.transitions = {};
    this.stateReturns = {};
    this.lastState = null;
    this.mean = 0;
    this.std = 0;
    this._build();
  }
  
  _toState(z) {
    if (z < -2.5) return '-3σ';
    if (z < -1.5) return '-2σ';
    if (z < -0.5) return '-1σ';
    if (z <  0.5) return 'flat';
    if (z <  1.5) return '+1σ';
    if (z <  2.5) return '+2σ';
    return '+3σ';
  }
  
  _build() {
    let rets = [];
    for (let i = 1; i < this.prices.length; i++) {
      rets.push((this.prices[i] - this.prices[i - 1]) / this.prices[i - 1]);
    }
    
    this.mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    let variance = rets.reduce((a, b) => a + (b - this.mean) ** 2, 0) / rets.length;
    this.std = Math.sqrt(variance) || 0.0001;
    
    for (let ret of rets) {
      let z = (ret - this.mean) / this.std;
      let state = this._toState(z);
      this.states.push(state);
      
      if (!this.stateReturns[state]) this.stateReturns[state] = [];
      this.stateReturns[state].push(ret);
    }
    
    for (let s in this.stateReturns) {
      let arr = this.stateReturns[s];
      this.stateReturns[s] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    
    for (let i = 0; i < this.states.length - 1; i++) {
      let from = this.states[i];
      let to   = this.states[i + 1];
      if (!this.transitions[from]) this.transitions[from] = {};
      if (!this.transitions[from][to]) this.transitions[from][to] = 0;
      this.transitions[from][to]++;
    }
    
    this.lastState = this.states[this.states.length - 1];
  }
  
  getTransitionProb(from, to) {
    let counts = this.transitions[from] || {};
    let total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    return (counts[to] || 0) / total;
  }
  
  predictTomorrow() {
    let from = this.lastState;
    let counts = this.transitions[from] || {};
    let total = Object.values(counts).reduce((a, b) => a + b, 0);
    let currentPrice = this.prices[this.prices.length - 1];
    let result = [];
    
    for (let s of this.allStates) {
      let prob = total === 0 ? 1 / this.allStates.length : (counts[s] || 0) / total;
      let avgRet = this.stateReturns[s] || 0;
      
      result.push({
        state: s,
        prob: prob,
        estimatedPrice: currentPrice * (1 + avgRet)
      });
    }
    
    result.sort((a, b) => b.prob - a.prob);
    return result;
  }
}