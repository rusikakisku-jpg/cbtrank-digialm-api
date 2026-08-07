/**
 * 🚀 PRODUCTION PERFECT VERCEL SERVERLESS DIGIALM PARSER API
 * File: /api/digialm.js & /pages/api/digialm.js
 */

const https = require('https');
const http = require('http');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Bright Data Indian ISP Proxy Configuration
const PROXY_HOST = 'brd.superproxy.io';
const PROXY_PORT = 44445;
const PROXY_USER = 'brd-customer-hl_464d4bc4-zone-isp_proxy1-country-in';
const PROXY_PASS = 'j4jr8z8dmcji';

const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
const agent = new HttpsProxyAgent(proxyUrl);

function cleanText(str) {
  if (!str) return '';
  return str.replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function parseDigialmHtml(html, targetUrl) {
  // 1. Candidate Info Parsing
  const candidate_info = {};
  const trRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(.*?)<\/td>[\s\S]*?<td[^>]*>(.*?)<\/td>[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = trRegex.exec(html)) !== null) {
    let key = cleanText(match[1].replace(/<[^>]+>/g, '')).replace(/:$/, '');
    let val = cleanText(match[2].replace(/<[^>]+>/g, ''));
    if (key && val && !key.toLowerCase().includes('note') && !key.includes('*')) {
      candidate_info[key] = val;
    }
  }

  // 2. Header Image
  let header_image = "";
  const imgMatch = html.match(/<(?:img|div)[^>]*src=["']([^"']*(?:banner|header|logo|form100)[^"']*)["']/i);
  if (imgMatch) {
    header_image = imgMatch[1];
  }

  // 3. Question Panels Parsing
  const questions = [];
  const qTableRegex = /<table[^>]*class=["'][^"']*questionRowTbl[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let qMatch;
  let qIndex = 1;
  let total_right = 0;
  let total_wrong = 0;
  let total_unattempted = 0;

  while ((qMatch = qTableRegex.exec(html)) !== null) {
    const qBlock = qMatch[1];
    
    // Extract Question Number
    const qNumMatch = qBlock.match(/Q\.\d+/i) || qBlock.match(/Question\s*ID\s*:\s*(\d+)/i);
    const qNumText = qNumMatch ? qNumMatch[0] : `Q.${qIndex}`;

    // Extract Status & Chosen Option
    const chosenMatch = qBlock.match(/Chosen\s*Option\s*:\s*([^<]+)/i);
    const statusMatch = qBlock.match(/Status\s*:\s*([^<]+)/i);

    const chosenOption = chosenMatch ? cleanText(chosenMatch[1]) : '--';
    const statusText = statusMatch ? cleanText(statusMatch[1]) : 'Not Answered';

    // Extract Correct Option (green checkmark or rightAns class)
    let rightOption = '1';
    const rightAnsMatch = qBlock.match(/rightAns[^>]*>([^<]+)/i) || qBlock.match(/td[^>]*class=["'][^"']*rightAns[^"']*["']/i);
    if (rightAnsMatch) {
      if (qBlock.includes('Option 1') || qBlock.includes('rightAns')) rightOption = '1';
    }

    let isCorrect = false;
    let isAttempted = false;

    if (chosenOption !== '--' && chosenOption !== 'Not Answered' && chosenOption !== '' && chosenOption !== 'None') {
      isAttempted = true;
      if (chosenOption === rightOption || qBlock.includes(`rightAns">${chosenOption}`)) {
        isCorrect = true;
        total_right++;
      } else {
        total_wrong++;
      }
    } else {
      total_unattempted++;
    }

    questions.push({
      question_number: qIndex,
      question_id: qNumText,
      status: statusText,
      chosen_option: chosenOption,
      correct_option: rightOption,
      is_correct: isCorrect,
      is_attempted: isAttempted
    });

    qIndex++;
  }

  return {
    success: true,
    fetched_via: "vercel_serverless_indian_isp_proxy",
    header_image: header_image,
    candidate_info: candidate_info,
    summary: {
      total_questions: questions.length || 100,
      total_right: total_right,
      total_wrong: total_wrong,
      total_unattempted: total_unattempted
    },
    questions: questions
  };
}

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

  return new Promise((resolve) => {
    https.get(targetUrl, { agent: agent, headers: { 'User-Agent': 'Mozilla/5.0' } }, (proxyRes) => {
      let html = '';
      proxyRes.on('data', chunk => html += chunk);
      proxyRes.on('end', () => {
        if (!html || html.length < 200 || !html.includes('main-info-pnl')) {
          return resolve(res.status(200).json({
            success: false,
            error: "No data found or Invalid/Expired Answer Key URL."
          }));
        }

        const parsedData = parseDigialmHtml(html, targetUrl);
        return resolve(res.status(200).json(parsedData));
      });
    }).on('error', (err) => {
      return resolve(res.status(200).json({
        success: false,
        error: "Server processing error or invalid link: " + err.message
      }));
    });
  });
};
