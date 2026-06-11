import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS_FILE = join(BASE_DIR, "tokens.json");
const BASE_URL = "https://projectsapi.zoho.com/api/v3";
const TOKEN_URL = "https://accounts.zoho.com/oauth/v2/token";

class ZohoClient {
  constructor() {
    this._load();
  }

  _load() {
    if (existsSync(TOKENS_FILE)) {
      const data = JSON.parse(readFileSync(TOKENS_FILE, "utf-8"));
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      this.clientId = data.client_id || process.env.ZOHO_CLIENT_ID;
      this.clientSecret = data.client_secret || process.env.ZOHO_CLIENT_SECRET;
    } else {
      this.accessToken = "";
      this.refreshToken = process.env.ZOHO_REFRESH_TOKEN || "";
      this.clientId = process.env.ZOHO_CLIENT_ID;
      this.clientSecret = process.env.ZOHO_CLIENT_SECRET;
    }
  }

  _save() {
    writeFileSync(TOKENS_FILE, JSON.stringify({
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    }, null, 2));
  }

  async _refresh() {
    const params = new URLSearchParams({
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "refresh_token",
    });
    const res = await fetch(`${TOKEN_URL}?${params}`, { method: "POST" });
    const data = await res.json();
    if (!data.access_token) {
      throw new Error(`Error al refrescar token: ${JSON.stringify(data)}`);
    }
    this.accessToken = data.access_token;
    this._save();
  }

  async _request(method, path, body = null) {
    const options = {
      method,
      headers: { Authorization: `Zoho-oauthtoken ${this.accessToken}` },
    };
    if (body) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const url = path.startsWith("/api/")
      ? `https://projectsapi.zoho.com${path}`
      : `${BASE_URL}${path}`;
    let res = await fetch(url, options);
    if (res.status === 401) {
      await this._refresh();
      options.headers.Authorization = `Zoho-oauthtoken ${this.accessToken}`;
      res = await fetch(url, options);
    }
    return res.json();
  }

  get(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    return this._request("GET", qs ? `${path}?${qs}` : path);
  }

  post(path, body)  { return this._request("POST",   path, body); }
  patch(path, body) { return this._request("PATCH",  path, body); }
  delete(path)      { return this._request("DELETE", path); }
}

export const zohoClient = new ZohoClient();
