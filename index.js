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
  res.send('pong');
});

app.get('/assets', async (req, res) => {
  const { username, userId } = req.query;
  const fidgetMaster = req.headers['x-fidget-dot'];

  console.log("Received /assets request with query:", req.query);
  console.log("x-fidget-dot header:", fidgetMaster);
  console.log("Expected fidget value:", process.env.FIDGET_DOT);

  if (fidgetMaster !== process.env.FIDGET_DOT) {
    return res.status(403).send('Forbidden: Invalid fidget');
  }

  if (!username || !userId) return res.status(400).send('Missing username or userId');

  const cacheFile = path.join(CACHE_DIR, `${userId}.json`);

  if (fs.existsSync(cacheFile)) {
    const stat = fs.statSync(cacheFile);
    const age = (Date.now() - stat.mtimeMs) / 1000;
    if (age < 600) {
      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return res.json(cachedData);
    }
  }

  try {
    console.log("No cache file found, fetching fresh data");

    const tshirtsUrl = `https://catalog.roproxy.com/v1/search/items/details?Category=3&CreatorName=${encodeURIComponent(username)}&assetType=2`;
    console.log("Fetching T-shirts from:", tshirtsUrl);
    const tshirtsResp = await axios.get(tshirtsUrl);
    const tshirts = tshirtsResp.data.data || [];
    console.log(`Fetched ${tshirts.length} T-shirts`);

    let gamepasses = [];

    try {
      let page = 1;
      let done = false;

      while (!done) {
        const url = `https://www.roproxy.com/users/inventory/list-json?assetTypeId=34&cursor=&itemsPerPage=100&pageNumber=${page}&userId=${userId}`;
        console.log(`Fetching gamepasses page ${page} from:`, url);

        const resp = await axios.get(url);

        const items = resp.data?.Data?.Items || [];
        console.log(`Page ${page} returned ${items.length} gamepasses`);

        if (items.length === 0) {
          done = true;
        } else {
          for (const gp of items) {
            const id = gp?.Item?.AssetId;
            const price = gp?.Product?.PriceInRobux || 0;
            if (id) {
              gamepasses.push({ id, price });
            }
          }
          page++;
        }
      }
    } catch (err) {
      if (err.response && err.response.status === 404) {
        console.warn("User has no gamepasses or inventory endpoint returned 404.");
        gamepasses = [];
      } else {
        throw err; // escalate if not a 404
      }
    }

    const result = { tshirts, gamepasses, updated: new Date().toISOString() };
    fs.writeFileSync(cacheFile, JSON.stringify(result), 'utf8');

    res.json(result);
  } catch (err) {
    console.error("=== ERROR WHILE FETCHING ASSET DATA ===");

    if (err.response) {
      console.error("Error message:", err.message);
      console.error("Response status:", err.response.status);
      console.error("Response data:", JSON.stringify(err.response.data, null, 2));
    } else if (err.request) {
      console.error("No response received. Request was:", err.request);
    } else {
      console.error("Error message:", err.message);
    }

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
