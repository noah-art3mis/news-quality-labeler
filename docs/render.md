# Deploy on Render

This runs the manual publisher as one Render web service: a password-protected operator page and public, read-only Bluesky label endpoints. You can use Render’s supplied HTTPS address; no separate domain or reverse proxy is needed. Publication still requires inspecting a post and clicking Publish.

## Create the service

1. Sign in to [Render](https://dashboard.render.com/), choose **New → Blueprint**, and connect `noah-art3mis/news-quality-labeler` on `main`.
2. Render reads [render.yaml](../render.yaml). When prompted for `LABELER_ENABLED`, enter `false`. Review the cost before creating resources: the blueprint selects a paid web service and a 1 GB persistent disk. The free service cannot supply this durable disk. See [Render’s disk documentation](https://render.com/docs/disks).
3. Deploy and copy the service’s actual `https://…onrender.com` URL. Visit `/healthz`; it should report `setup-required` and the deployed Git revision.
4. In the service’s Environment settings, reveal the generated `ADMIN_PASSWORD` and save it in your password manager. Open the service URL and sign in with username `admin` and that password. You should see the setup page. This password is separate from your Bluesky password.

The blueprint leaves `LABELER_ENABLED` under dashboard control (`sync: false`) so subsequent blueprint syncs do not reset an enabled service to setup mode. Render supplies `PORT`, `RENDER_EXTERNAL_URL`, and `RENDER_GIT_COMMIT`; do not replace them. The configured HTTPS origin controls operator access and CSRF validation.

## Register the labeler

Run this yourself in a local terminal, following the [Skyware setup guide](https://skyware.js.org/guides/labeler/introduction/getting-started/):

```sh
npx @skyware/labeler@0.2.0 setup
```

Use the dedicated `news-quality.bsky.social` account and the exact HTTPS service URL from Render. Complete the email confirmation. Save the generated private signing key in your password manager; do not paste it into chat or GitHub.

Add all three definitions from [label-definitions.json](../data/label-definitions.json), during setup or with `npx @skyware/labeler@0.2.0 label add`. Preserve the identifiers and descriptions. Select informational severity, no blurring, no adult restriction, and default preference **Warn**, which displays these informational labels without obscuring the post.

## Enable and verify

1. In Render’s Environment settings, add `LABELER_SIGNING_KEY` with the generated key and change `LABELER_ENABLED` to `true`. Save and deploy. The blueprint already sets the account DID and persistent state directory.
2. Check `/healthz` reports `ready`. Open the main URL using the operator password; the preview now includes publishing controls.
3. Subscribe to the labeler from a separate Bluesky account. Inspect a test post, publish its proposed labels, and verify the public query endpoint and the subscriber’s view. Then retract and check disappearance after propagation. Follow [pilot verification](publisher-setup.md#pilot-verification); a healthy server alone does not establish Bluesky ingestion or display.

Public GET routes are `/xrpc/com.atproto.label.queryLabels`, `/xrpc/com.atproto.label.subscribeLabels` (including WebSocket upgrades), `/xrpc/_health`, and the deployment health endpoint `/healthz`. Other requests require the operator password. Internal services listen only on loopback. The operator’s write requests also require a matching Origin and CSRF token.

## Keep state durable

Run one instance with the mounted disk. `/var/data/news-quality` contains the SQLite label history, publication evidence, and pending operations. Preserve the entire directory and keep the signing key separately. Do not delete the disk or change the configured identity/key to troubleshoot a failed deployment. See [persistence and recovery](publisher-setup.md#persistence-and-recovery) for backup and retry semantics.

Render disks persist across deploys but bring brief deployment downtime and prevent horizontal scaling; see [disk limitations](https://render.com/docs/disks). Dataset downloads remain checksum-verified and can be recreated after a deploy. A failed health check prevents readiness; setup mode intentionally returns healthy without starting publication or loading the dataset.

The repository’s automated tests exercise authentication, CSRF, real label delivery over WebSockets, and setup startup locally. Initial Render creation, account registration, public HTTPS reachability, and subscriber display require the manual checks above.
