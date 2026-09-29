// PostToolUse (Edit|Write): formata com Prettier o arquivo editado, se for src/**/*.{ts,tsx,css}.
// Nunca bloqueia: qualquer falha termina com exit 0.
import { spawnSync } from "node:child_process";
import path from "node:path";

try {
  const input = JSON.parse(await new Response(process.stdin).text());
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const filePath = input.tool_input?.file_path;
  if (filePath) {
    const rel = path.relative(root, path.resolve(root, filePath)).split(path.sep).join("/");
    const eligible =
      rel.startsWith("src/") &&
      /\.(ts|tsx|css)$/.test(rel) &&
      !rel.startsWith("src/integrations/supabase/") &&
      path.basename(rel) !== "routeTree.gen.ts";
    if (eligible) {
      spawnSync("bunx", ["prettier", "--write", rel], {
        cwd: root,
        stdio: "ignore",
        timeout: 25_000,
      });
    }
  }
} catch {
  // falha silenciosa
}
process.exit(0);
