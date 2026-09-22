-- One household, one player, one referee. There are no accounts: the server signs its own
-- session cookie and is the only reader and writer, using the service role.
CREATE TABLE public.question_bank (
  id text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('ML','AI/LLM','SQL','Python','BQ')),
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object')
);
ALTER TABLE public.question_bank ENABLE ROW LEVEL SECURITY;
-- Reference solutions are available to the server; browser writes are never permitted.
REVOKE ALL ON public.question_bank FROM anon, authenticated;

-- A small two-person app uses one versioned aggregate. Every state transition is atomic.
-- Day records contain immutable settings snapshots; derived scores replay from this event history.
CREATE TABLE public.game_state (
  id integer PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object' AND state->>'version' = '1'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.game_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.game_state FROM anon, authenticated;
GRANT ALL ON public.question_bank, public.game_state TO service_role;

CREATE FUNCTION public.commit_game(expected_revision bigint, next_state jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE affected integer;
BEGIN
  IF expected_revision = -1 THEN
    INSERT INTO public.game_state(id, revision, state) VALUES (1, 0, next_state) ON CONFLICT (id) DO NOTHING;
  ELSE
    UPDATE public.game_state SET state = next_state, revision = revision + 1, updated_at = now()
      WHERE id = 1 AND revision = expected_revision;
  END IF;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_game(bigint,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_game(bigint,jsonb) TO service_role;
