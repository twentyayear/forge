# Deploy — alphaecho.io (WORKHART testing droplet)

## Droplet facts
- Host: `137.184.19.44` (DigitalOcean, Ubuntu 24.04), DNS: `alphaecho.io` + `www.alphaecho.io`.
- Root SSH: `ssh workhart` (key `~/.ssh/workhart_do`).
- Deploy SSH: `ssh deploy@137.184.19.44` (same key; unprivileged deploy user, scoped sudo).
- Stack: nginx (TLS via certbot, auto-renews) + systemd-managed Node 22 API + Postgres 16 (localhost only).

## Layout on the droplet
- `/srv/workhart/web` — built frontend (static, served by nginx), owned `deploy:deploy`.
- `/srv/workhart/server` — API source (`index.js`, `package.json`, `node_modules`), owned `deploy:deploy`.
- `/etc/workhart/env` — systemd `EnvironmentFile` (`DATABASE_URL`, `PORT=8790`, `NODE_ENV=production`). Owner `root:deploy`, mode `640`. Never edit this from a deploy script — it's provisioned once and holds the generated Postgres password.
- `/etc/systemd/system/workhart-api.service` — runs the API as `deploy`, `Restart=always`.
- `/etc/nginx/sites-available/alphaecho.io` — nginx site: serves `/srv/workhart/web` with SPA fallback, proxies `/api/` to `127.0.0.1:8790`.
- `/etc/sudoers.d/deploy-workhart` — lets `deploy` run `systemctl restart|status workhart-api` as root, nothing else.

## Deploying
```
./ops/deploy.sh
```
This builds the frontend locally, rsyncs `dist/` to `/srv/workhart/web` and `server/` to `/srv/workhart/server`, runs `npm ci --omit=dev` on the droplet, restarts `workhart-api`, then curls `https://alphaecho.io/api/health` and fails the script if it doesn't come back `ok:true`. Safe to run repeatedly (idempotent).

Override the target with `WORKHART_DEPLOY_TARGET=deploy@137.184.19.44 ./ops/deploy.sh` if needed (defaults to that value already).

## Logs
```
ssh workhart 'journalctl -u workhart-api -n 100 --no-pager'
ssh workhart 'journalctl -u workhart-api -f'          # follow
ssh workhart 'systemctl status workhart-api'
```

## Postgres
- Role `workhart` (login, no superuser), database `workhart`, owned by that role.
- Listens on `127.0.0.1:5432` only.
- Password lives only in `/etc/workhart/env` on the droplet — never in this repo, chat, or logs.

## Firewall
`ufw` allows only `OpenSSH` and `Nginx Full` (80/443). Everything else denied. Node listens on `8790` but is not reachable externally (nginx-proxy only; verify with `nc -z -w3 137.184.19.44 8790`, expect closed).

## TLS
Let's Encrypt via `certbot --nginx`, covers `alphaecho.io` + `www.alphaecho.io`, HTTP redirects to HTTPS, auto-renews via certbot's systemd timer.
