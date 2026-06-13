const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://demo-api.binance.com',
      changeOrigin: true,
      secure: true,
    })
  );

  app.use(
    '/fapi',
    createProxyMiddleware({
      target: 'https://demo-fapi.binance.com',
      changeOrigin: true,
      secure: true,
    })
  );
};
