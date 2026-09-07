# Production deployment

Pushing any Git tag starts `.github/workflows/release.yml`. The workflow builds
the application image, publishes it to GitHub Container Registry (GHCR), then
connects to `141.136.47.194` with SSH to pull and start that exact image.

## GitHub configuration

Create a `production` environment and add these environment secrets:

| Secret | Value |
| --- | --- |
| `DEPLOY_SSH_KEY` | Private key for the deployment account on the server. |
| `DEPLOY_SSH_USER` | SSH username on `141.136.47.194`. |
| `DEPLOY_PATH` | Absolute server directory, for example `/opt/fieldbook`. |
| `GHCR_USERNAME` | GitHub username or machine-user username that owns the pull token. |
| `GHCR_PULL_TOKEN` | Fine-grained GitHub PAT with read-only access to this package. |

The default `GITHUB_TOKEN` publishes the image; it is not sent to the server.
If the GHCR package is private, grant the account behind `GHCR_PULL_TOKEN` read
access to the package.

## Server preparation

Install Docker Engine with the Docker Compose plugin. Create the deployment
directory from `DEPLOY_PATH` and add a production `.env` file there. This file
is never copied by the workflow and should contain all runtime values required
by the app, including `DATABASE_URL` and optionally `APP_PORT`.

The workflow copies `docker-compose.production.yml`, logs Docker into GHCR,
runs `docker compose pull`, and then starts the new container. Deploy a release
by creating and pushing a tag, for example `git tag v1.0.0 && git push origin v1.0.0`.
