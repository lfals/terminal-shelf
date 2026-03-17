import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

type ChangeType = "epoch" | "major" | "minor" | "patch";

type EpochSemverState = {
  combined: number;
  minor: number;
  patch: number;
};

type LegacySemverState = {
  epoch: number;
  major: number;
  minor: number;
};

const CHANGE_OPTIONS: Array<{
  key: string;
  type: ChangeType;
  label: string;
  description: string;
}> = [
  {
    key: "1",
    type: "epoch",
    label: "EPOCH",
    description: "mudancas grandes ou uma nova era do produto",
  },
  {
    key: "2",
    type: "major",
    label: "MAJOR",
    description: "mudancas incompativeis menores que exigem atencao",
  },
  {
    key: "3",
    type: "minor",
    label: "MINOR",
    description: "novas funcionalidades compativeis",
  },
  {
    key: "4",
    type: "patch",
    label: "PATCH",
    description: "correcoes compativeis",
  },
];

function loadPackageJson() {
  const packageJsonPath = resolve(process.cwd(), "package.json");
  const content = readFileSync(packageJsonPath, "utf8");
  const parsed = JSON.parse(content) as { version?: string };

  if (!parsed.version) {
    throw new Error("Nao foi possivel encontrar a versao atual em package.json.");
  }

  return { packageJsonPath, content, parsed };
}

function parseNumericTriplet(version: string): [number, number, number] {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    throw new Error(`Versao invalida "${version}". O formato esperado e X.Y.Z.`);
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isCleanGitWorktree(): boolean {
  const status = execFileSync("git", ["status", "--short"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();

  return status.length === 0;
}

function gitTagExists(tag: string): boolean {
  const outputText = execFileSync("git", ["tag", "--list", tag], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();

  return outputText === tag;
}

function formatEpochSemver(version: EpochSemverState): string {
  return `${version.combined}.${version.minor}.${version.patch}`;
}

function formatGitTag(version: EpochSemverState): string {
  return `v${formatEpochSemver(version)}`;
}

function convertLegacySemverToEpoch(version: LegacySemverState): EpochSemverState {
  return {
    combined: version.epoch * 1000 + version.major,
    minor: version.minor,
    patch: 0,
  };
}

function inferCurrentEpochSemver(version: string): {
  current: EpochSemverState;
  sourceLabel: string;
} {
  const [first, second, third] = parseNumericTriplet(version);

  if (first === 0) {
    const legacy = {
      epoch: first,
      major: second,
      minor: third,
    };

    return {
      current: convertLegacySemverToEpoch(legacy),
      sourceLabel: `SemVer legado ${version}`,
    };
  }

  return {
    current: {
      combined: first,
      minor: second,
      patch: third,
    },
    sourceLabel: `Epoch SemVer ${version}`,
  };
}

function bumpEpochSemver(version: EpochSemverState, changeType: ChangeType): EpochSemverState {
  const epoch = Math.floor(version.combined / 1000);
  const major = version.combined % 1000;

  switch (changeType) {
    case "epoch":
      return {
        combined: (epoch + 1) * 1000,
        minor: 0,
        patch: 0,
      };
    case "major": {
      const nextMajor = major + 1;

      if (nextMajor >= 1000) {
        throw new Error(
          "MAJOR excedeu o limite de 999 dentro do mesmo EPOCH. Use EPOCH para iniciar um novo ciclo.",
        );
      }

      return {
        combined: epoch * 1000 + nextMajor,
        minor: 0,
        patch: 0,
      };
    }
    case "minor":
      return {
        combined: version.combined,
        minor: version.minor + 1,
        patch: 0,
      };
    case "patch":
      return {
        combined: version.combined,
        minor: version.minor,
        patch: version.patch + 1,
      };
  }
}

function updatePackageVersion(nextVersion: string) {
  const { packageJsonPath, parsed } = loadPackageJson();
  parsed.version = nextVersion;
  writeFileSync(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

function runGit(args: string[], dryRun: boolean) {
  if (dryRun) {
    output.write(`[dry-run] git ${args.join(" ")}\n`);
    return;
  }

  execFileSync("git", args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}

function createReleaseCommitAndTag(nextVersion: string, dryRun: boolean) {
  const tag = `v${nextVersion}`;

  if (gitTagExists(tag)) {
    throw new Error(`A tag ${tag} ja existe no repositorio.`);
  }

  runGit(["add", "package.json"], dryRun);
  runGit(["commit", "-m", `chore(release): ${tag}`], dryRun);
  runGit(["push", "origin", "HEAD"], dryRun);
  runGit(["tag", "-a", tag, "-m", `Release ${tag}`], dryRun);
  runGit(["push", "origin", tag], dryRun);
}

async function promptForChangeType() {
  const rl = createInterface({ input, output });

  output.write("Gerador de release tag\n\n");
  output.write("Fluxo: calcula a proxima versao, atualiza package.json, cria commit, cria tag anotada e faz push.\n\n");

  for (const option of CHANGE_OPTIONS) {
    output.write(`${option.key}. ${option.label} - ${option.description}\n`);
  }

  output.write("\n");

  try {
    while (true) {
      const answer = (await rl.question("Qual tipo de mudanca voce deseja fazer? ")).trim();
      const option = CHANGE_OPTIONS.find(
        (item) =>
          item.key === answer || item.type === answer.toLowerCase() || item.label === answer.toUpperCase(),
      );

      if (option) {
        return option;
      }

      output.write("Opcao invalida. Escolha 1, 2, 3, 4 ou informe epoch/major/minor/patch.\n");
    }
  } finally {
    rl.close();
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  if (!dryRun && !isCleanGitWorktree()) {
    throw new Error(
      "O worktree nao esta limpo. Commit ou descarte suas alteracoes antes de gerar a release.",
    );
  }

  const currentPackageVersion = loadPackageJson().parsed.version!;
  const { current, sourceLabel } = inferCurrentEpochSemver(currentPackageVersion);

  output.write(`Versao atual no package.json: ${currentPackageVersion}\n`);
  output.write(`Leitura da versao atual: ${sourceLabel}\n`);
  output.write(`Versao base para release: ${formatEpochSemver(current)}\n`);
  output.write(`Tag base para release: ${formatGitTag(current)}\n\n`);

  const selectedOption = await promptForChangeType();
  const nextVersion = bumpEpochSemver(current, selectedOption.type);
  const nextVersionText = formatEpochSemver(nextVersion);
  const nextTag = formatGitTag(nextVersion);

  output.write(`\nTipo selecionado: ${selectedOption.label}\n`);
  output.write(`Proxima versao do package.json: ${nextVersionText}\n`);
  output.write(`Proxima tag Git: ${nextTag}\n`);

  if (!dryRun) {
    updatePackageVersion(nextVersionText);
  } else {
    output.write(`[dry-run] package.json version => ${nextVersionText}\n`);
  }

  createReleaseCommitAndTag(nextVersionText, dryRun);

  output.write(
    dryRun
      ? "Release validada em modo dry-run.\n"
      : `Release publicada com commit e tag ${nextTag}.\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Erro inesperado ao gerar a release.";
  console.error(message);
  process.exit(1);
});
