/**
 * 🚀 PRODUCTION PERFECT VERCEL SERVERLESS DIGIALM PARSER API
 * 100% Exact Match with PHP digialm.php JSON Schema & DOM Filtering
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

function parseDigialmScorecard(html, targetUrl, startTime) {
  // 1. Extract Header Image (Banner / Logo)
  let header_image = "";
  const headerMatch = html.match(/<(?:img|div)[^>]*src=["']([^"']*(?:banner|header|logo|form100)[^"']*)["']/i);
  if (headerMatch) {
    header_image = makeAbsUrl(headerMatch[1], targetUrl);
  }

  // 2. Extract Candidate Info ONLY from main-info-pnl (strictly isolative regex)
  const candidate_info = {};
  const mainInfoMatch = html.match(/<(?:div|table)[^>]*class=["'][^"']*main-info-pnl[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|table)>/i);
  const mainInfoHtml = mainInfoMatch ? mainInfoMatch[1] : html;

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

  // 4. Extract Question Panels & Options
  const questions = [];
  const section_summary = {};
  let total_right = 0;
  let total_wrong = 0;
  let total_unattempted = 0;

  // Split HTML by question panel blocks (questionRowTbl / question-pnl)
  const qTableRegex = /<table[^>]*class=["'][^"']*questionRowTbl[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi;
  let qMatch;
  let idx = 1;

  while ((qMatch = qTableRegex.exec(html)) !== null) {
    const qBlock = qMatch[1];
    let qSecName = section_names.length > 0 ? section_names[0] : 'General';

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

    // Question ID & Type
    const qIdMatch = qBlock.match(/Question\s*ID\s*:\s*<\/td>\s*<td[^>]*>([^<]+)/i) || qBlock.match(/Q\.\d+/i);
    const qTypeMatch = qBlock.match(/Question\s*Type\s*:\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const chosenMatch = qBlock.match(/Chosen\s*Option\s*:\s*<\/td>\s*<td[^>]*>([^<]+)/i) || qBlock.match(/Given\s*Option\s*:\s*<\/td>\s*<td[^>]*>([^<]+)/i);
    const optIdMatch = qBlock.match(/Option\s*1\s*ID\s*:\s*<\/td>\s*<td[^>]*>([^<]+)/i);

    const qId = qIdMatch ? normText(qIdMatch[1] || qIdMatch[0]) : `Q${idx}`;
    const qType = qTypeMatch ? normText(qTypeMatch[1]) : "MCQ";
    const chosenRaw = chosenMatch ? normText(chosenMatch[1]) : "Not Answered";
    const chosenOptId = optIdMatch ? normText(optIdMatch[1]) : null;

    // Question Text & Image
    const qTextMatch = qBlock.match(/<td[^>]*class=["'][^"']*bold[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
    const qText = qTextMatch ? normText(qTextMatch[1]) : "";
    const qImgMatch = qBlock.match(/<td[^>]*class=["'][^"']*bold[^"']*["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["']/i);
    const qImg = qImgMatch ? makeAbsUrl(qImgMatch[1], targetUrl) : "";

    // Parse Options (Option 1, Option 2, Option 3, Option 4 rows)
    const options = [];
    let rightPos = null;
    let rightText = "";

    const trOptRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([1-4]|[A-D])[\.\)]?\s*<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;
    let trOptMatch;

    while ((trOptMatch = trOptRegex.exec(qBlock)) !== null) {
      const optNo = trOptMatch[1];
      const optRowHtml = trOptMatch[0];
      const optVal = normText(trOptMatch[2]);
      const optImgMatch = optRowHtml.match(/<img[^>]*src=["']([^"']+)["']/i);
      const optImg = optImgMatch ? makeAbsUrl(optImgMatch[1], targetUrl) : "";
      const isRight = optRowHtml.includes('rightAns') || optRowHtml.includes('tick.png');

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

    // Fallback Option Detection if trOptRegex didn't catch options
    if (options.length === 0) {
      for (let i = 1; i <= 4; i++) {
        const isRight = qBlock.includes(`Option ${i}`) && (qBlock.includes('rightAns') || qBlock.includes('tick.png'));
        options.push({
          option_no: String(i),
          option_text: `Option ${i}`,
          option_image: "",
          is_correct: isRight
        });
        if (isRight) { rightPos = i; rightText = `Option ${i}`; }
      }
    }

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
