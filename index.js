module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    status: "Vercel Serverless DigiALM API Active",
    usage: "/api/digialm?url=YOUR_ANSWER_KEY_URL"
  });
};
