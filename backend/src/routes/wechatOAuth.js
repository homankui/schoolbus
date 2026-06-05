/**
 * 微信公众号 OAuth 网页授权路由
 *
 * 流程：
 * 1. GET /api/wechat/app-id        → 前端获取 AppID（避免硬编码）
 * 2. GET /api/wechat/oauth-callback → 微信回调，用 code 换 openid，跳回原始页面
 */

const express = require('express');
const router = express.Router();

// ════════════════════════════════════════════════════════
// 1. 暴露 AppID 给前端（不暴露 AppSecret）
// ════════════════════════════════════════════════════════
router.get('/api/wechat/app-id', (req, res) => {
  const appId = (process.env.WECHAT_APP_ID || '').trim();
  res.json({ appId: appId || null });
});

// ════════════════════════════════════════════════════════
// 2. OAuth 回调 —— code 换 openid
// ════════════════════════════════════════════════════════
router.get('/api/wechat/oauth-callback', async (req, res) => {
  const { code, state } = req.query;

  // 未收到 code，返回错误提示
  if (!code) {
    res.status(400).type('html').send(`<html><body style="font-family:sans-serif;padding:24px;text-align:center"><h2>授权失败</h2><p>未收到微信授权码，请从公众号菜单重新进入。</p></body></html>`);
    return;
  }

  const appId     = (process.env.WECHAT_APP_ID || '').trim();
  const appSecret = (process.env.WECHAT_APP_SECRET || '').trim();

  if (!appId || !appSecret) {
    res.status(500).type('html').send(`<html><body style="font-family:sans-serif;padding:24px;text-align:center"><h2>系统配置错误</h2><p>微信凭证未配置，请联系管理员。</p></body></html>`);
    return;
  }

  try {
    // 用 code 换取 openid
    const tokenUrl = `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}&grant_type=authorization_code`;
    const resp = await fetch(tokenUrl);
    const data = await resp.json();

    if (!resp.ok || data.errcode) {
      console.error('[wechat-oauth] token exchange failed:', data);
      res.status(502).type('html').send(`<html><body style="font-family:sans-serif;padding:24px;text-align:center"><h2>授权失败</h2><p>微信服务异常，请稍后重试。</p></body></html>`);
      return;
    }

    const openid = data.openid;

    // 解码原始页面路径（state 参数），跳回并带上 openid
    let targetPath = '/parent-home.html';
    if (state) {
      try {
        targetPath = decodeURIComponent(state);
      } catch {
        targetPath = state;
      }
    }

    // 给目标 URL 拼接 openid
    const sep = targetPath.includes('?') ? '&' : '?';
    const redirectUrl = `${targetPath}${sep}openid=${encodeURIComponent(openid)}`;

    console.log('[wechat-oauth]', { openid: openid.substring(0, 6) + '...', redirect: redirectUrl });
    res.redirect(302, redirectUrl);
  } catch (err) {
    console.error('[wechat-oauth] error:', err);
    res.status(500).type('html').send(`<html><body style="font-family:sans-serif;padding:24px;text-align:center"><h2>系统错误</h2><p>授权处理失败，请稍后重试。</p></body></html>`);
  }
});

module.exports = router;
