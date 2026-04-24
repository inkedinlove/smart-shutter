# Admin Security

Smart Shutter now has internal firmware release publishing surfaces. Those actions are privileged and should be treated differently from normal dashboard use.

## MVP Admin Gate

For the MVP, firmware release publishing is protected with:

- `ADMIN_TOKEN` in server environment variables
- `x-admin-token` on `POST /api/firmware/releases`

This is intentionally simple and temporary.

## Important Limits

- `ADMIN_TOKEN` is MVP only.
- It is not stored in the database.
- It should not be returned in server responses.
- It should only be sent from internal/dev tooling when publishing a release.

## Why Release Publishing Is Privileged

Publishing a firmware release affects:

- which binary the Firmware Console presents as the latest active build
- which artifact future OTA or browser flashing flows will attempt to deliver
- the integrity metadata attached to a release

That makes release publishing a privileged operation.

## Production Direction

Production should replace this token gate with real authentication and authorization, for example:

- authenticated sessions
- role-based access control
- audited admin actions
- restricted upload/publish workflows

Long term, firmware release management should sit behind proper auth, not a shared static admin token.
