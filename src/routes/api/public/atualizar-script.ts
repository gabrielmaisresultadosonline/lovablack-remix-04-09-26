import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/atualizar-script')({
  server: { handlers: { GET: async () => {
    const script = `#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="\${APP_DIR:-/var/www/lovblack}"
REPO="\${REPO:-https://github.com/gabrielmaisresultadosonline/lovablack-remix-04-09-26.git}"
if [[ ! -d "$APP_DIR/.git" ]]; then git clone "$REPO" "$APP_DIR"; else git -C "$APP_DIR" fetch origin main && git -C "$APP_DIR" reset --hard origin/main; fi
exec bash "$APP_DIR/deploy-vps.sh"
`;
    return new Response(script,{headers:{'Content-Type':'text/x-shellscript','Content-Disposition':'attachment; filename="atualizar.sh"','Cache-Control':'no-store'}});
  } } },
});