export type Scope = 'global' | 'project';
export type SourceKind = 'file' | 'dir';

export type Mapping = {
  name: string;
  source: string;
  targets: string[];
  kind: SourceKind;
};

export type LinkTask =
  | { type: 'ensure-source'; path: string; kind: SourceKind }
  | { type: 'link'; source: string; target: string; kind: SourceKind }
  | { type: 'conflict'; source: string; target: string; reason: string; kind?: SourceKind }
  | { type: 'noop'; source: string; target: string };

export type ConflictTask = Extract<LinkTask, { type: 'conflict' }>;

export type LinkPlan = {
  tasks: LinkTask[];
  changes: LinkTask[];
  conflicts: ConflictTask[];
};

export type LinkStatus = {
  name: string;
  source: string;
  targets: { path: string; status: 'linked' | 'missing' | 'conflict' }[];
};
