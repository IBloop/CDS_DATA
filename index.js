const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const CACHE_DIR = path.join(__dirname, 'cache');

// Make sure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  console.log("Cache directory doesn't exist. Creating...");
  fs.mkdirSync(CACHE_DIR);
}

// Simple /ping route to test server is alive
app.get('/ping', (req, res) => {
  console.log('Ping received');
  res.send('pong');
});

app.get('/assets', async (req, res) => {
  console.log('Received /assets request with query:', req.query);

  try {
    const { username, userId } = req.query;
    const fidgetMaster = req.headers['x-fidget-dot'];

    console.log('x-fidget-dot header:', fidgetMaster);
    console.log('Expected fidget value:', process.env.FIDGET_DOT);

    // Validate header for security
    if (fidgetMaster !== process.env.FIDGET_DOT) {
      console.warn('Forbidden: Invalid fidget header');
      return res.status(403).send('Forbidden: Invalid fidget');
    }

    // Validate required query params
    if (!username || !userId) {
      console.warn('Bad request: Missing username or userId');
      return res.status(400).send('Missing username or userId');
    }

    const cacheFile = path.join(CACHE_DIR, `${userId}.json`);

    // Check cache and serve if fresh (< 10 minutes old)
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      const ageSeconds = (Date.now() - stat.mtimeMs) / 1000;
      console.log(`Cache file found. Age: ${ageSeconds.toFixed(1)} seconds`);

      if (ageSeconds < 600) {
        console.log('Serving data from cache');
        const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        return res.json(cachedData);
      } else {
        console.log('Cache expired, fetching fresh data');
      }
    } else {
      console.log('No cache file found, fetching fresh data');
    }

    // Fetch T-shirts
    const tshirtsUrl = `https://catalog.roproxy.com/v1/search/items/details?Category=3&CreatorName=${encodeURIComponent(username)}&assetType=2`;
    console.log('Fetching T-shirts from:', tshirtsUrl);

    let tshirtsResp;
    try {
      tshirtsResp = await axios.get(tshirtsUrl);
    } catch (err) {
      console.error('Failed to fetch T-shirts:', err.message);
      throw err; // re-throw to catch below
    }

    const tshirts = tshirtsResp.data?.data || [];
    console.log(`Fetched ${tshirts.length} T-shirts`);

    // Fetch gamepasses with pagination
    const gamepasses = [];
    let page = 1;
    let done = false;

    while (!done) {
      const gamepassesUrl = `https://www.roproxy.com/users/inventory/list-json?assetTypeId=34&cursor=&itemsPerPage=100&pageNumber=${page}&userId=${userId}`;
      console.log(`Fetching gamepasses page ${page} from:`, gamepassesUrl);

      let resp;
      try {
        resp = await axios.get(gamepassesUrl);
      } catch (err) {
        console.error(`Failed to fetch gamepasses on page ${page}:`, err.message);
        throw err; // re-throw
      }

      // Defensive check for data structure
      const items = resp.data?.Data?.Items || [];
      console.log(`Page ${page} returned ${items.length} gamepasses`);

      if (items.length === 0) {
        done = true;
      } else {
        for (const gp of items) {
          // Defensive property checks
          const id = gp?.Item?.AssetId;
          const price = gp?.Product?.PriceInRobux || 0;
          if (id) {
            gamepasses.push({ id, price });
          }
        }
        page++;
      }
    }

    console.log(`Total gamepasses fetched: ${gamepasses.length}`);

    // Save to cache
    const result = {
      tshirts,
      gamepasses,
      updated: new Date().toISOString()
    };
    fs.writeFileSync(cacheFile, JSON.stringify(result), 'utf8');
    console.log('Cached fresh data to', cacheFile);

    // Respond with result
    return res.json(result);

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

    // Send error details to client (careful with sensitive info in production)
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
      details: err.response?.data || null
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
