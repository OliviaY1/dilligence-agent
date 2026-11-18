-- One row per billed API use: a Claude call, or one live call's Boson voice,
-- transcription and avatar. cost_usd is priced when recorded (server/usage.ts);
-- null when the model has no price there. No foreign key to projects on purpose:
-- a deleted project's spend still counts in the total.
create table if not exists api_usage (
  id            bigint generated always as identity primary key,
  project_id    text,
  at            timestamptz not null default now(),
  source        text not null,               -- what the call was for, e.g. "Thesis validation"
  model         text not null,               -- the model that answered, e.g. claude-opus-5-5
  input_tokens  bigint not null default 0,
  cached_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  minutes       numeric not null default 0,  -- for per-minute pricing (transcription, avatar video)
  cost_usd      numeric
);
alter table api_usage enable row level security;
