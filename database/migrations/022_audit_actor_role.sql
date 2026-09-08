-- Preserve the actor's role at action time; a later account role change must
-- not rewrite historical audit meaning.
ALTER TABLE audit_logs
  ADD COLUMN actor_role VARCHAR(64) NULL AFTER user_id,
  ADD KEY idx_audit_logs_actor_role (actor_role);
