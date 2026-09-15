# Running the manual publisher

For Render hosting, use the [Render setup guide](render.md), which includes the HTTPS gateway and operator authentication. The hosting instructions below describe running your own server.

The publisher reuses the source preview and adds explicit Publish, Retry, and Retract actions. Inspecting a post does not publish it. Publication is bound to the inspected post CID; if the post or source evidence changes before confirmation, inspect again. Quoted sources still contribute to the submitted outer post.

## Before public operation

Use a dedicated Bluesky account for News Quality. Choose a stable HTTPS hostname for the labeler service and a machine that can run Node.js 24 continuously. The operator interface remains on loopback and can be reached remotely through an SSH tunnel. The public service serves signed labels; it does not serve the operator page or private evidence.

The [Skyware setup guide](https://skyware.js.org/guides/labeler/introduction/getting-started/) describes registering the account, its signing key, and the HTTPS endpoint. Run its interactive setup yourself in a terminal:

```sh
npx @skyware/labeler@0.2.0 setup
```

Setup changes the account's labeler identity and requires an email confirmation. Save the generated private signing key locally; do not paste it into an issue, chat, or commit. This repository does not automatically register an account or publish its declarations.

Create the three definitions listed in [label-definitions.json](../data/label-definitions.json), either during setup or with `npx @skyware/labeler@0.2.0 label add`. For each, choose informational severity, no blurring, no adult restriction, and the default “Warn” preference. “Warn” is the protocol preference that displays the informational label; with `blurs: none`, it does not blur or hide the post. Subscribers retain control over their own preferences.

## Start the service

Provide `LABELER_DID` and `LABELER_SIGNING_KEY` through the process environment or a local `.env` file. The file is ignored by Git and consumed directly by Node. Optionally set `LABELER_STATE_DIR` to an absolute durable directory. The default is `.state` under the checkout; do not use a disposable worktree or cache directory for a public service.

```sh
npm ci
npm run start:publisher
```

The private operator page is http://localhost:4317. The protocol server listens on 127.0.0.1:4319. Run one publisher process per database; both listening ports are fixed for this pilot. `npm start` remains the credentials-free, transient preview and provides no publication controls.

Configure a reverse proxy for the registered hostname. Expose only the label query, label subscription, and health routes on port 4319. Do not proxy port 4317 publicly. For example, substitute the actual hostname in this Caddy configuration:

```caddyfile
labels.example.org {
    @labeler {
        method GET
        path /xrpc/com.atproto.label.queryLabels /xrpc/com.atproto.label.subscribeLabels /xrpc/_health
    }
    reverse_proxy @labeler 127.0.0.1:4319
    respond 404
}
```

The upstream library's remote label-writing authorization is disabled as well. All publication decisions originate in the private operator page, whose write requests require the page's CSRF token and matching Origin header.

For a remote host, access the operator page through a tunnel:

```sh
ssh -L 4317:127.0.0.1:4317 user@your-server
```

## Pilot verification

Subscribe to the labeler from a separate Bluesky account. Inspect a test post in the operator page, check the proposed categories and source evidence, and click Publish labels. The history reports acceptance by the labeler service, not confirmed display in Bluesky. Check both the public query endpoint and the post as viewed by the subscriber. Confirm the informational label appears without blurring or hiding.

Then click Retract labels and verify that the label disappears for the subscriber after propagation. Retraction is a signed negation, not deletion of history and not a claim that the opposite category applies. A post may be retracted even if it is no longer publicly readable.

Live account registration, public HTTPS reachability, AppView ingestion, and subscriber display remain checks to perform with the chosen account and host; local tests cannot establish them.

## Persistence and recovery

Keep `.state/labels.db` and its SQLite WAL companions. The same database holds the signed label history, immutable publication evidence, and delivery progress. It is bound to the configured identity and signing key; changing either requires a deliberate migration, not reusing the database with new credentials. Back up the directory while the process is stopped, and store the signing key separately. Do not delete the database to clear a label.

An interrupted operation stays Pending. Some labels may already have reached the service. Retry finishes the saved operation; it does not reassess a changed post. A saved signed event is recognized on replay even if the process stopped before recording delivery progress. Finish a pending operation before publishing or retracting another decision for that post. Failed operations are never silently retried at startup.

Unpublished reviews are temporary: they expire after fifteen minutes, disappear on restart, and only the most recent hundred are retained. Published decisions and evidence remain in the database. Automatic ingestion, automatic reclassification on dataset updates, and subscriber-display monitoring are outside this pilot.
