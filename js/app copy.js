let closes = [];
let markov;
let tomorrowProbs = [];
let returns = [];
let rollingVol = [];          // rolling standard deviation

const SYMBOL = 'SNDK';
const LOOKBACK = 252;
const VOL_WINDOW = 20;        // rolling volatility window (days)

async function setup() {
  createCanvas(1100, 980);
  textFont('monospace');
  
  closes = await loadStockCloses(SYMBOL, LOOKBACK);
  
  if (closes.length < 30) {
    background(20);
    fill(255, 80, 80);
    textSize(16);
    text('Failed to load enough data for ' + SYMBOL, 40, 100);
    return;
  }
  
  // Pre-compute daily returns
  for (let i = 1; i < closes.length; i++) {
    returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  
  // Rolling volatility (std of returns)
  for (let i = 0; i < returns.length; i++) {
    if (i < VOL_WINDOW - 1) {
      rollingVol.push(null);
    } else {
      let slice = returns.slice(i - VOL_WINDOW + 1, i + 1);
      let mean = slice.reduce((a, b) => a + b, 0) / slice.length;
      let variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length;
      rollingVol.push(Math.sqrt(variance));
    }
  }
  
  markov = new MarkovTree(closes);
  tomorrowProbs = markov.predictTomorrow();
  
  noLoop();
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

function draw() {
  background(18);
  fill(230);
  textSize(18);
  text(`${SYMBOL} – Price + Volatility + Markov`, 20, 28);
  textSize(12);
  text(`Last ${closes.length} trading days   |   Rolling vol window: ${VOL_WINDOW}d`, 20, 48);
  
  if (closes.length === 0) return;
  
  // ===== 1. Price chart =====
  drawPriceChart(40, 70, width - 80, 220);
  
  // ===== 2. Rolling volatility chart =====
  drawVolatilityChart(40, 320, width - 80, 140);
  
  // ===== 3. Markov summary =====
  fill(230);
  textSize(13);
  text(`Current close: $${nf(closes[closes.length-1], 0, 2)}   |   Last state: ${markov.lastState}   |   σ (full window) = ${nf(markov.std * 100, 1, 2)}%`, 40, 490);
  
  // Tomorrow probabilities (compact)
  let y = 515;
  textSize(12);
  text('Tomorrow probability distribution:', 40, y);
  y += 18;
  
  for (let p of tomorrowProbs) {
    fill(70, 140, 255, 160);
    rect(40, y - 10, p.prob * 220, 14);
    fill(230);
    text(`${p.state.padEnd(5)} ${nf(p.prob * 100, 2, 1)}%  → $${nf(p.estimatedPrice, 0, 2)}`, 40, y);
    y += 18;
  }
  
  // Small transition matrix (compact)
  drawCompactMatrix(420, 515);
}

function drawPriceChart(x, y, w, h) {
  // Background
  fill(25);
  noStroke();
  rect(x, y, w, h, 6);
  
  // Title
  fill(180);
  textSize(12);
  textAlign(LEFT);
  text('Closing Price', x + 8, y + 16);
  
  let minP = Math.min(...closes);
  let maxP = Math.max(...closes);
  let pad = (maxP - minP) * 0.05;
  minP -= pad;
  maxP += pad;
  
  // Price line
  noFill();
  stroke(80, 180, 255);
  strokeWeight(1.8);
  beginShape();
  for (let i = 0; i < closes.length; i++) {
    let px = map(i, 0, closes.length - 1, x + 10, x + w - 10);
    let py = map(closes[i], minP, maxP, y + h - 15, y + 25);
    vertex(px, py);
  }
  endShape();
  
  // Current price label
  fill(80, 180, 255);
  noStroke();
  textAlign(RIGHT);
  text('$' + nf(closes[closes.length-1], 0, 2), x + w - 10, y + 16);
  textAlign(LEFT);
}

function drawVolatilityChart(x, y, w, h) {
  fill(25);
  noStroke();
  rect(x, y, w, h, 6);
  
  fill(180);
  textSize(12);
  text(`Rolling Volatility (${VOL_WINDOW}-day σ of returns)`, x + 8, y + 16);
  
  // Filter valid values
  let validVol = rollingVol.filter(v => v != null);
  if (validVol.length < 2) return;
  
  let maxV = Math.max(...validVol) * 1.15;
  
  // Area under the curve
  noStroke();
  fill(255, 120, 50, 60);
  beginShape();
  vertex(x + 10, y + h - 12);
  for (let i = 0; i < rollingVol.length; i++) {
    if (rollingVol[i] == null) continue;
    let px = map(i, 0, rollingVol.length - 1, x + 10, x + w - 10);
    let py = map(rollingVol[i], 0, maxV, y + h - 12, y + 28);
    vertex(px, py);
  }
  vertex(x + w - 10, y + h - 12);
  endShape(CLOSE);
  
  // Line
  noFill();
  stroke(255, 140, 60);
  strokeWeight(1.6);
  beginShape();
  for (let i = 0; i < rollingVol.length; i++) {
    if (rollingVol[i] == null) continue;
    let px = map(i, 0, rollingVol.length - 1, x + 10, x + w - 10);
    let py = map(rollingVol[i], 0, maxV, y + h - 12, y + 28);
    vertex(px, py);
  }
  endShape();
  
  // Current vol label
  let lastVol = rollingVol[rollingVol.length - 1];
  if (lastVol != null) {
    fill(255, 140, 60);
    noStroke();
    textAlign(RIGHT);
    text(nf(lastVol * 100, 1, 2) + '%', x + w - 10, y + 16);
    textAlign(LEFT);
  }
}

function drawCompactMatrix(x, y) {
  const states = markov.allStates;
  const cell = 42;
  
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
      let prob = total === 0 ? 1 / 7 : (counts[s] || 0) / total;
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