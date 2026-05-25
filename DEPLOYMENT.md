# Deploying Empire RPG to rpg.tsipenios.gr/empire

Target: serve the built React app at **https://rpg.tsipenios.gr/empire** via nginx on a Raspberry Pi, with the Pi pulling from this GitHub repo.

## Architecture

- GitHub holds the source. Pushing to `main` is the trigger for a deploy.
- The Pi clones the repo, builds with `npm run build`, and serves the resulting `dist/` folder via nginx.
- Supabase is the backend (cloud-hosted). The Pi serves only the static frontend — there is no Node.js server running in production.
- HTTPS is handled by the existing Let's Encrypt cert for `rpg.tsipenios.gr`. The cert is for the whole domain, so `/empire` is automatically HTTPS.

The two app-side changes that make subpath hosting work:
- `base: '/empire/'` in `vite.config.ts` — prefixes all built asset URLs with `/empire/`
- `basename="/empire"` on `<BrowserRouter>` in `src/App.tsx` — tells React Router that everything after `/empire` is the app's URL space

## One-time setup on the Pi

### 1. Prerequisites

SSH into your Pi and check Node.js version (need >= 20 for Vite 8):

```bash
node --version
```

If not installed or too old, install Node.js 22 LTS via NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # should show v22.x
```

### 2. Clone the repo

```bash
mkdir -p ~/projects
cd ~/projects
git clone https://github.com/beowulf-gr/empire-rpg.git
cd empire-rpg
```

### 3. Create .env.local with your Supabase credentials

The `.env.local` file is gitignored so the Supabase keys don't sit in the public repo. On the Pi, create it manually with the same values as your Windows machine:

```bash
cat > .env.local << 'EOF'
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your-publishable-key>
EOF
```

### 4. First build to make sure everything works

```bash
npm ci           # installs exact versions from package-lock.json (~2-5 min on a Pi)
npm run build    # produces dist/ folder (~30s-2min)
ls dist/         # should show index.html, assets/, etc.
```

If `npm ci` runs out of memory on a Pi with under 2 GB RAM, add a swap file (see Troubleshooting below).

### 5. Create the deploy script

```bash
cat > ~/projects/empire-rpg/deploy.sh << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

echo "==> Pulling latest from GitHub"
git pull --ff-only origin main

echo "==> Installing dependencies (npm ci is faster + stricter than install for deploys)"
npm ci

echo "==> Building production bundle"
npm run build

# Adjust DOCROOT to wherever your nginx serves rpg.tsipenios.gr from.
# Find it with:  sudo nginx -T | grep -E '(server_name|root)'
DOCROOT=/var/www/rpg.tsipenios.gr
TARGET="$DOCROOT/empire"

echo "==> Syncing dist/ to $TARGET"
sudo mkdir -p "$TARGET"
sudo rsync -a --delete dist/ "$TARGET/"

echo "==> Done. Empire RPG is live at https://rpg.tsipenios.gr/empire/"
EOF

chmod +x ~/projects/empire-rpg/deploy.sh
```

The `--delete` flag in rsync ensures stale files from previous deploys are cleaned up (otherwise you'd accumulate old hashed JS bundles forever).

If the deploy needs `sudo` to write to the docroot, you'll either be prompted for a password each time, or you can grant the pi user passwordless sudo just for `rsync` and `mkdir` via a `/etc/sudoers.d/` entry. Optional — only worth doing if you set up automated deploys later.

## Nginx configuration

Find the existing server block for `rpg.tsipenios.gr`:

```bash
sudo grep -rl rpg.tsipenios.gr /etc/nginx/
# probably /etc/nginx/sites-available/rpg.tsipenios.gr or /etc/nginx/conf.d/...
```

Edit that file with `sudo nano <path>` and add this `location` block inside the `server { ... }` block listening on port 443:

```nginx
# Empire RPG (SPA built with Vite, served at /empire/)
location /empire/ {
    alias /var/www/rpg.tsipenios.gr/empire/;
    try_files $uri $uri/ /empire/index.html;
}

# Redirect /empire (no trailing slash) to /empire/
location = /empire {
    return 301 /empire/;
}
```

The `try_files ... /empire/index.html` line is the **SPA fallback** — any URL under `/empire` that doesn't match a real file (like `/empire/realms/123`) is served the React app's `index.html`, and React Router takes over client-side. Without this, a page reload on `/empire/realms/123` returns 404.

Validate config and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Supabase Auth: whitelist the new URLs

In the Supabase dashboard for your project:

1. Go to **Authentication** -> **URL Configuration**
2. **Site URL**: set to `https://rpg.tsipenios.gr/empire` (or leave it — Supabase mainly uses Redirect URLs)
3. **Redirect URLs** — add both:
   - `https://rpg.tsipenios.gr/empire`
   - `https://rpg.tsipenios.gr/empire/**`

Save. Without these, login flows will fail with "redirect URL not allowed".

## First deploy

From the Pi:

```bash
cd ~/projects/empire-rpg
./deploy.sh
```

Then in a browser visit https://rpg.tsipenios.gr/empire and verify:

- The home page loads.
- You can sign up / log in.
- You can create a realm.
- A deep link like https://rpg.tsipenios.gr/empire/realms reloads correctly (this is the SPA fallback test).

## Day-to-day workflow

When you make changes on your Windows machine:

```powershell
# On Windows
git add .
git commit -m "Describe what changed"
git push origin main
```

Then on the Pi (one command, takes ~1-3 min for a typical build):

```bash
ssh pi@<your-pi>
~/projects/empire-rpg/deploy.sh
```

If you're not on the same network as the Pi, you'll need it reachable over the internet (port forwarding, Tailscale, etc.) — but since the worldbuilder already works publicly, that's presumably already sorted.

## Optional: webhook-triggered deploys

If you'd rather not SSH after every push, set up a GitHub webhook that hits a tiny listener on your Pi (e.g. [adnanh/webhook](https://github.com/adnanh/webhook)) which runs `deploy.sh`. That's roughly 30 min of one-time setup and worth doing once you push more than a couple of times a week.

## Troubleshooting

**404 on /empire/realms after page reload**
The SPA fallback `try_files` line in nginx isn't catching. Check that the last fallback is `/empire/index.html` (absolute path, leading slash). Also check `sudo nginx -t` and that nginx was actually reloaded.

**Login redirects to localhost, or session never establishes**
Supabase Auth redirect URLs aren't whitelisted. See the "Supabase Auth" section above.

**Assets 404 with paths like `/assets/index-abc.js` (missing `/empire` prefix)**
`base: '/empire/'` isn't set in `vite.config.ts`, or you forgot to rebuild after changing it. Rebuild with `npm run build` and redeploy.

**`npm ci` dies with "JavaScript heap out of memory" on a small Pi**
Add a 1 GB swap file:

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=1024
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Then retry. As a last resort you can build on a beefier machine and just rsync `dist/` to the Pi.

**Worldbuilder at /worldbuilder/ stops working after I add the /empire/ block**
You probably edited the wrong `server { ... }` block, or the worldbuilder relies on a top-level `try_files` that now competes with `/empire`. Run `sudo nginx -T` and confirm both `location /worldbuilder/` and `location /empire/` are inside the same `server` block listening on 443 with `server_name rpg.tsipenios.gr`.

**Local dev (`npm run dev`) shows a blank page**
Vite dev server also serves at the base path now — open `http://localhost:5173/empire/` instead of `http://localhost:5173/`.
