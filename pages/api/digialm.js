/**
 * 🚀 100% PURE STANDALONE NODE.JS SERVERLESS DIGIALM PARSER API (Pages Router Fallback)
 * ZERO PHP DEPENDENCY - 100% Self-Contained Node.js Engine
 * Runs natively on Vercel with Bright Data Indian ISP Proxy
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

function normText(str) {
  if (!str) return '';
  return str.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/[\u00A0\u200B]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanSectionName(txt) {
  if (!txt) return '';
  txt = normText(txt);
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

function parseDigialmScorecardPureNode(html, targetUrl, startTime) {
  // 1. Extract Header Image (Banner / Logo)
  let header_image = "";
  const headerMatch = html.match(/<(?:img|div)[^>]*src=["']([^"']*(?:banner|header|logo|form|OSSSC|RRB)[^"']*)["']/i);
  if (headerMatch) {
    header_image = makeAbsUrl(headerMatch[1], targetUrl);
  }

  // 2. Extract Candidate Info (Strictly Isolated to main-info-pnl)
  const candidate_info = {};
  let mainInfoHtml = "";
  const mainInfoIdx = html.indexOf('main-info-pnl');
  if (mainInfoIdx !== -1) {
    const endTableIdx = html.indexOf('</table>', mainInfoIdx);
    mainInfoHtml = html.substring(mainInfoIdx, endTableIdx !== -1 ? endTableIdx + 8 : mainInfoIdx + 3000);
  } else {
    mainInfoHtml = html.substring(0, 5000);
  }

  const trRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>(.*?)<\/td>[\s\S]*?<td[^>]*>(.*?)<\/td>[\s\S]*?<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(mainInfoHtml)) !== null) {
    let k = normText(trMatch[1]).replace(/:$/, '');
    let v = normText(trMatch[2]);
    if (k && v && !k.toLowerCase().includes('note') && !k.includes('*') && !k.match(/^Q\.\d+/i)) {
      candidate_info[k] = v;
    }
  }

  // 3. Extract Section Names
  const section_names = [];
  const secRegex = /<div[^>]*class=["'][^"']*(?:section-lbl|secName|sec-lbl)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let secMatch;
  while ((secMatch = secRegex.exec(html)) !== null) {
    let secTxt = cleanSectionName(secMatch[1]);
    if (secTxt && !section_names.includes(secTxt)) {
      section_names.push(secTxt);
    }
  }

  // 4. Questions & Options Parsing
  const questions = [];
  const section_summary = {};
  let total_right = 0;
  let total_wrong = 0;
  let total_unattempted = 0;

  // Split HTML into question blocks using questionRowTbl
  const qBlocks = html.split(/<table[^>]*class=["'][^"']*questionRowTbl[^"']*["'][^>]*>/i);
  let idx = 1;

  for (let b = 1; b < qBlocks.length; b++) {
    const qBlock = qBlocks[b].split('</table>')[0];

    // Detect Section Name for Question
    let qSecName = section_names.length > 0 ? section_names[0] : "General Section";

    // Question Menu Data (ID, Type, Chosen Option, Option IDs)
    let qId = `Q${idx}`;
    let qType = "MCQ";
    let chosenRaw = null;
    const optIds = {};

    const qIdMatch = qBlock.match(/Question\s*ID\s*:\s*<\/td>\s*<td[^>]*>([^<]+)/i) || qBlock.match(/Question\s*ID\s*:\s*([^<\n\r]+)/i);
    const qTypeMatch = qBlock.match(/Question\s*Type\s*:\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const chosenMatch = qBlock.match(/(?:Chosen|Given)\s*Option\s*:\s*<\/td>\s*<td[^>]*>([^<]+)/i) || qBlock.match(/(?:Chosen|Given)\s*Option\s*:\s*([^<\n\r]+)/i);

    if (qIdMatch) qId = normText(qIdMatch[1]);
    if (qTypeMatch) qType = normText(qTypeMatch[1]);
    if (chosenMatch) chosenRaw = normText(chosenMatch[1]);

    for (let oidx = 1; oidx <= 4; oidx++) {
      const optIdMatch = qBlock.match(new RegExp(`Option\\s*${oidx}\\s*ID\\s*:\\s*<\\/td>\\s*<td[^>]*>([^<]+)`, 'i')) || qBlock.match(new RegExp(`Option\\s*${oidx}\\s*ID\\s*:\\s*([^<\\n\\r]+)`, 'i'));
      if (optIdMatch) optIds[oidx] = normText(optIdMatch[1]);
    }

    // Question Text & Image
    const qTextMatch = qBlock.match(/<td[^>]*class=["'][^"']*bold[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
    const qText = qTextMatch ? normText(qTextMatch[1]) : "";
    const qImgMatch = qBlock.match(/<td[^>]*class=["'][^"']*bold[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i);
    const qImg = qImgMatch ? makeAbsUrl(qImgMatch[1], targetUrl) : "";

    // Options Parsing: Match td.rightAns and td.wrngAns cells
    const options = [];
    let rightPos = null;
    let rightText = "N/A";

    const tdOptRegex = /<td[^>]*class=["'][^"']*(rightAns|wrngAns)[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi;
    let tdOptMatch;
    let optCount = 1;

    while ((tdOptMatch = tdOptRegex.exec(qBlock)) !== null) {
      const isRight = tdOptMatch[1].toLowerCase() === 'rightans';
      const optTdHtml = tdOptMatch[2];
      const optVal = normText(optTdHtml);
      const optImgMatch = optTdHtml.match(/<img[^>]*src=["']([^"']+)["']/i);
      const optImg = optImgMatch ? makeAbsUrl(optImgMatch[1], targetUrl) : "";

      if (isRight) {
        rightPos = optCount;
        rightText = optVal;
      }

      options.push({
        option_no: optCount,
        option_id: optIds[optCount] || null,
        option_text: optVal,
        option_image: optImg,
        option_html: "",
        is_correct: isRight
      });

      optCount++;
    }

    // Fallback if no rightAns/wrngAns classes found
    if (options.length === 0) {
      const trOptRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([1-4]|[A-D])[\.\)]?\s*<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
      let trOptMatch;
      let fallbackCount = 1;

      while ((trOptMatch = trOptRegex.exec(qBlock)) !== null) {
        const optNoStr = trOptMatch[1];
        const optRowHtml = trOptMatch[0];
        const optVal = normText(trOptMatch[2]);
        const optImgMatch = optRowHtml.match(/<img[^>]*src=["']([^"']+)["']/i);
        const optImg = optImgMatch ? makeAbsUrl(optImgMatch[1], targetUrl) : "";
        const isRight = optRowHtml.includes('rightAns') || optRowHtml.includes('tick.png');

        if (isRight) { rightPos = fallbackCount; rightText = optVal; }

        options.push({
          option_no: fallbackCount,
          option_id: optIds[fallbackCount] || null,
          option_text: optVal,
          option_image: optImg,
          option_html: "",
          is_correct: isRight
        });
        fallbackCount++;
      }
    }

    const chosenIndex = chosenToIndex(chosenRaw);
    let status = "Unattempted";
    const chosenOptId = (chosenIndex !== null && optIds[chosenIndex]) ? optIds[chosenIndex] : null;

    if (chosenIndex === null) {
      status = 'Unattempted';
      total_unattempted++;
    } else {
      if (rightPos !== null && chosenIndex === rightPos) {
        status = 'Correct';
        total_right++;
      } else {
        status = 'Wrong';
        total_wrong++;
      }
    }

    // Initialize Section Summary
    if (!section_summary[qSecName]) {
      section_summary[qSecName] = {
        total_questions: 0,
        attempted: 0,
        unattempted: 0,
        correct_answers: 0,
        wrong_answers: 0,
        marks_obtained: 0.0
      };
    }

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
  }

  // Calculate Section Marks
  Object.keys(section_summary).forEach(secKey => {
    const s = section_summary[secKey];
    s.marks_obtained = Math.round((s.correct_answers * 1.0 - s.wrong_answers * 0.25) * 100) / 100;
  });

  const total_attempted = total_right + total_wrong;
  const marks_obtained = Math.round((total_right * 1.0 - total_wrong * 0.25) * 100) / 100;
  const execTime = `${Date.now() - startTime} ms`;

  return {
    success: true,
    fetched_via: "vercel_standalone_pure_nodejs",
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

export default async function handler(req, res) {
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

  // 100% Direct Pure Node.js Fetch with Bright Data Indian ISP Proxy
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

        const parsedData = parseDigialmScorecardPureNode(html, targetUrl, startTime);
        return resolve(res.status(200).json(parsedData));
      });
    }).on('error', (err) => {
      return resolve(res.status(200).json({
        success: false,
        error: "Server processing error or invalid link: " + err.message
      }));
    });
  });
}
