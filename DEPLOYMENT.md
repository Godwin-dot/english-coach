# Déploiement sur un VPS Linux

Ce guide cible Debian ou Ubuntu, un domaine pointant vers le VPS et une instance unique de l’application. Caddy termine TLS; Next.js écoute uniquement sur `127.0.0.1:3000`.

## 1. Préparer le serveur

Configurez le DNS `A` du domaine vers l’adresse du VPS. Si vous publiez un enregistrement `AAAA`, vérifiez également que le VPS est joignable en IPv6. Autorisez les ports TCP 80 et 443 dans le pare-feu du fournisseur et sur le serveur.

Installez Node.js 22 LTS depuis une source officielle, puis Git, SQLite et pnpm :

```bash
sudo apt update
sudo apt install -y git sqlite3 curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@10 --activate
node --version
pnpm --version
```

Créez un compte de service et clonez le dépôt dans le répertoire prévu :

```bash
sudo adduser --system --group --home /var/www/english-coach english-coach
sudo install -d -o english-coach -g english-coach /var/www/english-coach
sudo -u english-coach git clone https://github.com/<votre-compte>/english-coach.git /var/www/english-coach
```

## 2. Configurer les secrets et la base

```bash
cd /var/www/english-coach
sudo -u english-coach cp .env.example .env.local
sudo -u english-coach nano .env.local
```

Pour une instance publique, remplacez les valeurs de développement par un mot de passe fort et un secret aléatoire d’au moins 32 octets. Par exemple, générez séparément les valeurs avec `openssl rand -hex 32`. Ne mettez aucun secret dans `NEXT_PUBLIC_*`, dans le dépôt ou dans les journaux. Les clés des fournisseurs IA peuvent être ajoutées depuis l’interface après le déploiement.

Restreignez l’accès au fichier d’environnement :

```bash
sudo chown english-coach:english-coach .env.local
sudo chmod 600 .env.local
```

Installez les dépendances, appliquez les migrations, insérez les réglages par défaut et construisez l’application :

```bash
sudo -u english-coach pnpm install --frozen-lockfile
sudo -u english-coach pnpm exec drizzle-kit migrate
sudo -u english-coach pnpm db:seed
sudo -u english-coach pnpm build
```

Le seed est idempotent. Les migrations peuvent être rejouées sans recréer les données initiales.

## 3. Installer le service systemd

Vérifiez que pnpm est disponible dans `/usr/bin/pnpm`, puis installez l’unité fournie :

```bash
sudo cp deploy/english-coach.service.example /etc/systemd/system/english-coach.service
sudo systemctl daemon-reload
sudo systemctl enable --now english-coach
sudo systemctl status english-coach
```

Les journaux sont consultables avec :

```bash
sudo journalctl -u english-coach -f
```

Le service charge `.env.local`, s’exécute sous le compte `english-coach` et lie Next.js à `127.0.0.1:3000`. Si votre système installe pnpm ailleurs, adaptez `ExecStart` dans l’unité avant de l’activer.

## 4. Activer HTTPS avec Caddy

Installez Caddy en suivant [les instructions officielles Debian/Ubuntu](https://caddyserver.com/docs/install#debian-ubuntu-raspbian). Copiez `deploy/Caddyfile.example` dans `/etc/caddy/Caddyfile`, puis remplacez `english.example.com` par votre domaine :

```bash
sudo cp deploy/Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

Lorsque le DNS et les ports 80/443 sont accessibles, Caddy obtient et renouvelle automatiquement le certificat TLS. Le HTTPS permet notamment l’usage de la Web Speech API sur mobile.

## 5. Sauvegarder SQLite chaque jour

Le script utilise la commande SQLite `.backup`, qui produit un instantané cohérent même lorsque la base est en mode WAL. Il ne faut jamais remplacer cette méthode par une copie directe de `english.db` pendant que l’application tourne.

Préparez un répertoire privé, rendez le script exécutable et planifiez-le sous le compte de service :

```bash
sudo install -d -o english-coach -g english-coach -m 700 /var/backups/english-coach
sudo chmod 750 /var/www/english-coach/deploy/backup-db.sh
sudo crontab -u english-coach -e
```

Ajoutez cette tâche quotidienne, par exemple à 02:17 :

```cron
17 2 * * * /var/www/english-coach/deploy/backup-db.sh >> /var/backups/english-coach/backup.log 2>&1
```

`backup-db.sh` conserve les 14 sauvegardes les plus récentes. Vérifiez régulièrement la présence des fichiers et testez une restauration sur une base distincte. Pour une reprise après perte du VPS, répliquez aussi les sauvegardes hors serveur dans un stockage privé et chiffré.

Pour contrôler une sauvegarde :

```bash
sqlite3 /var/backups/english-coach/english_<horodatage>.db 'PRAGMA integrity_check;'
```

Pour restaurer, arrêtez le service et restaurez dans un fichier de travail distinct. Vérifiez `integrity_check`, les permissions et la propriété du fichier avant de remplacer la base de production, puis redémarrez le service.

## Mise à jour

Récupérez la version publiée, installez les dépendances, appliquez les migrations, reconstruisez et redémarrez :

```bash
sudo -u english-coach git -C /var/www/english-coach pull --ff-only
sudo -u english-coach pnpm --dir /var/www/english-coach install --frozen-lockfile
sudo -u english-coach pnpm --dir /var/www/english-coach exec drizzle-kit migrate
sudo -u english-coach pnpm --dir /var/www/english-coach build
sudo systemctl restart english-coach
```
