#!/usr/bin/env node
/**
 * Remove apenas arquivos *.tar.gz no primeiro nível do diretório de backup
 * (ex.: /hdds/backup/*.tar.gz), sem recursão. Não mexe em webapp/ nem sync/.
 *
 * Uso (a partir de backend/): node scripts/cleanup-legacy-root-targz.mjs [--backup-root DIR] [--prune-history] [--yes]
 *
 * Sem --yes: apenas lista o que seria removido (dry-run).
 * Com --yes: apaga os arquivos listados.
 * --prune-history: remove entradas em data/backup-folders.json cujo archivePath
 *   aponta para um desses arquivos (após --yes).
 */

import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, "..");
const defaultSettingsPath = path.join(backendRoot, "data", "backup-settings.json");
const defaultHistoryPath = path.join(backendRoot, "data", "backup-folders.json");

function normalizeFsPath(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const withForwardSlashes = trimmed.replace(/\\/g, "/");
  const collapsed = withForwardSlashes.replace(/\/{2,}/g, "/");
  return path.resolve(collapsed);
}

function parseArgs(argv) {
  let backupRoot = "";
  let yes = false;
  let pruneHistory = false;
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--yes") {
      yes = true;
    } else if (a === "--prune-history") {
      pruneHistory = true;
    } else if (a === "--backup-root" && argv[i + 1]) {
      backupRoot = argv[i + 1];
      i += 1;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage: node scripts/cleanup-legacy-root-targz.mjs [--backup-root DIR] [--prune-history] [--yes]
  --backup-root  Raiz de backup (default: backupMountPath em data/backup-settings.json)
  --yes          Confirma exclusão (sem isso, apenas dry-run)
  --prune-history  Após apagar, remove entradas do histórico que apontavam para esses arquivos`);
      process.exit(0);
    } else {
      console.error(`Argumento desconhecido: ${a}`);
      process.exit(1);
    }
  }
  return { backupRoot, yes, pruneHistory };
}

async function readBackupRootFromSettings() {
  try {
    const raw = await readFile(defaultSettingsPath, "utf-8");
    const parsed = JSON.parse(raw);
    const p = normalizeFsPath(parsed?.backupMountPath ?? "");
    return p;
  } catch {
    return "";
  }
}

async function listTopLevelTargz(backupRootResolved) {
  const names = await readdir(backupRootResolved);
  return names.filter((n) => n.toLowerCase().endsWith(".tar.gz"));
}

async function pruneHistoryForPaths(absolutePathsToRemove) {
  const removeSet = new Set(absolutePathsToRemove.map((p) => normalizeFsPath(p)));
  let raw;
  try {
    raw = await readFile(defaultHistoryPath, "utf-8");
  } catch (err) {
    console.warn("Não foi possível ler backup-folders.json:", err.message);
    return { removed: 0 };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.warn("backup-folders.json inválido; histórico não alterado.");
    return { removed: 0 };
  }
  const history = Array.isArray(data.backupHistory) ? data.backupHistory : [];
  const nextHistory = history.filter((entry) => {
    const ap = normalizeFsPath(entry.archivePath ?? "");
    return !removeSet.has(ap);
  });
  const removed = history.length - nextHistory.length;
  if (removed > 0) {
    await writeFile(
      defaultHistoryPath,
      JSON.stringify({ ...data, backupHistory: nextHistory }, null, 2),
      "utf-8",
    );
  }
  return { removed };
}

async function main() {
  const { backupRoot: argRoot, yes, pruneHistory } = parseArgs(process.argv);
  const resolvedRoot = normalizeFsPath(argRoot || (await readBackupRootFromSettings()));

  if (!resolvedRoot) {
    console.error(
      "Defina backupMountPath em data/backup-settings.json ou passe --backup-root /caminho/absoluto",
    );
    process.exit(1);
  }

  let topNames;
  try {
    topNames = await listTopLevelTargz(resolvedRoot);
  } catch (err) {
    console.error(`Não foi possível ler o diretório ${resolvedRoot}:`, err.message);
    process.exit(1);
  }

  if (!topNames.length) {
    console.log(`Nenhum *.tar.gz no topo de ${resolvedRoot}.`);
    return;
  }

  const absoluteFiles = topNames.map((n) => path.join(resolvedRoot, n));
  console.log(`Backup root: ${resolvedRoot}`);
  console.log(`Arquivos no topo (*.tar.gz), ${topNames.length}:`);
  for (const f of absoluteFiles) {
    console.log(`  ${f}`);
  }

  if (!yes) {
    console.log("\nDry-run: nada foi apagado. Repita com --yes para excluir.");
    process.exit(0);
  }

  for (const f of absoluteFiles) {
    try {
      await unlink(f);
      console.log(`Removido: ${f}`);
    } catch (err) {
      console.error(`Falha ao remover ${f}:`, err.message);
    }
  }

  if (pruneHistory) {
    const { removed } = await pruneHistoryForPaths(absoluteFiles);
    console.log(`Histórico: ${removed} entrada(s) removida(s) em data/backup-folders.json.`);
  }
}

await main();
