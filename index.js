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

app.get('/assets', async (req, res) => {
    const { username, userId } = req.query;
    const fidgetMaster = req.headers['x-fidget-dot'];

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
      
        const tshirtsUrl = `https://catalog.roproxy.com/v1/search/items/details?Category=3&CreatorName=${encodeURIComponent(username)}&assetType=2`;
        const tshirtsResp = await axios.get(tshirtsUrl);
        const tshirts = tshirtsResp.data.data || [];

	    
        const gamepasses = [];
        let page = 1;
        let done = false;

        while (!done) {
            const url = `https://www.roproxy.com/users/inventory/list-json?assetTypeId=34&cursor=&itemsPerPage=100&pageNumber=${page}&userId=${userId}`;
            const resp = await axios.get(url);
            const items = resp.data?.Data?.Items || [];

            if (items.length === 0) {
                done = true;
            } else {
                for (const gp of items) {
                    gamepasses.push({
                        id: gp.Item.AssetId,
                        price: gp.Product?.PriceInRobux || 0
                    });
                }
                page++;
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


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});






