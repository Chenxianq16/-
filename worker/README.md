# DeepSeek Worker proxy

The browser calls this Worker instead of calling DeepSeek directly. This keeps
the API key out of the public GitHub Pages site.

```powershell
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler deploy
```

The model defaults to `deepseek-chat`. Change `DEEPSEEK_MODEL` in
`wrangler.toml` if your account uses another available model.

`ALLOWED_ORIGIN` is configured in `wrangler.toml` as the exact GitHub Pages
origin. Change it there if you deploy under another domain.

The public endpoint is protected by origin checks, but an origin check is not a
hard security boundary. Keep your Worker URL private if your account has a
limited budget, and add a rate-limiting rule if you later expose the site to
other users.
