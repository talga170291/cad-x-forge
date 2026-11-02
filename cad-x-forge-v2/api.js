// Общий клиент API для магазина и админки. Telegram initData передаётся в заголовке; сервер проверяет подпись.
(function () {
  var TG = window.Telegram && window.Telegram.WebApp;
  window.cfxApi = async function (path, opt) {
    opt = opt || {};
    var h = Object.assign({}, opt.headers || {});
    if (TG && TG.initData) h.Authorization = 'tma ' + TG.initData;
    var body = opt.body;
    if (body && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) { body = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    var r;
    try { r = await fetch(window.CFX.API + path, { method: opt.method || 'GET', headers: h, body: body }); }
    catch (e) { throw { code: 'network' }; }
    var j = null; try { j = await r.json(); } catch (e) { /* not json */ }
    if (!r.ok) throw { code: (j && j.error && j.error.code) || 'server_error', status: r.status, details: j && j.error && j.error.details };
    return j;
  };
  window.cfxUrl = function (p) { return p && p.charAt(0) === '/' ? window.CFX.API + p : p; };
})();
