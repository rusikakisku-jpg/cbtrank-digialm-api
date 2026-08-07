/**
 * 🚀 PRODUCTION PERFECT VERCEL SERVERLESS DIGIALM PARSER API
 * Outputs 100% Identical JSON Schema as digialm.php
 */

const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const cheerio = require('cheerio');

// Bright Data Indian ISP Proxy Configuration
const PROXY_HOST = 'brd.superproxy.io';
const PROXY_PORT = 44445;
const PROXY_USER = 'brd-customer-hl_464d4bc4-zone-isp_proxy1-country-in';
const PROXY_PASS = 'j4jr8z8dmcji';

const proxyUrl = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
const agent = new HttpsProxyAgent(proxyUrl);

function normText(t) {
  if (!t) return '';
  return t.replace(/[\u00A0\u200B]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanSectionName(txt) {
  if (!txt) return '';
  txt = txt.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return txt.replace(/^Section\s*:\s*/i, '').trim();
}

function chosenToIndex(s) {
  if (!s) return null;
  s = s.trim();
  if (s === '' || s === '--' || s.toLowerCase().includes('not answered')) return null;
  if (/^[A-D]$/i.test(s)) return s.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0) + 1;
  const m1 = s.match(/^(\d+)$/); if (m1) return parseInt(m1[1], 10);
  const m2 = s.match(/\b([1-4])\b/); if (m2) return parseInt(m2[1], 10);
  const m3 = s.match(/([1-4])/); if (m3) return parseInt(m3[1], 10);
  const m4 = s.match(/\b([A-D])\b/i); if (m4) return m4[1].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0) + 1;
  return null;
}

function makeAbsUrl(src, targetUrl) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  try {
    const u = new URL(targetUrl);
    if (src.startsWith('/')) {
      return `${u.protocol}//${u.host}${src}`;
    } else {
      const dir = u.pathname.substring(0, u.pathname.lastIndexOf('/'));
      return `${u.protocol}//${u.host}${dir}/${src}`;
    }
  } catch (e) {
    return src;
  }
}

