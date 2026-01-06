import React, { useEffect, useMemo, useState } from 'react';
import fs from 'fs';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import { buildLinkPlan } from '../core/plan.js';
import { applyLinkPlan } from '../core/apply.js';
import { getLinkStatus } from '../core/status.js';
import { applyMigration, scanMigration } from '../core/migrate.js';
import type { Scope, LinkPlan, LinkStatus } from '../core/types.js';
import type { MigrationPlan, MigrationCandidate } from '../core/migrate.js';
import { installSkillsFromSource } from '../installers/skills.js';
import { loadMarketplace, installMarketplace } from '../installers/marketplace.js';
import { HelpBar } from './ui/HelpBar.js';
import { ScrollArea } from './ui/ScrollArea.js';
import { Screen } from './ui/Screen.js';

const appTitle = 'dotagents';

type Step =
  | 'scope'
  | 'action'
  | 'status'
  | 'applying'
  | 'migrate-choice'
  | 'skill-source-type'
  | 'skill-input'
  | 'plugin-marketplace-input'
  | 'plugin-select'
  | 'done';

type SkillSourceType = 'local' | 'url';

export const App: React.FC = () => {
  const { exit } = useApp();
  const [step, setStep] = useState<Step>('scope');
  const [scope, setScope] = useState<Scope | null>(null);
  const [plan, setPlan] = useState<LinkPlan | null>(null);
  const [status, setStatus] = useState<LinkStatus[]>([]);
  const [message, setMessage] = useState<string>('');
  const [busy, setBusy] = useState<string | null>(null);
  const [migratePlan, setMigratePlan] = useState<MigrationPlan | null>(null);
  const [migrateIndex, setMigrateIndex] = useState<number>(0);
  const [migrateSelections, setMigrateSelections] = useState<Map<string, MigrationCandidate | null>>(new Map());
  const [skillType, setSkillType] = useState<SkillSourceType>('local');
  const [skillInput, setSkillInput] = useState<string>('');
  const [marketplaceInput, setMarketplaceInput] = useState<string>('');
  const [marketplacePlugins, setMarketplacePlugins] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [conflictsOnly, setConflictsOnly] = useState<boolean>(false);
  const { stdout } = useStdout();

  useInput((input, key) => {
    if (input === 'q') exit();
    if (step === 'status' && input === 'd') setShowDetails((prev) => !prev);
    if (step === 'status' && input === 'c') setConflictsOnly(true);
    if (step === 'status' && input === 'a') setConflictsOnly(false);
    if (key.escape) {
      if (step === 'action') return setStep('scope');
      if (step === 'status') return setStep('action');
      if (step === 'migrate-choice') {
        setMigratePlan(null);
        setMigrateSelections(new Map());
        return setStep('action');
      }
      if (step === 'skill-source-type') return setStep('action');
      if (step === 'skill-input') return setStep('skill-source-type');
      if (step === 'plugin-marketplace-input') return setStep('action');
      if (step === 'plugin-select') return setStep('plugin-marketplace-input');
      if (step === 'done') return setStep('action');
    }
    if (step === 'done' && key.return) setStep('action');
  });

  const scopeLabel = scope === 'global' ? 'Global (~/.agents)' : scope === 'project' ? 'Project (.agents)' : '';

  const refreshStatus = async (nextScope: Scope) => {
    const s = await getLinkStatus({ scope: nextScope });
    setStatus(s);
    const p = await buildLinkPlan({ scope: nextScope });
    setPlan(p);
  };

  useEffect(() => {
    if (scope) void refreshStatus(scope);
  }, [scope]);

  const conflicts = plan?.conflicts.length || 0;
  const changes = plan?.changes.length || 0;

  const actionItems = useMemo(() => {
    const items = [
      { label: 'Apply/repair links', value: 'apply' },
    ] as { label: string; value: string }[];
    if (conflicts > 0) items.push({ label: 'Force apply (overwrite conflicts)', value: 'force-apply' });
    items.push({ label: 'View status', value: 'view-status' });
    items.push({ label: 'Migrate existing content', value: 'migrate' });
    items.push({ label: 'Add skill', value: 'add-skill' });
    items.push({ label: 'Install plugin', value: 'install-plugin' });
    items.push({ label: 'Exit', value: 'exit' });
    return items;
  }, [conflicts]);

  const displayName = (name: string) => {
    if (name === 'agents-md') return 'AGENTS.md';
    return name;
  };

  const statusSummary = useMemo(() => {
    return status.map((s) => {
      const linked = s.targets.filter((t) => t.status === 'linked').length;
      const missing = s.targets.filter((t) => t.status === 'missing').length;
      const conflict = s.targets.filter((t) => t.status === 'conflict').length;
      return { name: displayName(s.name), linked, missing, conflict };
    });
  }, [status]);

  const summaryTable = useMemo(() => {
    const rows = statusSummary.map((s) => ({
      name: s.name,
      conflict: String(s.conflict),
      missing: String(s.missing),
      linked: String(s.linked),
    }));
    const header = { name: 'Section', conflict: 'Conflicts', missing: 'Need link', linked: 'Linked' };
    const width = {
      name: Math.max(header.name.length, ...rows.map((r) => r.name.length)),
      conflict: Math.max(header.conflict.length, ...rows.map((r) => r.conflict.length)),
      missing: Math.max(header.missing.length, ...rows.map((r) => r.missing.length)),
      linked: Math.max(header.linked.length, ...rows.map((r) => r.linked.length)),
    };
    const pad = (value: string, len: number) => value.padEnd(len, ' ');
    const lines = [
      `${pad(header.name, width.name)}  ${pad(header.conflict, width.conflict)}  ${pad(header.missing, width.missing)}  ${pad(header.linked, width.linked)}`,
      ...rows.map((r) => `${pad(r.name, width.name)}  ${pad(r.conflict, width.conflict)}  ${pad(r.missing, width.missing)}  ${pad(r.linked, width.linked)}`),
    ];
    return lines;
  }, [statusSummary]);

  const [conflictDetails, setConflictDetails] = useState<Map<string, { reason: string; contents?: string }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!plan) return;
      const map = new Map<string, { reason: string; contents?: string }>();
      for (const task of plan.conflicts) {
        map.set(task.target, { reason: task.reason });
        try {
          const stat = await fs.promises.lstat(task.target);
          if (stat.isDirectory() && !stat.isSymbolicLink()) {
            const entries = await fs.promises.readdir(task.target);
            const shown = entries.slice(0, 6);
            const more = entries.length > 6 ? `… +${entries.length - 6} more` : '';
            const contents = entries.length === 0
              ? '(empty)'
              : `${shown.join(', ')}${more ? `, ${more}` : ''}`;
            map.set(task.target, { reason: task.reason, contents: `Contains: ${contents}` });
          }
        } catch {
          // Ignore errors reading conflict target
        }
      }
      if (!cancelled) setConflictDetails(map);
    };
    void load();
    return () => { cancelled = true; };
  }, [plan]);

  const renderStatusList = () => {
    const sections = status.map((s) => {
      const targets = conflictsOnly ? s.targets.filter((t) => t.status === 'conflict') : s.targets;
      if (conflictsOnly && targets.length === 0) return null;
      return (
        <Box key={s.name} flexDirection="column" marginTop={1}>
          <Text color="cyan">{displayName(s.name)}</Text>
          {targets.map((t) => (
            <Box key={t.path} flexDirection="column">
              <Text>
                {t.status === 'linked' ? '✓' : t.status === 'missing' ? '•' : '⚠'} {t.path}
              </Text>
              {showDetails && t.status === 'conflict' && conflictDetails.has(t.path) ? (
                <>
                  <Text color="red">  {conflictDetails.get(t.path)?.reason}</Text>
                  {conflictDetails.get(t.path)?.contents ? (
                    <Text dimColor>  {conflictDetails.get(t.path)?.contents}</Text>
                  ) : null}
                </>
              ) : null}
            </Box>
          ))}
        </Box>
      );
    }).filter(Boolean);

    if (!sections.length) {
      return (
        <Box marginTop={1}>
          <Text dimColor>No conflicts found.</Text>
        </Box>
      );
    }

    return <Box flexDirection="column">{sections}</Box>;
  };

  if (step === 'scope') {
    return (
      <Screen>
        <Text color="green">{appTitle}</Text>
        <Text>Choose a workspace:</Text>
        <SelectInput
          items={[
            { label: 'Global home', value: 'global' },
            { label: 'Project folder', value: 'project' },
            { label: 'Exit', value: 'exit' },
          ]}
          onSelect={(item) => {
            if (item.value === 'exit') return exit();
            setScope(item.value as Scope);
            setStep('action');
          }}
        />
      </Screen>
    );
  }

  if (step === 'action') {
    return (
      <Screen>
        <Text color="green">{appTitle}</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text>Scope: {scopeLabel}</Text>
          <Text>Pending changes: {changes} · Conflicts: {conflicts}</Text>
          {summaryTable.map((line) => (
            <Text key={line}>{line}</Text>
          ))}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>Choose an action:</Text>
          <SelectInput
            items={actionItems}
            onSelect={(item) => {
              if (item.value === 'exit') return exit();
              if (item.value === 'view-status') {
                setStep('status');
                return;
              }
              if (item.value === 'migrate') {
                if (!scope) return;
                setBusy('Scanning existing content...');
                setStep('applying');
                void (async () => {
                  try {
                    const plan = await scanMigration({ scope });
                    setMigratePlan(plan);
                    setMigrateIndex(0);
                    setMigrateSelections(new Map());
                    if (plan.conflicts.length > 0) {
                      setBusy(null);
                      setStep('migrate-choice');
                      return;
                    }
                    setBusy('Migrating...');
                    const result = await applyMigration(plan, new Map(), { scope });
                    setMessage(`Migrated ${result.copied} items. Backup: ${result.backupDir}`);
                    await refreshStatus(scope);
                    setStep('done');
                  } catch (err: any) {
                    setMessage(err?.message || String(err));
                    setStep('done');
                  } finally {
                    setBusy(null);
                  }
                })();
                return;
              }
              if (item.value === 'apply' || item.value === 'force-apply') {
                setBusy(item.value === 'force-apply' ? 'Applying (force)...' : 'Applying...');
                setStep('applying');
                void (async () => {
                  try {
                    if (!plan || !scope) return;
                    const result = await applyLinkPlan(plan, { force: item.value === 'force-apply' });
                    setMessage(`Applied: ${result.applied}, Skipped: ${result.skipped}, Conflicts: ${result.conflicts}`);
                    await refreshStatus(scope);
                  } catch (err: any) {
                    setMessage(err?.message || String(err));
                  } finally {
                    setBusy(null);
                    setStep('done');
                  }
                })();
                return;
              }
              if (item.value === 'add-skill') {
                setSkillInput('');
                setStep('skill-source-type');
                return;
              }
              if (item.value === 'install-plugin') {
                setMarketplaceInput('');
                setStep('plugin-marketplace-input');
                return;
              }
            }}
          />
          <HelpBar text="Use ↑↓ to navigate, Enter to select, Esc to go back, q to quit" />
        </Box>
      </Screen>
    );
  }

  if (step === 'status') {
    const listHeight = Math.max(6, (stdout?.rows ?? 24) - 8);
    return (
      <Screen>
        <Text color="green">{appTitle}</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text>Scope: {scopeLabel}</Text>
          <Text>Pending changes: {changes} · Conflicts: {conflicts}</Text>
          <Text dimColor>Legend: ✓ linked • need link ⚠ conflict</Text>
          <Text dimColor>
            Mode: {conflictsOnly ? 'Conflicts only' : 'All'} · Details: {showDetails ? 'On' : 'Off'}
          </Text>
        </Box>
        <ScrollArea height={listHeight}>
          {renderStatusList()}
        </ScrollArea>
        <HelpBar text="d: details · c: conflicts only · a: show all · Esc: back · q: quit" />
      </Screen>
    );
  }

  if (step === 'migrate-choice' && migratePlan) {
    const conflict = migratePlan.conflicts[migrateIndex];
    if (!conflict) {
      return (
        <Screen>
          <Text color="green">{appTitle}</Text>
          <Text dimColor>No conflicts to resolve.</Text>
          <HelpBar text="Esc: back · q: quit" />
        </Screen>
      );
    }
    const items = conflict.candidates.map((c) => ({
      label: c.label,
      value: c,
    }));
    return (
      <Screen>
        <Text color="green">{appTitle}</Text>
        <Box flexDirection="column" marginTop={1}>
          <Text>Resolve conflict {migrateIndex + 1} of {migratePlan.conflicts.length}</Text>
          <Text dimColor>{conflict.label}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <SelectInput
            items={items}
            onSelect={(item) => {
              if (!scope) return;
              const next = new Map(migrateSelections);
              next.set(conflict.targetPath, item.value as MigrationCandidate);
              setMigrateSelections(next);
              if (migrateIndex + 1 < migratePlan.conflicts.length) {
                setMigrateIndex(migrateIndex + 1);
                return;
              }
              setBusy('Migrating...');
              setStep('applying');
              void (async () => {
                try {
                  const result = await applyMigration(migratePlan, next, { scope });
                  setMessage(`Migrated ${result.copied} items. Backup: ${result.backupDir}`);
                  await refreshStatus(scope);
                } catch (err: any) {
                  setMessage(err?.message || String(err));
                } finally {
                  setBusy(null);
                  setMigratePlan(null);
                  setMigrateIndex(0);
                  setMigrateSelections(new Map());
                  setStep('done');
                }
              })();
            }}
          />
          <HelpBar text="Use ↑↓ to choose, Enter to select, Esc to cancel" />
        </Box>
      </Screen>
    );
  }

  if (step === 'applying') {
    return (
      <Screen>
        <Text color="yellow"><Spinner type="dots" /> {busy || 'Working...'}</Text>
      </Screen>
    );
  }

  if (step === 'skill-source-type') {
    return (
      <Screen>
        <Text>Select skill source type:</Text>
        <SelectInput
          items={[
            { label: 'Local path', value: 'local' },
            { label: 'URL', value: 'url' },
            { label: 'Back', value: 'back' },
          ]}
          onSelect={(item) => {
            if (item.value === 'back') {
              setStep('action');
              return;
            }
            setSkillType(item.value as SkillSourceType);
            setStep('skill-input');
          }}
        />
        <Text dimColor>Press Esc to go back, or q to quit.</Text>
      </Screen>
    );
  }

  if (step === 'skill-input') {
    return (
      <Screen>
        {skillType === 'local' ? (
          <>
          <Text>Paste a skills folder path and we’ll install all skills inside.</Text>
          <Text>Or paste a SKILL.md file and we’ll install the full skill.</Text>
        </>
      ) : (
        <>
          <Text>Paste a skills folder URL and we’ll fetch all skills inside.</Text>
          <Text>Or paste a SKILL.md URL and we’ll install the full skill.</Text>
        </>
      )}
        <TextInput
          value={skillInput}
          onChange={setSkillInput}
          onSubmit={() => {
            if (!scope) return;
            setBusy('Installing skill(s)...');
            setStep('applying');
            void (async () => {
              try {
                const result = await installSkillsFromSource({
                  source: skillInput,
                  sourceType: skillType,
                  scope,
                });
                setMessage(`Installed: ${result.installed.join(', ') || 'none'} · Skipped: ${result.skipped.join(', ') || 'none'}`);
                await refreshStatus(scope);
              } catch (err: any) {
                setMessage(err?.message || String(err));
              } finally {
                setBusy(null);
                setStep('done');
              }
            })();
          }}
        />
        <Text dimColor>Press Enter to continue, Esc to go back, or q to quit.</Text>
      </Screen>
    );
  }

  if (step === 'plugin-marketplace-input') {
    return (
      <Screen>
        <Text>Enter marketplace path or URL:</Text>
        <TextInput
          value={marketplaceInput}
          onChange={setMarketplaceInput}
          onSubmit={() => {
            if (!scope) return;
            setBusy('Loading marketplace...');
            setStep('applying');
            void (async () => {
              try {
                const loaded = await loadMarketplace(marketplaceInput);
                const plugins = loaded.json.plugins.map((p) => p.name);
                setMarketplacePlugins(plugins);
                setBusy(null);
                setStep('plugin-select');
              } catch (err: any) {
                setMessage(err?.message || String(err));
                setBusy(null);
                setStep('done');
              }
            })();
          }}
        />
        <Text dimColor>Press Enter to continue, Esc to go back, or q to quit.</Text>
      </Screen>
    );
  }

  if (step === 'plugin-select') {
    return (
      <Screen>
        <Text>Select plugin to install:</Text>
        <SelectInput
          items={[
            { label: 'All plugins', value: 'all' },
            ...marketplacePlugins.map((p) => ({ label: p, value: p })),
            { label: 'Back', value: 'back' },
          ]}
          onSelect={(item) => {
            if (!scope) return;
            if (item.value === 'back') {
              setStep('action');
              return;
            }
            setBusy('Installing plugin(s)...');
            setStep('applying');
            void (async () => {
              try {
                const result = await installMarketplace({
                  marketplace: marketplaceInput,
                  plugins: item.value === 'all' ? 'all' : [String(item.value)],
                  scope,
                });
                setMessage(`Installed commands: ${result.installedCommands.length}, hooks: ${result.installedHooks.length}, skills: ${result.installedSkills.length}`);
                await refreshStatus(scope);
              } catch (err: any) {
                setMessage(err?.message || String(err));
              } finally {
                setBusy(null);
                setStep('done');
              }
            })();
          }}
        />
        <Text dimColor>Press Esc to go back, or q to quit.</Text>
      </Screen>
    );
  }

  if (step === 'done') {
    return (
      <Screen>
        <Text>{message || 'Done.'}</Text>
        <Text dimColor>Press Enter to continue, Esc to go back, or q to quit.</Text>
      </Screen>
    );
  }

  return null;
};
