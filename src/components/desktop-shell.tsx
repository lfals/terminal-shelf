"use client";

import { useSyncExternalStore } from "react";
import {
  AppWindow,
  ArrowUpRight,
  Binary,
  MonitorSmartphone,
  Package,
  Terminal,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const stack = [
  "Bun para scripts, install e build do processo principal",
  "Next.js App Router usado como renderer interno do shell desktop",
  "Tailwind CSS v4 e shadcn/ui para a camada visual inicial",
];

const commands = [
  { label: "Desenvolvimento", value: "bun run dev" },
  { label: "Build desktop", value: "bun run build" },
  { label: "Empacotar", value: "bun run dist" },
];

const docs = [
  { label: "Next.js", href: "https://nextjs.org/docs" },
  { label: "Electron", href: "https://www.electronjs.org/docs/latest" },
  { label: "shadcn/ui", href: "https://ui.shadcn.com/docs" },
];

export function DesktopShell() {
  const runtime = useSyncExternalStore(
    subscribeToDesktopRuntime,
    getDesktopRuntimeSnapshot,
    getDesktopRuntimeServerSnapshot
  );

  const openExternal = (href: string) => {
    if (!window.desktop?.openExternal) {
      return;
    }

    void window.desktop.openExternal(href);
  };

  if (!runtime) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <Card className="w-full max-w-xl border border-white/10 bg-white/8 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <AppWindow className="size-4 text-primary" />
              Runtime obrigatorio: Electron
            </CardTitle>
            <CardDescription className="text-white/62">
              Este renderer foi projetado para rodar apenas dentro do shell
              desktop com preload ativo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-white/72">
            <p>Inicie o aplicativo com <span className="font-mono text-primary">bun run dev</span> ou <span className="font-mono text-primary">bun run start</span>.</p>
            <p>O acesso direto pelo navegador nao faz parte do runtime suportado.</p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:72px_72px] opacity-15" />
      <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(245,191,84,0.22),transparent_60%)]" />
      <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(45,212,191,0.16),transparent_58%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 lg:px-10">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/8 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur">
              <Terminal className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-primary/80">
                Desktop starter
              </p>
              <h1 className="text-lg font-semibold text-white">Term</h1>
            </div>
          </div>

          <Badge variant="default">Rodando no Electron</Badge>
        </header>

        <section className="grid flex-1 items-center gap-6 py-10 lg:grid-cols-[1.3fr_0.9fr]">
          <div className="space-y-8">
            <div className="space-y-5">
              <Badge variant="outline" className="border-white/15 bg-white/6 text-white/80">
                Next.js + Electron + Bun
              </Badge>
              <div className="space-y-4">
                <h2 className="max-w-3xl text-5xl leading-none font-semibold tracking-[-0.04em] text-white sm:text-6xl">
                  Base desktop moderna, sem Node paralelo escondido no runtime.
                </h2>
                <p className="max-w-2xl text-lg leading-8 text-white/68">
                  O renderer usa Next.js dentro do shell Electron. Em
                  producao, a interface eh carregada localmente pelo app e o
                  processo principal continua compilado com Bun.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {docs.map((doc) => (
                <Button
                  key={doc.href}
                  variant={doc.label === "Electron" ? "default" : "outline"}
                  size="lg"
                  className="border-white/12 bg-white/8 text-white hover:bg-white/12"
                  onClick={() => openExternal(doc.href)}
                >
                  {doc.label}
                  <ArrowUpRight className="size-4" />
                </Button>
              ))}
            </div>

            <Card className="border border-white/10 bg-white/6 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="text-white">Fluxo configurado</CardTitle>
                <CardDescription className="text-white/62">
                  Scripts principais para desenvolvimento e empacotamento.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                {commands.map((command) => (
                  <div
                    key={command.value}
                    className="rounded-2xl border border-white/8 bg-black/18 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-white/45">
                      {command.label}
                    </p>
                    <p className="mt-2 font-mono text-sm text-primary">
                      {command.value}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4">
            <Card className="border border-white/10 bg-white/8 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <AppWindow className="size-4 text-primary" />
                  Runtime
                </CardTitle>
                <CardDescription className="text-white/62">
                  Informacoes expostas pelo preload seguro do Electron.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <RuntimeRow label="Plataforma" value={runtime.platform} />
                <RuntimeRow label="Electron" value={runtime.versions.electron} />
                <RuntimeRow label="Chrome" value={runtime.versions.chrome} />
                <RuntimeRow label="Node" value={runtime.versions.node} />
              </CardContent>
              <CardFooter className="justify-between border-white/8 bg-black/18 text-white/65">
                <span>Bridge via preload</span>
                <Binary className="size-4 text-accent" />
              </CardFooter>
            </Card>

            <Card className="border border-white/10 bg-white/8 backdrop-blur-xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <MonitorSmartphone className="size-4 text-accent" />
                  Stack inicial
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {stack.map((item, index) => (
                  <div key={item} className="space-y-4">
                    <div className="flex gap-3">
                      <Badge
                        variant="outline"
                        className="mt-0.5 border-white/10 bg-white/6 text-white/72"
                      >
                        0{index + 1}
                      </Badge>
                      <p className="leading-7 text-white/72">{item}</p>
                    </div>
                    {index < stack.length - 1 ? (
                      <Separator className="bg-white/8" />
                    ) : null}
                  </div>
                ))}
              </CardContent>
              <CardFooter className="justify-between border-white/8 bg-black/18 text-white/65">
                <span>Sem testes unitarios adicionados</span>
                <Package className="size-4 text-primary" />
              </CardFooter>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function subscribeToDesktopRuntime() {
  return () => undefined;
}

function getDesktopRuntimeSnapshot() {
  return window.desktop?.runtime ?? null;
}

function getDesktopRuntimeServerSnapshot() {
  return null;
}

function RuntimeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-black/18 px-4 py-3">
      <span className="text-sm text-white/62">{label}</span>
      <span className="font-mono text-sm text-white">{value}</span>
    </div>
  );
}
