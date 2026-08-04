Project: Coding Markov
----------------------
Goal: p5.js visualization + Markov chain model for stock closing prices

Current features:
- Loads live daily data for SYMBOL (default: SNDK) from Yahoo Finance
- Uses last LOOKBACK = 252 trading days
- 7-state Markov model based on standard deviations of returns
  States: -3σ, -2σ, -1σ, flat, +1σ, +2σ, +3σ
- Adaptive RSI (14-period) with levels from 10th/90th percentiles of the stock’s own RSI history
- Price chart
- RSI chart with adaptive overbought/oversold zones
- Transition matrix visualization
- Probability distribution for tomorrow’s state
- Probability-weighted estimate of tomorrow’s closing price (shown next to today’s price)

Key files needed:
- index.html (loads p5 + sketch.js)
- sketch.js (the full code from the last message)# MarkovPricesOnline
