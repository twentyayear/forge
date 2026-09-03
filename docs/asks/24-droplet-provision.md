# Ask 24 — U0: Provision the alphaecho.io droplet + deploy rail

## Objective
Stand up the WORKHART testing droplet end to end: nginx + TLS serving the current frontend at https://alphaecho.io, a minimal Express API behind `/api` run by systemd, Postgres 16 ready for U1, and a repeatable `ops/deploy.sh`. No app features — this unit is pure rails. The Netlify prototype (workhart.netlify.app, netlify.toml, netlify/functions) is NOT touched.

## Access & facts
- `ssh workhart` → root@137.184.19.44 (Ubuntu 24.04, key `~/.ssh/workhart_do`, already in ~/.ssh/config). Fresh droplet — nothing installed yet.
- DNS: alphaecho.io + www.alphaecho.io already point at the droplet (verified), so certbot will succeed.
- Read `CLAUDE.md` (repo root) first — hard rules apply, especially: never print secrets, commit only when Sam says.

## 1. Droplet provisioning (over ssh, as root)
- `apt update && apt -y upgrade`, then install: `nginx`, `postgresql` (Ubuntu 24.04 ships v16 — verify `psql --version` reports 16.x), `ufw`.
- Node 22 via NodeSource (`deb.nodesource.com/setup_22.x`). Verify `node -v` → v22.x.
- Create user `deploy` (no password login): home `/home/deploy`, copy root's `authorized_keys` to it (same workhart_do pubkey). Verify `ssh deploy@137.184.19.44` works from the Mac BEFORE going further. Do NOT disable root SSH in this unit (lockout risk — deferred to ship-check).
- Scoped sudoers file `/etc/sudoers.d/deploy-workhart` (validate with `visudo -c`):
  `deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart workhart-api, /usr/bin/systemctl status workhart-api`
- App dirs: `/srv/workhart/web` (static frontend) and `/srv/workhart/server`, both owned `deploy:deploy`.
- Postgres: create role `workhart` (login, no superuser) with a password GENERATED ON THE DROPLET (`openssl rand -hex 24` piped straight into psql — never echoed to the terminal, never in chat/logs) and database `workhart` owned by it. Listen on localhost only (default — verify).
- Env file `/etc/workhart/env`, owner `root:deploy`, mode 640, containing `DATABASE_URL=postgres://workhart:<pw>@127.0.0.1:5432/workhart`, `PORT=8790`, `NODE_ENV=production`. Write it in one shell command that interpolates the generated password without printing it.
- ufw: allow `OpenSSH`, `Nginx Full`; enable; everything else denied.

## 2. Repo: minimal API server (`server/`)
- `server/package.json` (private, type module, deps: `express`, `pg`) + `server/index.js`: Express app, `GET /api/health` → `{ ok: true, service: "workhart-api", db: <bool> }` where `db` is a live `SELECT 1` via pg Pool (fail-soft: `db:false` if unreachable, still 200). Listens on `process.env.PORT`. Fail-fast at boot if `DATABASE_URL` is missing.
- `server/.env.example` with placeholder values only. Add `server/.env` and `server/node_modules` to `.gitignore` (create .gitignore if the repo lacks one — check first; do not gitignore anything currently tracked).

## 3. systemd + nginx (on droplet)
- `/etc/systemd/system/workhart-api.service`: runs as `deploy`, `EnvironmentFile=/etc/workhart/env`, `WorkingDirectory=/srv/workhart/server`, `ExecStart=/usr/bin/node index.js`, `Restart=always`, `RestartSec=3`. Enable + start.
- nginx site `alphaecho.io` (+www): `root /srv/workhart/web`, SPA fallback `try_files $uri /index.html`, `location /api/ { proxy_pass http://127.0.0.1:8790; }` with standard proxy headers. Remove the default site. Then `certbot --nginx -d alphaecho.io -d www.alphaecho.io` (redirect HTTP→HTTPS, register with hey@blueroutevineyard.com, agree-tos, non-interactive).

## 4. `ops/deploy.sh` (repo, executable; mirror the planes.fun rsync pattern)
1. Local: `npm run build` (frontend) — abort on failure.
2. `rsync -az --delete dist/ deploy@workhart:/srv/workhart/web/`
3. `rsync -az --delete --exclude node_modules --exclude .env server/ deploy@workhart:/srv/workhart/server/`
4. Remote: `npm ci --omit=dev` in `/srv/workhart/server`, then `sudo systemctl restart workhart-api`.
5. Verify from the script: `curl -fsS https://alphaecho.io/api/health` — print the JSON, non-zero exit if it fails.
Must be idempotent — running it twice in a row succeeds. Use host alias `workhart` is root — use `deploy@137.184.19.44` (or add the rsync target as a variable at the top).
- Also write `docs/DEPLOY.md`: one page — droplet facts, service name, env file location, how to deploy, how to read logs (`journalctl -u workhart-api`).

## Hard rules
- NEVER print the DB password or any secret — not in command output, not in the report. If a command would echo it, redirect or restructure.
- Frontend code, `vite.config.js`, `netlify/`, `netlify.toml`: untouched. The deployed frontend is just today's build.
- Nothing new listens publicly except nginx (80/443) and sshd. Node binds 127.0.0.1 semantics via nginx proxy only (binding 0.0.0.0:8790 is acceptable ONLY if ufw blocks it — verify with the green-light).
- Commit nothing — Sam commits on his word.

## Green-light (run each, report PASS/FAIL with actual output)
```
ssh workhart 'node -v && psql --version && systemctl is-active workhart-api && systemctl is-enabled workhart-api'
ssh deploy@137.184.19.44 'whoami'                                    # deploy
curl -s https://alphaecho.io/api/health                              # {"ok":true,...,"db":true}
curl -s -o /dev/null -w "%{http_code}\n" https://alphaecho.io/       # 200 (the app shell)
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://alphaecho.io/api/health   # 301 → https
curl -s -o /dev/null -w "%{http_code}\n" https://www.alphaecho.io/   # 200 (or 301 to apex)
ssh workhart 'ufw status verbose'                                    # active; only OpenSSH + Nginx Full
ssh workhart "sudo -u postgres psql -Atc \"select datname from pg_database where datname='workhart'\""  # workhart
nc -z -w3 137.184.19.44 8790; echo "port8790:$?"                     # port8790:1 (NOT reachable)
./ops/deploy.sh && ./ops/deploy.sh                                   # both runs succeed (idempotent)
git status --porcelain | grep -c "\.env$"                            # 0 (no real env file staged-able)
```
Report every line PASS/FAIL with the actual output, then stop.
