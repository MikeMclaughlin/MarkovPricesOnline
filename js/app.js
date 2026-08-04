let closes = [];
let markov;
let tomorrowProbs = [];
let returns = [];
let rsiValues = [];
let estimatedTomorrow = 0;

let symbolInput;
let loadButton;
let currentSymbol = 'SNDK';

const LOOKBACK = 252;
const RSI_PERIOD = 14;
const TEMPERATURE = 1.0;

function setup() {
  createCanvas(1100, 980);
  textFont('monospace');
  
  // --- UI Controls ---
  symbolInput = createInput(currentSymbol);
  symbolInput.position(40, 20);
  symbolInput.size(120);
  symbolInput.attribute('placeholder', 'Symbol');
  
  loadButton = createButton('Load');
  loadButton.position(175, 20);
  loadButton.mousePressed(loadNewSymbol);
  
  // Initial load
  loadNewSymbol();
}

async function loadNewSymbol() {
  currentSymbol = symbolInput.value().trim().toUpperCase() || 'SNDK';
  
  // Clear previous data
  closes = [];
  returns = [];
  rsiValues = [];
  tomorrowProbs = [];
  estimatedTomorrow = 0;
  markov = null;
  
  // Show loading message
  background(18);
  fill(200);
  textSize(16);
  text(`Loading ${currentSymbol}...`, 40, 100);
  
  closes = await loadStockCloses(currentSymbol, LOOKBACK);
  
  if (closes.length < 30) {
    background(18);
    fill(255, 80, 80);
    textSize(16);
    text(`Failed to load enough data for ${currentSymbol}`, 40, 100);
    return;
  }
  
  // Daily returns
  returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  
  // RSI
  rsiValues = calculateRSI(closes, RSI_PERIOD);
  
  // Markov model
  markov = new MarkovTree(closes);
  tomorrowProbs = markov.predictTomorrow();
  
  // Probability-weighted estimate
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

function draw() {
  background(18);
  
  // Leave space for the input controls at the top
  fill(230);
  textSize(18);
  text(`${currentSymbol} – Price + RSI + Markov (Softmax T=${TEMPERATURE})`, 40, 70);
  textSize(12);
  text(`Last ${closes.length} trading days  |  RSI period: ${RSI_PERIOD}`, 40, 90);
  
  if (closes.length === 0 || !markov) return;
  
  drawPriceChart(40, 110, width - 80, 200);
  drawRSIChart(40, 335, width - 80, 130);
  
  // Today's price + estimated tomorrow price
  let todayClose = closes[closes.length - 1];
  let change = estimatedTomorrow - todayClose;
  let changePct = (change / todayClose) * 100;
  
  fill(230);
  textSize(14);
  text(`Today: $${nf(todayClose, 0, 2)}`, 40, 500);
  
  if (change >= 0) fill(80, 220, 120);
  else fill(255, 100, 100);
  
  text(`Est. Tomorrow: $${nf(estimatedTomorrow, 0, 2)}  (${change >= 0 ? '+' : ''}${nf(changePct, 1, 2)}%)`, 280, 500);
  
  fill(230);
  textSize(13);
  text(`Last state: ${markov.lastState}   |   σ = ${nf(markov.std * 100, 1, 2)}%`, 40, 530);
  
  let y = 565;
  textSize(12);
  text('Tomorrow probability distribution (Softmax):', 40, y);
  y += 18;
  
  for (let p of tomorrowProbs) {
    fill(70, 140, 255, 160);
    rect(40, y - 10, p.prob * 200, 14);
    fill(230);
    text(`${p.state.padEnd(5)} ${nf(p.prob * 100, 2, 1)}%  → $${nf(p.estimatedPrice, 0, 2)}`, 40, y);
    y += 17;
  }
  
  drawCompactMatrix(420, 565);
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
  text('Transition Matrix (Softmax)', x, y - 6);
  
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
  
  softmax(scores, temperature = 1.0) {
    let maxScore = Math.max(...scores);
    let exps = scores.map(s => Math.exp((s - maxScore) / temperature));
    let sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(e => e / sum);
  }
  
  getTransitionProb(from, to) {
    let counts = this.transitions[from] || {};
    let scores = this.allStates.map(s => (counts[s] || 0) + 0.1);
    let probs = this.softmax(scores, TEMPERATURE);
    let idx = this.allStates.indexOf(to);
    return idx >= 0 ? probs[idx] : 0;
  }
  
  predictTomorrow() {
    let from = this.lastState;
    let counts = this.transitions[from] || {};
    let currentPrice = this.prices[this.prices.length - 1];
    
    let scores = this.allStates.map(s => (counts[s] || 0) + 0.1);
    let probs = this.softmax(scores, TEMPERATURE);
    
    let result = [];
    for (let i = 0; i < this.allStates.length; i++) {
      let s = this.allStates[i];
      let avgRet = this.stateReturns[s] || 0;
      
      result.push({
        state: s,
        prob: probs[i],
        estimatedPrice: currentPrice * (1 + avgRet)
      });
    }
    
    result.sort((a, b) => b.prob - a.prob);
    return result;
  }
}