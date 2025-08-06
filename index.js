// index.js
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, 'cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

app.get('/ping', (req, res) => {
  console.log('Ping route hit');
  res.send('pong');
});

app.get('/assets', async (req, res) => {
  try {
    console.log('Received /assets request', { query: req.query, headers: req.headers });

    const { username, userId } = req.query;
    const fidgetMaster = req.headers['x-fidget-dot'];

    if (!process.env.FIDGET_DOT) {
      console.error('FIDGET_DOT env var is missing!');
      return res.status(500).send('Server misconfiguration');
    }

    console.log('Checking fidget:', fidgetMaster, 'against env:', process.env.FIDGET_DOT);

    if (fidgetMaster !== process.env.FIDGET_DOT) {
      return res.status(403).send('Forbidden: Invalid fidget');
    }

    if (!username || !userId) {
      return res.status(400).send('Missing username or userId');
    }

    const cacheFile = path.join(CACHE_DIR, `${userId}.json`);

    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      const age = (Date.now() - stat.mtimeMs) / 1000;
      if (age < 600) {
        console.log('Serving cached data for userId:', userId);
        const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        return res.json(cachedData);
      }
    }

    // Fetch T-Shirts
    const tshirtsUrl = `https://catalog.roproxy.com/v1/search/items/details?Category=3&CreatorName=${encodeURIComponent(username)}&assetType=2`;
    console.log('Fetching tshirts from:', tshirtsUrl);
    const tshirtsResp = await axios.get(tshirtsUrl);
    const tshirts = tshirtsResp.data.data || [];

    // Fetch Gamepasses with pagination
    const gamepasses = [];
    let page = 1;
    let done = false;

    while (!done) {
      const url = `https://www.roproxy.com/users/inventory/list-json?assetTypeId=34&cursor=&itemsPerPage=100&pageNumber=${page}&userId=${userId}`;
      console.log(`Fetching gamepasses from: ${url}`);
      const resp = await axios.get(url);

      const items = resp.data?.Data?.Items || [];
      if (items.length === 0) {
        done = true;
      } else {
        for (const gp of items) {
          gamepasses.push({
            id: gp.Item.AssetId,
            price: gp.Product?.PriceInRobux || 0,
          });
        }
        page++;
      }
    }

    const result = { tshirts, gamepasses, updated: new Date().toISOString() };
    fs.writeFileSync(cacheFile, JSON.stringify(result), 'utf8');

    console.log('Sending response with asset data');
    res.json(result);

  } catch (err) {
    console.error('=== ERROR WHILE FETCHING ASSET DATA ===');

    if (err.response) {
      console.error('Error message:', err.message);
      console.error('Response status:', err.response.status);
      console.error('Response data:', JSON.stringify(err.response.data, null, 2));
    } else if (err.request) {
      console.error('No response received. Request was:', err.request);
    } else {
      console.error('Error message:', err.message);
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
      details: err.response?.data || null,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('FIDGET_DOT env var:', process.env.FIDGET_DOT ? 'SET' : 'NOT SET');
});
