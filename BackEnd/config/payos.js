const { PayOS } = require("@payos/node");
require("dotenv").config();

const payOs = new PayOS({
  clientId: process.env.PAYOS_CLIENT_ID,
  apiKey: process.env.PAYOS_API_KEY,
  checksumKey: process.env.PAYOS_CHECKSUM_KEY,
});

module.exports = payOs;
