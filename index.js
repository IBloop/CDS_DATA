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

// Simple ping route to check server status
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

  if (!username || !userId) {
    return res.status(400).send('Missing username or userId');
  }

  const cacheFile = path.join(CACHE_DIR, `${userId}.json`);

  // Serve cached data if it’s fresh (less than 10 minutes old)
  if (fs.existsSync(cacheFile)) {
    const stat = fs.statSync(cacheFile);
    const age = (Date.now() - stat.mtimeMs) / 1000;
    if (age < 600) {
      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      console.log(`Serving cached data for userId ${userId}`);
      return res.json(cachedData);
    }
  }

  try {
    console.log(`Fetching T-shirts for username: ${username}`);
    const tshirtsUrl = `https://catalog.roproxy.com/v1/search/items/details?Category=3&CreatorName=${encodeURIComponent(username)}&assetType=2`;
    const tshirtsResp = await axios.get(tshirtsUrl);
    const tshirts = tshirtsResp.data?.data || [];
    console.log(`Fetched ${tshirts.length} T-shirts`);

    let gamepasses = [];
    let page = 1;

    while (true) {
      const gamepassesUrl = `https://www.roproxy.com/users/inventory/list-json?assetTypeId=34&cursor=&itemsPerPage=100&pageNumber=${page}&userId=${userId}`;
      console.log(`Fetching gamepasses page ${page} from: ${gamepassesUrl}`);

      try {
        const resp = await axios.get(gamepassesUrl);
        const items = resp.data?.Data?.Items || [];
        console.log(`Page ${page} returned ${items.length} gamepasses`);

        if (items.length === 0) break;

        for (const gp of items) {
          // Match creator ID and avoid duplicates
          if (gp.Creator?.Id == Number(userId) && !gamepasses.some(g => g.id === gp.Item.AssetId)) {
            gamepasses.push({
              id: gp.Item.AssetId,
              price: gp.Product?.PriceInRobux || 0,
            });
          }
        }

        page++;
      } catch (err) {
        if (err.response && err.response.status === 404) {
          console.log("Gamepasses endpoint returned 404, assuming no more gamepasses.");
          break;
        } else {
          throw err;
        }
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
      details: err.response?.data || null,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