function parseDigialmScorecard(html, targetUrl, startTime) {
  const $ = cheerio.load(html);

  // 1. Header Image
  let header_image = "";
  const headerImg = $('div.header-image img, div.main-info-pnl img, table.main-info-pnl img, img[src*="logo"], img[src*="header"], img[src*="Banner"]').first();
  if (headerImg.length > 0) {
    header_image = makeAbsUrl(headerImg.attr('src'), targetUrl);
  }

  // 2. Candidate Info
  const candidate_info = {};
  $('div.main-info-pnl tr, table.main-info-pnl tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length >= 2) {
      const k = normText($(tds[0]).text()).replace(/:$/, '');
      const v = normText($(tds[1]).text());
      if (k && v && !k.toLowerCase().includes('note') && !k.includes('*')) {
        candidate_info[k] = v;
      }
    }
  });

  // 3. Section Names
  const section_names = [];
  $('div.section-lbl, span.secName, div.sec-lbl, td.section-lbl').each((_, sec) => {
    const txt = cleanSectionName($(sec).text());
    if (txt && !section_names.includes(txt)) {
      section_names.push(txt);
    }
  });

  // 4. Questions & Section Summary
  const questions = [];
  const section_summary = {};
  let total_right = 0;
  let total_wrong = 0;
  let total_unattempted = 0;

  let qTables = $('table.questionRowTbl');
  if (qTables.length === 0) {
    qTables = $('div.question-pnl');
  }

  let idx = 1;
  qTables.each((_, qEl) => {
    const $q = $(qEl);

    // Section name for question
    let qSecName = 'General';
    const prevSec = $q.prevAll('div.section-lbl, span.secName, div.sec-lbl, td.section-lbl').first();
    if (prevSec.length > 0) {
      const st = cleanSectionName(prevSec.text());
      if (st) qSecName = st;
    } else if (section_names.length > 0) {
      qSecName = section_names[0];
    }

    if (!section_summary[qSecName]) {
      section_summary[qSecName] = {
        total_questions: 0,
        attempted: 0,
        unattempted: 0,
        correct_answers: 0,
        wrong_answers: 0,
        marks_obtained: 0
      };
    }

    // Question Details
    const menuTbl = $q.find('table.menu-tbl, table[class*="menu"]');
    let qId = "", qType = "MCQ", chosenRaw = null, chosenOptId = null;

    menuTbl.find('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length >= 2) {
        const k = normText($(tds[0]).text()).toLowerCase();
        const v = normText($(tds[1]).text());
        if (k.includes('question id')) qId = v;
        else if (k.includes('question type')) qType = v;
        else if (k.includes('chosen option')) chosenRaw = v;
        else if (k.includes('given option')) chosenRaw = v;
        else if (k.includes('option id')) chosenOptId = v;
      }
    });

    if (!qId) qId = `Q${idx}`;

    // Question Content & Options
    const qTd = $q.find('td.bold, td[class*="q-text"], td[class*="question"]').first();
    let qText = normText(qTd.text());
    let qImg = "";
    const qImgEl = qTd.find('img').first();
    if (qImgEl.length > 0) qImg = makeAbsUrl(qImgEl.attr('src'), targetUrl);

    // Options Parsing
    const options = [];
    let rightPos = null;
    let rightText = "";

    $q.find('td').each((_, td) => {
      const $td = $(td);
      const txt = normText($td.text());
      const isRight = $td.hasClass('rightAns') || $td.find('img[src*="tick"]').length > 0;

      if (/^(?:1\.|2\.|3\.|4\.|[A-D]\.)/.test(txt) || $td.parent().find('td.rightAns').length > 0) {
        const optNumMatch = txt.match(/^([1-4]|[A-D])[\.\)]\s*(.*)/i);
        if (optNumMatch) {
          const optNo = optNumMatch[1];
          const optVal = optNumMatch[2];
          const optImgEl = $td.find('img').first();
          const optImg = optImgEl.length > 0 ? makeAbsUrl(optImgEl.attr('src'), targetUrl) : "";

          options.push({
            option_no: optNo,
            option_text: optVal,
            option_image: optImg,
            is_correct: isRight
          });

          if (isRight) {
            rightPos = chosenToIndex(optNo);
            rightText = optVal;
          }
        }
      }
    });

    const chosenPos = chosenToIndex(chosenRaw);
    let status = "Unattempted";

    if (chosenPos !== null) {
      if (rightPos !== null && chosenPos === rightPos) {
        status = "Correct";
        total_right++;
      } else {
        status = "Wrong";
        total_wrong++;
      }
    } else {
      total_unattempted++;
    }

    // Update Section Summary
    section_summary[qSecName].total_questions++;
    if (status === "Correct") {
      section_summary[qSecName].correct_answers++;
      section_summary[qSecName].attempted++;
    } else if (status === "Wrong") {
      section_summary[qSecName].wrong_answers++;
      section_summary[qSecName].attempted++;
    } else {
      section_summary[qSecName].unattempted++;
    }

    questions.push({
      q_no: idx++,
      question_id: qId,
      question_type: qType,
      section: qSecName,
      question_text: qText,
      question_image: qImg,
      question_html: "",
      options: options,
      chosen_option: (chosenRaw !== null ? chosenRaw : "Not Answered"),
      chosen_option_id: chosenOptId,
      right_option: rightText,
      right_option_no: rightPos,
      status: status
    });
  });

  // Section Marks Calculation
  Object.keys(section_summary).forEach(secKey => {
    const s = section_summary[secKey];
    s.marks_obtained = Math.round((s.correct_answers * 1.0 - s.wrong_answers * 0.25) * 100) / 100;
  });

  const total_attempted = total_right + total_wrong;
  const marks_obtained = Math.round((total_right * 1.0 - total_wrong * 0.25) * 100) / 100;
  const execTime = `${Date.now() - startTime} ms`;

  return {
    success: true,
    fetched_via: "vercel_serverless_indian_isp_proxy",
    header_image: header_image,
    candidate_info: candidate_info,
    score_summary: {
      total_questions: questions.length,
      attempted: total_attempted,
      unattempted: total_unattempted,
      correct_answers: total_right,
      wrong_answers: total_wrong,
      marks_obtained: marks_obtained
    },
    sections_list: section_names,
    section_summary: section_summary,
    questions_summary: questions,
    execution_time: execTime
  };
}

module.exports = async (req, res) => {
  const startTime = Date.now();

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
    https.get(targetUrl, { agent: agent, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36' } }, (proxyRes) => {
      let html = '';
      proxyRes.on('data', chunk => html += chunk);
      proxyRes.on('end', () => {
        if (!html || html.length < 200 || !html.includes('main-info-pnl')) {
          return resolve(res.status(200).json({
            success: false,
            error: "No data found or Invalid/Expired Answer Key URL."
          }));
        }

        const parsedData = parseDigialmScorecard(html, targetUrl, startTime);
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
