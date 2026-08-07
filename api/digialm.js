/**
 * 🚀 VERCEL SERVERLESS FUNCTION FOR DIGIALM ANSWER KEY PARSER
 * File location in Vercel project: /api/digialm.js
 * Access URL: https://your-project.vercel.app/api/digialm?url=YOUR_ANSWER_KEY_URL
 */

const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Bright Data Indian ISP Proxy Configuration
const PROXY_HOST = 'brd.superproxy.io';
const PROXY_PORT = 44445;
const PROXY_USER = 'brd-customer-hl_464d4bc4-zone-isp_proxy1-country-in';
const PROXY_PASS = 'j4jr8z8dmcji';

const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
const agent = new HttpsProxyAgent(proxyUrl);

module.exports = async (req, res) => {
  // Global CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  let targetUrl = req.query.url;
  if (req.method === 'POST' && req.body && req.body.url) {
    targetUrl = req.body.url;
  }

  if (!targetUrl) {
    return res.status(200).json({
      success: false,
      error: "Please provide a valid Answer Key URL parameter (e.g. ?url=YOUR_DIGIALM_URL)"
    });
  }

  try {
    if (targetUrl.includes('%3A') || targetUrl.includes('%2F')) {
      targetUrl = decodeURIComponent(targetUrl);
    }
  } catch (e) {}

  // Fetch HTML via Indian ISP Proxy inside Vercel Serverless Function
  return new Promise((resolve) => {
    https.get(targetUrl, { agent: agent, headers: { 'User-Agent': 'Mozilla/5.0' } }, (proxyRes) => {
      let html = '';
      proxyRes.on('data', chunk => html += chunk);
      proxyRes.on('end', () => {
        // Parse candidate info using JS Regex
        const regMatch = html.match(/Registration Number<\/td>\s*<td[^>]*>(.*?)<\/td>/i);
        const rollMatch = html.match(/Roll Number<\/td>\s*<td[^>]*>(.*?)<\/td>/i);
        const nameMatch = html.match(/Candidate Name<\/td>\s*<td[^>]*>(.*?)<\/td>/i);

        resolve(res.status(200).json({
          success: true,
          fetched_via: "vercel_serverless_indian_isp_proxy",
          candidate_info: {
            "Registration Number": regMatch ? regMatch[1].replace(/<[^>]+>/g, '').trim() : "N/A",
            "Roll Number": rollMatch ? rollMatch[1].replace(/<[^>]+>/g, '').trim() : "N/A",
            "Candidate Name": nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : "N/A"
          }
        }));
      });
    }).on('error', (err) => {
      resolve(res.status(200).json({
        success: false,
        error: "Server processing error or invalid link: " + err.message
      }));
    });
  });
};
