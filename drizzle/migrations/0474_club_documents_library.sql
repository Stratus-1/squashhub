CREATE OR REPLACE FUNCTION public.can_manage_club_documents(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _club_id IS NOT NULL AND (
    public.is_club_admin(_user_id, _club_id)
    OR public.is_club_admin_or_permitted(_user_id, _club_id, 'club')
    OR EXISTS (
      SELECT 1 FROM public.clubs c
      JOIN public.club_members cm ON cm.club_id = c.id AND cm.user_id = _user_id AND cm.status = 'active'
      WHERE c.id = _club_id AND cm.id IN (c.chairman_member_id, c.secretary_member_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.club_offices o
      JOIN public.club_members cm ON cm.id = o.club_member_id AND cm.user_id = _user_id AND cm.status = 'active'
      WHERE o.club_id = _club_id AND o.ended_at IS NULL AND o.office IN ('chairman', 'secretary')
    )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_manage_club_documents(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_club_documents(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_can_manage_club_documents(_club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.can_manage_club_documents(auth.uid(), _club_id); $$;
REVOKE EXECUTE ON FUNCTION public.my_can_manage_club_documents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_can_manage_club_documents(uuid) TO authenticated;

CREATE TABLE public.club_document_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  standard_key text,
  sort_order integer NOT NULL DEFAULT 100,
  members_visible boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_document_categories_name_not_blank CHECK (length(btrim(name)) > 0)
);
CREATE UNIQUE INDEX club_document_categories_club_name_uq ON public.club_document_categories (club_id, lower(btrim(name)));
CREATE UNIQUE INDEX club_document_categories_club_standard_uq ON public.club_document_categories (club_id, standard_key) WHERE standard_key IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_document_categories TO authenticated;
GRANT ALL ON public.club_document_categories TO service_role;
ALTER TABLE public.club_document_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and members read document categories"
  ON public.club_document_categories FOR SELECT TO authenticated
  USING (
    public.can_manage_club_documents(auth.uid(), club_id)
    OR (members_visible AND public.is_club_member(auth.uid(), club_id))
  );
CREATE POLICY "Managers add document categories"
  ON public.club_document_categories FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_club_documents(auth.uid(), club_id) AND standard_key IS NULL);
CREATE POLICY "Managers edit document categories"
  ON public.club_document_categories FOR UPDATE TO authenticated
  USING (public.can_manage_club_documents(auth.uid(), club_id))
  WITH CHECK (public.can_manage_club_documents(auth.uid(), club_id));
CREATE POLICY "Managers remove own document categories"
  ON public.club_document_categories FOR DELETE TO authenticated
  USING (public.can_manage_club_documents(auth.uid(), club_id) AND standard_key IS NULL);

CREATE TABLE public.club_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.club_document_categories(id) ON DELETE RESTRICT,
  title text NOT NULL,
  file_path text NOT NULL UNIQUE,
  file_name text NOT NULL DEFAULT '',
  mime_type text,
  size_bytes bigint,
  members_visible boolean NOT NULL DEFAULT false,
  uploaded_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_documents_title_not_blank CHECK (length(btrim(title)) > 0)
);
CREATE INDEX club_documents_club_category_idx ON public.club_documents (club_id, category_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_documents TO authenticated;
GRANT ALL ON public.club_documents TO service_role;
ALTER TABLE public.club_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.club_document_member_visible(_doc_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_documents d
    JOIN public.club_document_categories c ON c.id = d.category_id AND c.club_id = d.club_id
    WHERE d.id = _doc_id AND d.members_visible AND c.members_visible
  );
$$;
REVOKE EXECUTE ON FUNCTION public.club_document_member_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_document_member_visible(uuid) TO authenticated, service_role;

CREATE POLICY "Managers and members read documents"
  ON public.club_documents FOR SELECT TO authenticated
  USING (
    public.can_manage_club_documents(auth.uid(), club_id)
    OR (members_visible AND public.is_club_member(auth.uid(), club_id) AND public.club_document_member_visible(id))
  );
CREATE POLICY "Managers add documents"
  ON public.club_documents FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_club_documents(auth.uid(), club_id)
    AND file_path LIKE club_id::text || '/library/%'
    AND EXISTS (SELECT 1 FROM public.club_document_categories c WHERE c.id = category_id AND c.club_id = club_documents.club_id)
  );
CREATE POLICY "Managers edit documents"
  ON public.club_documents FOR UPDATE TO authenticated
  USING (public.can_manage_club_documents(auth.uid(), club_id))
  WITH CHECK (
    public.can_manage_club_documents(auth.uid(), club_id)
    AND EXISTS (SELECT 1 FROM public.club_document_categories c WHERE c.id = category_id AND c.club_id = club_documents.club_id)
  );
CREATE POLICY "Managers remove documents"
  ON public.club_documents FOR DELETE TO authenticated
  USING (public.can_manage_club_documents(auth.uid(), club_id));

CREATE OR REPLACE FUNCTION public.club_documents_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_TABLE_NAME = 'club_documents' THEN
    NEW.file_path := OLD.file_path;
    NEW.club_id := OLD.club_id;
  ELSE
    NEW.club_id := OLD.club_id;
    NEW.standard_key := OLD.standard_key;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_club_documents_touch BEFORE UPDATE ON public.club_documents
  FOR EACH ROW EXECUTE FUNCTION public.club_documents_touch();
CREATE TRIGGER trg_club_document_categories_touch BEFORE UPDATE ON public.club_document_categories
  FOR EACH ROW EXECUTE FUNCTION public.club_documents_touch();

-- Standard categories for every club (idempotent, never overwrites edits).
CREATE OR REPLACE FUNCTION public.seed_club_document_categories(_club_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.club_document_categories (club_id, name, standard_key, sort_order, members_visible, created_by)
  SELECT _club_id, v.name, v.key, v.ord, true, NULL
  FROM (VALUES ('Constitution & amendments', 'constitution', 10),
               ('AGM documents', 'agm', 20),
               ('Financial reports', 'financial', 30)) AS v(name, key, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.club_document_categories c
    WHERE c.club_id = _club_id AND (c.standard_key = v.key OR lower(btrim(c.name)) = lower(v.name))
  );
$$;
REVOKE EXECUTE ON FUNCTION public.seed_club_document_categories(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_club_document_categories(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_seed_club_document_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.seed_club_document_categories(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_clubs_seed_document_categories AFTER INSERT ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_club_document_categories();

-- Backfill standard categories for existing clubs.
SELECT public.seed_club_document_categories(c.id) FROM public.clubs c;

-- Storage: library files live under <club_id>/library/ and follow document visibility.
CREATE OR REPLACE FUNCTION public.can_read_club_library_file(_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_documents d
    WHERE d.file_path = _path
      AND (
        public.can_manage_club_documents(auth.uid(), d.club_id)
        OR (public.is_club_member(auth.uid(), d.club_id) AND public.club_document_member_visible(d.id))
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION public.can_read_club_library_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_club_library_file(text) TO authenticated;

DROP POLICY IF EXISTS "Club members read own club documents" ON storage.objects;
CREATE POLICY "Club members read own club documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'club-documents'
  AND (storage.foldername(name))[2] IS DISTINCT FROM 'library'
  AND (
    public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.club_id::text = (storage.foldername(name))[1]
    )
    OR public.is_public_club_document(name)
  )
);

CREATE POLICY "Club library files follow document visibility"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'club-documents'
  AND (storage.foldername(name))[2] = 'library'
  AND public.can_read_club_library_file(name)
);

CREATE POLICY "Document managers upload club library files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'club-documents'
  AND (storage.foldername(name))[2] = 'library'
  AND public.can_manage_club_documents(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Document managers delete club library files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'club-documents'
  AND (storage.foldername(name))[2] = 'library'
  AND public.can_manage_club_documents(auth.uid(), ((storage.foldername(name))[1])::uuid)
);