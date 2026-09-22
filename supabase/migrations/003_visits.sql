-- Study Mode, part two: what a session is for, and the referee's live visits to the classroom door.
-- A visit is the referee opening the back door on her screen right now, with a face and a line.
ALTER TABLE public.study_sessions
  ADD COLUMN goal text CHECK (length(goal) BETWEEN 1 AND 80);

CREATE TABLE public.study_visits (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  at timestamptz NOT NULL,
  mood text NOT NULL CHECK (mood IN ('calm', 'angry', 'pleased')),
  line text NOT NULL CHECK (length(line) BETWEEN 1 AND 120),
  seen_at timestamptz
);
CREATE INDEX study_visits_session_idx ON public.study_visits (session_id);

ALTER TABLE public.study_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.study_visits FROM anon, authenticated;
GRANT ALL ON public.study_visits TO service_role;
