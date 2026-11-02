# OpenAI Worker proxy

The browser calls this Worker instead of calling OpenAI directly.

```powershell
npx wrangler login
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL
npx wrangler secret put ALLOWED_ORIGIN
npx wrangler deploy
```

`OPENAI_MODEL` must be a model ID available to your OpenAI account.

`ALLOWED_ORIGIN` should be the exact GitHub Pages origin, for example
`https://YOUR_GITHUB_USERNAME.github.io`. For local development, use
`http://127.0.0.1:8080`.

The public endpoint is protected by origin checks, but an origin check is not a
hard security boundary. Keep your Worker URL private if your account has a
limited budget, and add a rate-limiting rule if you later expose the site to
other users.
