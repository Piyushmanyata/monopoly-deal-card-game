"use client";

import { useState } from "react";
import { Check, Clipboard, Copy, Database, HelpCircle, Key, RefreshCw, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type EnvStatus = {
  url: boolean;
  anonKey: boolean;
  serviceKey: boolean;
};

type SupabaseSetupWizardProps = {
  envStatus: EnvStatus;
  schemaSql: string;
};

export function SupabaseSetupWizard({ envStatus, schemaSql }: SupabaseSetupWizardProps) {
  const [activeStep, setActiveStep] = useState(1);
  const [copiedSchema, setCopiedSchema] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  const envConfiguredCount = [envStatus.url, envStatus.anonKey, envStatus.serviceKey].filter(Boolean).length;
  const progressPercent = (envConfiguredCount / 3) * 100;

  const copyToClipboard = (text: string, setCopiedState: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopiedState(true);
    setTimeout(() => setCopiedState(false), 2000);
  };

  const envTemplate = `# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_public_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_secret_key`;

  return (
    <div className="space-y-6">
      <Card className="border-emerald-500/20 bg-zinc-950/60 backdrop-blur-md shadow-2xl">
        <CardHeader className="border-b border-white/5 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-300">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-zinc-100">Supabase Connection Wizard</CardTitle>
                <CardDescription className="text-zinc-400">Follow these steps to connect your multiplayer database.</CardDescription>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-zinc-400">Environment Setup</span>
              <div className="flex items-center gap-2 mt-1">
                <Progress value={progressPercent} className="h-2 w-24 bg-zinc-800" />
                <span className="text-xs font-mono text-emerald-400 font-bold">{envConfiguredCount}/3 Active</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 border-b border-white/5">
            {[
              { num: 1, title: "1. Create Project" },
              { num: 2, title: "2. Run SQL Schema" },
              { num: 3, title: "3. Configure Env" },
              { num: 4, title: "4. Run & Test" },
            ].map((step) => (
              <button
                key={step.num}
                onClick={() => setActiveStep(step.num)}
                className={`px-4 py-2 text-xs font-bold rounded-md transition shrink-0 ${
                  activeStep === step.num
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "text-zinc-400 hover:text-zinc-200 border border-transparent"
                }`}
              >
                {step.title}
              </button>
            ))}
          </div>

          {activeStep === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <h3 className="text-base font-bold text-zinc-200">Step 1: Spin up your Supabase Instance</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                DEAL! uses Supabase for player registration, matchmaking lobby, and real-time multiplayer states.
              </p>
              <div className="grid gap-3 pt-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex gap-3">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-xs font-bold border border-white/10">1</div>
                  <div className="text-sm text-zinc-300">
                    Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-emerald-400 underline font-bold hover:text-emerald-300">supabase.com</a> and sign in.
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex gap-3">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-xs font-bold border border-white/10">2</div>
                  <div className="text-sm text-zinc-300">
                    Click **New Project**, choose an organization, select a database name, region, and password.
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex gap-3">
                  <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-xs font-bold border border-white/10">3</div>
                  <div className="text-sm text-zinc-300">
                    Wait 1-2 minutes for the database to provision. Proceed to Step 2 once it&apos;s ready.
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => setActiveStep(2)}>Next: Database Schema &rarr;</Button>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <h3 className="text-base font-bold text-zinc-200">Step 2: Initialize Database Tables & Rules</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Execute the pre-written schema SQL to create the `rooms`, `players`, `games`, and `moves` tables, and set up Row Level Security (RLS) policies.
              </p>

              <div className="rounded-lg border border-white/10 bg-zinc-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950 border-b border-white/10">
                  <span className="font-mono text-xs text-zinc-400">supabase/schema.sql</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => copyToClipboard(schemaSql, setCopiedSchema)}
                  >
                    {copiedSchema ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedSchema ? "Copied!" : "Copy Schema"}
                  </Button>
                </div>
                <pre className="p-4 overflow-x-auto text-[11px] font-mono text-zinc-300 max-h-[160px] bg-black/40">
                  <code>{schemaSql}</code>
                </pre>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex gap-3">
                <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-zinc-900 text-xs font-bold border border-white/10">!</div>
                <div className="text-sm text-zinc-300">
                  Open the **SQL Editor** in your Supabase dashboard, paste this script, and click **Run**.
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setActiveStep(1)}>&larr; Back</Button>
                <Button onClick={() => setActiveStep(3)}>Next: Env Config &rarr;</Button>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <h3 className="text-base font-bold text-zinc-200">Step 3: Setup local .env variables</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Create a file named `.env.local` in your project root and paste the following keys. Fill them with your Supabase values.
              </p>

              <div className="rounded-lg border border-white/10 bg-zinc-900 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-950 border-b border-white/10">
                  <span className="font-mono text-xs text-zinc-400">.env.local</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => copyToClipboard(envTemplate, setCopiedEnv)}
                  >
                    {copiedEnv ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedEnv ? "Copied!" : "Copy Variables"}
                  </Button>
                </div>
                <pre className="p-4 overflow-x-auto text-xs font-mono text-zinc-300 bg-black/40">
                  <code>{envTemplate}</code>
                </pre>
              </div>

              <div className="grid gap-3 pt-1">
                <div className="flex items-center justify-between p-3 rounded-md border border-white/5 bg-zinc-900/30">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-mono">NEXT_PUBLIC_SUPABASE_URL</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${envStatus.url ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" : "bg-red-500/10 text-red-400 border border-red-500/25"}`}>
                    {envStatus.url ? "Configured" : "Missing"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-white/5 bg-zinc-900/30">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${envStatus.anonKey ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" : "bg-red-500/10 text-red-400 border border-red-500/25"}`}>
                    {envStatus.anonKey ? "Configured" : "Missing"}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-md border border-white/5 bg-zinc-900/30">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-mono">SUPABASE_SERVICE_ROLE_KEY</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${envStatus.serviceKey ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25" : "bg-red-500/10 text-red-400 border border-red-500/25"}`}>
                    {envStatus.serviceKey ? "Configured" : "Missing"}
                  </span>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setActiveStep(2)}>&larr; Back</Button>
                <Button onClick={() => setActiveStep(4)}>Next: Run & Test &rarr;</Button>
              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <h3 className="text-base font-bold text-zinc-200">Step 4: Restart & Launch</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Next.js requires a server restart to load new environment variables. Run these commands to relaunch the game.
              </p>

              <div className="rounded-lg border border-white/10 bg-zinc-900 p-4">
                <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-2">
                  <Terminal className="h-4 w-4" />
                  Terminal
                </div>
                <code className="text-xs font-mono text-zinc-200 block bg-black/40 p-2.5 rounded border border-white/5">
                  # Stop the current dev server (Ctrl + C)<br />
                  npm run dev
                </code>
              </div>

              <p className="text-xs text-zinc-500 flex items-center gap-2.5 mt-2">
                <HelpCircle className="h-4 w-4 shrink-0" />
                Once you configure the keys and restart the server, refresh this page to access the multiplayer lobby.
              </p>

              <div className="flex justify-between pt-2 border-t border-white/5 mt-4">
                <Button variant="outline" onClick={() => setActiveStep(3)}>&larr; Back</Button>
                <Button
                  onClick={() => window.location.reload()}
                  className="gap-2 bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh Connection Status
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
