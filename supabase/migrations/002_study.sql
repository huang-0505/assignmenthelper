-- Study Mode: timed webcam sessions and the strikes / warnings recorded during them.
-- Detection runs in the browser. Only the server (service role) reads or writes these tables;
-- violation snapshots and coach photos live in a private Storage bucket the server creates.
CREATE TABLE public.study_sessions (
  id uuid PRIMARY KEY,
  day text NOT NULL CHECK (day ~ '^\d{4}-\d{2}-\d{2}$'),
  started_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  paused_at timestamptz,
  paused_ms integer NOT NULL DEFAULT 0 CHECK (paused_ms >= 0),
  pause_used boolean NOT NULL DEFAULT false,
  ended_at timestamptz,
  end_reason text CHECK (end_reason IN ('completed', 'ended_early', 'pause_exceeded', 'abandoned')),
  rules jsonb NOT NULL CHECK (jsonb_typeof(rules) = 'object'),
  layers jsonb NOT NULL CHECK (jsonb_typeof(layers) = 'object'),
  share_snapshots boolean NOT NULL DEFAULT false,
  summary text CHECK (length(summary) <= 2000),
  summary_grade jsonb,
  last_inspect_at timestamptz,
  CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);
CREATE INDEX study_sessions_started_idx ON public.study_sessions (started_at DESC);
-- Only one session can be running at a time.
CREATE UNIQUE INDEX study_sessions_one_running ON public.study_sessions ((true)) WHERE ended_at IS NULL;

CREATE TABLE public.study_strikes (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  at timestamptz NOT NULL,
  kind text NOT NULL CHECK (kind IN ('strike', 'warning')),
  source text NOT NULL CHECK (source IN ('absent', 'phone', 'look_away', 'drowsy', 'ai', 'summary')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 300),
  confidence real CHECK (confidence BETWEEN 0 AND 1),
  snapshot_path text,
  overturned_at timestamptz,
  overturn_reason text CHECK (length(overturn_reason) <= 1000),
  CHECK ((overturned_at IS NULL) = (overturn_reason IS NULL))
);
CREATE INDEX study_strikes_session_idx ON public.study_strikes (session_id);

ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_strikes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_sessions, public.study_strikes FROM anon, authenticated;
GRANT ALL ON public.study_sessions, public.study_strikes TO service_role;
