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

app.get('/assets', async (req, res) => {
	const { username, userId } = req.query;

	const fidgetMaster = req.headers['x-fidget-dot'];

	if (fidgetMaster !== process.env.FIDGET_DOT) {
		return res.status(403).send('Forbidden: Invalid fidget');
	}

	if (!username || !userId) return res.status(400).send('Missing username or userId');

	const cacheFile = path.join(CACHE_DIR, `${userId}.json`);

	// Serve from cache if under 10 minutes old
	if (fs.existsSync(cacheFile)) {
		const stat = fs.statSync(cacheFile);
		const age = (Date.now() - stat.mtimeMs) / 1000;
		if (age < 600) {
			const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
			return res.json(cachedData);
		}
	}

	try {
		const tshirtsUrl = `https://catalog.roproxy.com/v1/search/items/details?Category=3&CreatorName=${username}`;
		const gamepassesUrl = `https://www.roproxy.com/users/inventory/list-json?assetTypeId=34&cursor=&itemsPerPage=100&pageNumber=1&userId=${userId}`;

		const [tshirtsResp, gamepassesResp] = await Promise.all([
			axios.get(tshirtsUrl),
			axios.get(gamepassesUrl)
		]);

		const tshirts = tshirtsResp.data.data || [];
		const gamepassesRaw = gamepassesResp.data?.Data?.Items || [];
		const gamepasses = gamepassesRaw.map(gp => ({
			id: gp.Item.AssetId,
			price: gp.Product?.PriceInRobux || 0
		}));

		const result = { tshirts, gamepasses, updated: new Date().toISOString() };
		fs.writeFileSync(cacheFile, JSON.stringify(result), 'utf8');

		res.json(result);
	} catch (err) {
		console.error(err);
		res.status(500).send('Failed to fetch asset data');
	}
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

