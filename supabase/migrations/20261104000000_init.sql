-- Diligence Live: projects, claims, interviewees, interviews, evidence.
-- Ids are the app's own (p-…, iv-…, h1, e-…). Child rows are keyed per
-- project because sample projects reuse ids like "e-david" and "h1".

create table projects (
  id         text primary key,
  company    text not null,
  thesis     text not null default '',
  status     text not null,
  -- UI state with no table of its own: networks, selected contacts, each
  -- round's plan, the validation summary and gaps, the next-round proposal.
  workspace  jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- Contacts, including ones from a CRM: only the basics, plus crm_id.
create table interviewees (
  project_id  text not null references projects on delete cascade,
  id          text not null,
  crm_id      text,
  name        text not null,
  title       text not null default '',
  phone       text not null default '',
  description text not null default '',
  source      text not null,
  position    int  not null,              -- order in the contact list
  primary key (project_id, id),
  unique (project_id, crm_id)
);

-- Thesis claims (hypotheses). status, confidence and rationale come from
-- Claude's thesis validation and are replaced on every run; null = not assessed.
create table claims (
  project_id      text not null references projects on delete cascade,
  id              text not null,
  round           int  not null default 1, -- research round the claim was introduced in
  title           text not null,
  description     text not null default '',
  evidence_needed text not null default '',
  origin          text,
  status          text check (status in ('Supported', 'Contradicted', 'Mixed Evidence', 'Insufficient Evidence')),
  confidence      text,
  rationale       text,
  primary key (project_id, id)
);

create table interviews (
  project_id     text not null references projects on delete cascade,
  id             text not null,
  round          int  not null,
  interviewee_id text not null,
  status         text not null,
  topic          text not null default '',
  session_id     text,
  questions      jsonb not null default '[]',
  -- The whole transcript: [{id, speaker: "ai" | "expert", text, time: "mm:ss"}]
  transcript     jsonb not null default '[]',
  position       int   not null,           -- order within its round
  -- No foreign key to interviewees on purpose: a contact deleted as unreliable
  -- keeps their interviews and transcript (their evidence is dropped instead).
  primary key (project_id, id)
);

-- Claims and interviews meet only here: which interview, which sentence
-- (a turn id inside interviews.transcript), supports or contradicts which claim.
create table evidence (
  id           bigint generated always as identity primary key,
  project_id   text not null,
  claim_id     text not null,
  interview_id text not null,
  turn_id      text not null,
  quote        text not null,
  stance       text not null check (stance in ('support', 'contradict', 'neutral')),
  foreign key (project_id, claim_id) references claims (project_id, id) on delete cascade,
  foreign key (project_id, interview_id) references interviews (project_id, id) on delete cascade
);
create index evidence_claim on evidence (project_id, claim_id);

-- Supabase serves every table over its public REST API. RLS with no policies
-- blocks that; the backend connects as postgres, which bypasses RLS.
alter table projects     enable row level security;
alter table interviewees enable row level security;
alter table claims       enable row level security;
alter table interviews   enable row level security;
alter table evidence     enable row level security;
