// WebApp.gs — Serves the Flow sidebar as a Web App

var NIKSEN_API_URL = 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/gmail-addon';

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('sidebar')
    .setTitle('Flow')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── Server-side functions called from sidebar HTML ─────────────────

function getApiUrl() {
  return NIKSEN_API_URL;
}

function getUserEmail() {
  return Session.getActiveUser().getEmail();
}

function getOAuthToken() {
  return ScriptApp.getOAuthToken();
}

function apiCall(method, path, body) {
  var token = ScriptApp.getOAuthToken();
  var email = Session.getActiveUser().getEmail();
  var options = {
    method: method,
    headers: {
      'X-User-Email': email,
      'X-Gmail-Access-Token': token,
    },
    muteHttpExceptions: true,
  };
  if (body) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  var res = UrlFetchApp.fetch(NIKSEN_API_URL + path, options);
  return JSON.parse(res.getContentText());
}