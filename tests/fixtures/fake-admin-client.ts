// An in-memory stand-in for the service-role client, holding just what api/uploads/{sign,finalize} touch: the
// two buckets, the rate limiter's answer and the security_events rows. Files land in quarantine the way the
// browser's uploadToSignedUrl would put them there.

type StoredFile = { bytes: Buffer; createdAt: string; contentType?: string };

const NOT_FOUND = { statusCode: '404', message: 'Object not found' };
const ALREADY_EXISTS = { statusCode: '409', message: 'The resource already exists' };

function bucketApi(files: Map<string, StoredFile>) {
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
    download: (path: string) => {
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
      files.set(path, {
        bytes: Buffer.from(body),
        createdAt: new Date().toISOString(),
        contentType: options.contentType,
      });
      return Promise.resolve({ data: { path }, error: null });
    },
    remove: (paths: string[]) => {
      for (const path of paths) files.delete(path);
      return Promise.resolve({ data: [], error: null });
    },
  };
}

export function createFakeAdminClient() {
  const quarantine = new Map<string, StoredFile>();
  const publicMedia = new Map<string, StoredFile>();
  const securityEvents: Record<string, unknown>[] = [];
  const client = {
    storage: {
      from: (bucket: string) => bucketApi(bucket === 'public-media' ? publicMedia : quarantine),
    },
    from: (table: string) => ({
      insert: (row: Record<string, unknown>) => {
        if (table === 'security_events') securityEvents.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  };

  return {
    client,
    quarantine,
    publicMedia,
    securityEvents,
    // What the browser does with the signed URL; `arrivedAt` is when Storage records the file.
    receiveUpload(path: string, bytes: Buffer, arrivedAt: Date = new Date()) {
      quarantine.set(path, { bytes, createdAt: arrivedAt.toISOString() });
    },
    reset() {
      quarantine.clear();
      publicMedia.clear();
      securityEvents.length = 0;
    },
  };
}

export type FakeAdminClient = ReturnType<typeof createFakeAdminClient>;
