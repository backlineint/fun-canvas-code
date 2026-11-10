# Deploying to Upsun

The Drupal site (`site/`) deploys to Upsun from this repository. The site's
configuration, including the Canvas components and the room template, lives in
`site/config/sync`, so no database is transferred. The slide deck (`slides/`) is a
static build that you host separately.

What is set up in the repo:

| File | Purpose |
| --- | --- |
| `.upsun/config.yaml` | One PHP 8.4 app (project root `site/`), MariaDB 11.8, file mounts, and a deploy hook that runs `drush deploy` |
| `site/web/sites/default/settings.php` | Committed (no secrets). Sets the config sync directory and includes the Upsun settings on Upsun only |
| `site/web/sites/default/settings.upsun.php` | Reads the database, salt and trusted hosts from Upsun |
| `site/config/services.upsun.yml` | Production CORS rules |
| `site/config/sync/` | The exported configuration |

## First deploy (one time)

1. Sign in and create the project.

   ```bash
   upsun login
   upsun project:create
   ```

   Add the project as a git remote when asked (it is named `upsun`).

2. Push. The build installs Composer dependencies. The deploy hook will say the site is not
   installed yet, which is expected.

   ```bash
   git push upsun main
   ```

3. Set the presenter key. Use the same value as `VITE_PRESENTER_KEY` for the deck. Without it,
   delivering requests and reporting slides return a 503.

   ```bash
   upsun variable:create --level environment --environment main --name env:FUN_ROOM_PRESENTER_KEY --value 'a-long-random-string' --sensitive true --visible-build false
   ```

4. Install Drupal from the exported configuration, then log in.

   ```bash
   upsun ssh -A drupal
   vendor/bin/drush site:install --existing-config --account-name=admin -y
   vendor/bin/drush user:login
   ```

   The export has no install profile (Drupal CMS removes its installer after installing). If
   `--existing-config` refuses to run without one, try
   `vendor/bin/drush site:install minimal --existing-config`, then `vendor/bin/drush config:import -y`.
   If the import complains about the site UUID, set it to the local one:
   `vendor/bin/drush config:set system.site uuid ea632d1e-b2a8-4fee-9262-5f02678f9e73 -y`.

5. Create a room (as you do locally) and open it on a phone.

## Every later deploy

`git push upsun main` builds and runs `drush deploy`: database updates, config import, cache
rebuild. After changing configuration in the admin UI, run `drush config:export` locally and commit
`site/config/sync`, otherwise the next deploy overwrites the change.

### Changing a Canvas component

The components and the room template are part of the exported config (each component's source and
compiled code are in `site/config/sync/canvas.js_component.*.yml`), so the install in step 4 already
brings them over. Do not `canvas push` to the live site as part of the normal flow: the next
`drush deploy` would overwrite what you pushed with the committed config.

1. Edit the component and run `npm run canvas -- push -y` in `fun-canvas-project` against the local site.
2. Run `ddev drush cex -y` and commit the changed files in `site/config/sync`.
3. `git push upsun main`.

Pushing straight to the live site (a Canvas OAuth client, its `CANVAS_*` values in
`.env.local`, and the server's OAuth keys) is only a fallback if a component fails to import.

## The slide deck

Build it with the live site's origin and the same key, then upload `slides/dist` to any static host:

```bash
cd slides
VITE_ROOM_API=https://your-site.upsun.app VITE_PRESENTER_KEY='a-long-random-string' pnpm build
```

If the deck is on a different domain from the site, add its origin to `allowedOrigins` in
`site/config/services.upsun.yml` and push. (The key is visible in the built deck's JavaScript, so
keep the deck's address to yourself and change the key after the talk.)

## Before the talk

Run a rehearsal on the live site with a few phones: join, rate, comment, request, deliver. Delete the
test room afterwards.
