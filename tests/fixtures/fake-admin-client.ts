// An in-memory stand-in for the service-role client, holding just what api/uploads/{sign,sign-pages,finalize}
// touch: the two buckets, the staff profiles, the rate limiter and the security_events rows. Storage behaves as
// Supabase does where the pipeline depends on it: a signed URL fills a path only while it is empty, an upsert
// keeps the object's creation time, and exists() answers false with an error for a missing object.

type StoredFile = { bytes: Buffer; createdAt: string; contentType?: string };

export type FakeProfile = {
  role: 'superadmin' | 'admin_rw' | 'none';
  rw_id: number | null;
  is_active: boolean;
  claims_version: number | null;
};

type StaffLike = {
  userId: string;
  role: FakeProfile['role'];
  rwId: number | null;
  claimsVersion: number | null;
};

const NOT_FOUND = { statusCode: '404', message: 'Object not found' };
const ALREADY_EXISTS = { statusCode: '409', message: 'The resource already exists' };

function storeFile(
  files: Map<string, StoredFile>,
  path: string,
  body: Buffer,
  contentType?: string,
) {
  const createdAt = files.get(path)?.createdAt ?? new Date().toISOString();
  files.set(path, { bytes: Buffer.from(body), createdAt, contentType });
}

function bucketApi(files: Map<string, StoredFile>, downloads: string[]) {
  return {
    createSignedUploadUrl: (path: string) =>
      Promise.resolve({
        data: { path, token: `token-for-${path}`, signedUrl: `http://storage.test/${path}` },
        error: null,
      }),
    info: (path: string) => {
      const file = files.get(path);
      return Promise.resolve(
        file
          ? { data: { createdAt: file.createdAt, size: file.bytes.length }, error: null }
          : { data: null, error: NOT_FOUND },
      );
    },
    exists: (path: string) =>
      Promise.resolve(
        files.has(path) ? { data: true, error: null } : { data: false, error: NOT_FOUND },
      ),
    list: (folder: string, options: { limit: number }) => {
      const names = [...files.keys()]
        .filter((path) => path.startsWith(`${folder}/`))
        .map((path) => ({ name: path.slice(folder.length + 1) }));
      return Promise.resolve({ data: names.slice(0, options.limit), error: null });
    },
    download: (path: string) => {
      downloads.push(path);
      const file = files.get(path);
      return Promise.resolve(
        file
          ? { data: new Blob([new Uint8Array(file.bytes)]), error: null }
          : { data: null, error: NOT_FOUND },
      );
    },
    upload: (path: string, body: Buffer, options: { contentType: string; upsert: boolean }) => {
      if (files.has(path) && !options.upsert) {
        return Promise.resolve({ data: null, error: ALREADY_EXISTS });
      }
      storeFile(files, path, body, options.contentType);
      return Promise.resolve({ data: { path }, error: null });
    },
    remove: (paths: string[]) => {
      for (const path of paths) files.delete(path);
      return Promise.resolve({ data: [], error: null });
    },
  };
}

function profilesApi(profiles: Map<string, FakeProfile>) {
  return {
    select: () => ({
      eq: (_column: 'id', id: string) => ({
        maybeSingle: () => Promise.resolve({ data: profiles.get(id) ?? null, error: null }),
      }),
    }),
  };
}

// svc_rate_limit_hit within one window: true while the key has been hit no more than its limit.
function rateLimiter(hits: Map<string, number>) {
  return (name: string, args: { p_key: string; p_limit: number }) => {
    if (name !== 'svc_rate_limit_hit') {
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
    }
    const count = (hits.get(args.p_key) ?? 0) + 1;
    hits.set(args.p_key, count);
    return Promise.resolve({ data: count <= args.p_limit, error: null });
  };
}

export function createFakeAdminClient() {
  const quarantine = new Map<string, StoredFile>();
  const publicMedia = new Map<string, StoredFile>();
  const profiles = new Map<string, FakeProfile>();
  const rateLimitHits = new Map<string, number>();
  const securityEvents: Record<string, unknown>[] = [];
  const downloads: string[] = [];
  const client = {
    storage: {
      from: (bucket: string) =>
        bucketApi(bucket === 'public-media' ? publicMedia : quarantine, downloads),
    },
    from: (table: string) => ({
      ...profilesApi(profiles),
      insert: (row: Record<string, unknown>) => {
        if (table === 'security_events') securityEvents.push(row);
        return Promise.resolve({ error: null });
      },
    }),
    rpc: rateLimiter(rateLimitHits),
  };

  return {
    client,
    quarantine,
    publicMedia,
    profiles,
    rateLimitHits,
    securityEvents,
    // Every path read back in full, in order.
    downloads,
    // The profile a staff context was issued from, as it stands in public.profiles.
    addStaff(staff: StaffLike, changes: Partial<FakeProfile> = {}) {
      profiles.set(staff.userId, {
        role: staff.role,
        rw_id: staff.rwId,
        is_active: true,
        claims_version: staff.claimsVersion,
        ...changes,
      });
    },
    // What the browser does with the signed URL; `arrivedAt` is when Storage records the file. Like Supabase, the
    // URL cannot fill a path that holds an object already, a tombstone included.
    receiveUpload(path: string, bytes: Buffer, arrivedAt: Date = new Date()): boolean {
      if (quarantine.has(path)) return false;
      quarantine.set(path, { bytes, createdAt: arrivedAt.toISOString() });
      return true;
    },
    // Quarantine objects that still hold a file, as opposed to the empty tombstones finalize leaves.
    quarantinedFiles(): string[] {
      return [...quarantine].filter(([, file]) => file.bytes.length > 0).map(([path]) => path);
    },
    reset() {
      quarantine.clear();
      publicMedia.clear();
      profiles.clear();
      rateLimitHits.clear();
      securityEvents.length = 0;
      downloads.length = 0;
    },
  };
}

export type FakeAdminClient = ReturnType<typeof createFakeAdminClient>;
