// An in-memory stand-in for the service-role client, holding just what api/uploads/{sign,sign-pages,finalize}
// touch: the two buckets, the staff profiles, the rate limiter (and the site_settings it reads) and the
// security_events rows. Storage behaves as
// Supabase does where the pipeline depends on it: a signed URL fills a path only while it is empty, an upsert
// keeps the object's creation time, and exists() answers false with an error for a missing object.

type StoredFile = { bytes: Buffer; createdAt: string; contentType?: string };

export type FakeProfile = {
  role: 'superadmin' | 'admin_rw' | 'admin_kopdes' | 'none';
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

// Which write to a bucket fails, counted from 1 across the test (0: none), as a transient Storage error would.
type WriteFaults = { failingWrite: number; writes: number };

const STORAGE_BUSY = { statusCode: '500', message: 'Storage is busy' };

function bucketApi(files: Map<string, StoredFile>, downloads: string[], faults?: WriteFaults) {
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
      if (faults) {
        faults.writes += 1;
        if (faults.writes === faults.failingWrite) {
          return Promise.resolve({ data: null, error: STORAGE_BUSY });
        }
      }
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

// rw_units by id, as checkUploadAccess asks whether an RW exists.
function rwUnitsApi(rwUnits: Set<number>) {
  return {
    select: () => ({
      eq: (_column: 'id', id: number) => ({
        maybeSingle: () => Promise.resolve({ data: rwUnits.has(id) ? { id } : null, error: null }),
      }),
    }),
  };
}

// site_settings by key, as src/lib/rate-limit.ts reads rate_limit_profile.
function settingsApi(settings: Map<string, unknown>) {
  return {
    select: () => ({
      eq: (_column: 'key', key: string) => ({
        maybeSingle: () =>
          Promise.resolve({
            data: settings.has(key) ? { value: settings.get(key) } : null,
            error: null,
          }),
      }),
    }),
  };
}

type RpcArgs = {
  p_key?: string;
  p_limit?: number;
  p_booklet_id?: string;
  p_hold_seconds?: number;
  p_rw_id?: number;
};

const MS_PER_SECOND = 1000;

// svc_rate_limit_hit within one window: true while the key has been hit no more than its limit.
function rateLimitHit(hits: Map<string, number>, args: RpcArgs): boolean {
  const key = args.p_key ?? '';
  const count = (hits.get(key) ?? 0) + 1;
  hits.set(key, count);
  return count <= (args.p_limit ?? 0);
}

// svc_claim_booklet_pages: one claim per booklet and owner, taken over only once older than the hold.
function claimBookletPages(claims: Map<string, number>, args: RpcArgs): boolean {
  const key = bookletClaimKey(args.p_booklet_id ?? '', args.p_rw_id ?? null);
  const claimedAtMs = claims.get(key);
  const holdMs = (args.p_hold_seconds ?? 0) * MS_PER_SECOND;
  if (claimedAtMs !== undefined && Date.now() - claimedAtMs <= holdMs) return false;
  claims.set(key, Date.now());
  return true;
}

export function bookletClaimKey(bookletId: string, rwId: number | null): string {
  return `${bookletId}:${String(rwId ?? 0)}`;
}

function rpcFor(hits: Map<string, number>, claims: Map<string, number>) {
  return (name: string, args: RpcArgs) => {
    if (name === 'svc_rate_limit_hit')
      return Promise.resolve({ data: rateLimitHit(hits, args), error: null });
    if (name === 'svc_claim_booklet_pages') {
      return Promise.resolve({ data: claimBookletPages(claims, args), error: null });
    }
    return Promise.resolve({ data: null, error: { message: `unexpected rpc ${name}` } });
  };
}

function tableApi(
  table: string,
  tables: {
    settings: Map<string, unknown>;
    rwUnits: Set<number>;
    profiles: Map<string, FakeProfile>;
  },
) {
  if (table === 'site_settings') return settingsApi(tables.settings);
  if (table === 'rw_units') return rwUnitsApi(tables.rwUnits);
  return profilesApi(tables.profiles);
}

export function createFakeAdminClient() {
  const quarantine = new Map<string, StoredFile>();
  const publicMedia = new Map<string, StoredFile>();
  const profiles = new Map<string, FakeProfile>();
  const rateLimitHits = new Map<string, number>();
  const settings = new Map<string, unknown>();
  // The RWs of rw_units: the two of the seed.
  const rwUnits = new Set<number>([5, 8]);
  // When each booklet's page claim was taken, by bookletClaimKey.
  const bookletClaims = new Map<string, number>();
  const securityEvents: Record<string, unknown>[] = [];
  const downloads: string[] = [];
  const publicMediaFaults: WriteFaults = { failingWrite: 0, writes: 0 };
  const client = {
    storage: {
      from: (bucket: string) =>
        bucket === 'public-media'
          ? bucketApi(publicMedia, downloads, publicMediaFaults)
          : bucketApi(quarantine, downloads),
    },
    from: (table: string) => ({
      ...tableApi(table, { settings, rwUnits, profiles }),
      insert: (row: Record<string, unknown>) => {
        if (table === 'security_events') securityEvents.push(row);
        return Promise.resolve({ error: null });
      },
    }),
    rpc: rpcFor(rateLimitHits, bookletClaims),
  };

  return {
    client,
    quarantine,
    publicMedia,
    profiles,
    rateLimitHits,
    settings,
    rwUnits,
    bookletClaims,
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
    // Makes the `nth` write to public-media from now on fail once, as a transient Storage error would.
    failPublicMediaWrite(nth: number) {
      publicMediaFaults.failingWrite = publicMediaFaults.writes + nth;
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
      settings.clear();
      bookletClaims.clear();
      securityEvents.length = 0;
      downloads.length = 0;
      publicMediaFaults.failingWrite = 0;
      publicMediaFaults.writes = 0;
    },
  };
}

export type FakeAdminClient = ReturnType<typeof createFakeAdminClient>;
