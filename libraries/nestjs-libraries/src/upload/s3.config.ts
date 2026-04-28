import { S3Client } from '@aws-sdk/client-s3';

export interface S3UploadConfig {
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
  forcePathStyle: boolean;
  acl?: 'public-read';
  disableChecksums: boolean;
}

const isEnabled = (value?: string) =>
  ['true', '1', 'yes'].includes((value || '').toLowerCase());

const normalizePublicUrl = (url: string) => url.replace(/\/+$/, '');

export function getS3UploadConfig(): S3UploadConfig {
  const isCloudflare = (process.env.STORAGE_PROVIDER || 'local') === 'cloudflare';
  const endpoint =
    process.env.S3_ENDPOINT ||
    (process.env.CLOUDFLARE_ACCOUNT_ID
      ? `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : undefined);
  const region =
    process.env.S3_REGION || process.env.CLOUDFLARE_REGION || 'auto';
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID || process.env.CLOUDFLARE_ACCESS_KEY;
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.CLOUDFLARE_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET || process.env.CLOUDFLARE_BUCKETNAME;
  const publicUrl =
    process.env.S3_PUBLIC_URL || process.env.CLOUDFLARE_BUCKET_URL;

  if (!accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    throw new Error(
      'Missing S3 storage configuration. Set S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET and S3_PUBLIC_URL.'
    );
  }

  return {
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicUrl: normalizePublicUrl(publicUrl),
    forcePathStyle: isEnabled(process.env.S3_FORCE_PATH_STYLE),
    acl:
      process.env.S3_UPLOAD_ACL === 'none'
        ? undefined
        : (process.env.S3_UPLOAD_ACL as 'public-read' | undefined) ||
          'public-read',
    disableChecksums:
      isCloudflare || isEnabled(process.env.S3_DISABLE_CHECKSUMS),
  };
}

export function createS3Client(config = getS3UploadConfig()) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: config.disableChecksums
      ? 'WHEN_REQUIRED'
      : undefined,
  });

  if (config.disableChecksums) {
    client.middlewareStack.add(
      (next) =>
        async (args): Promise<any> => {
          const request = args.request as RequestInit;
          const headers = request.headers as Record<string, string>;
          delete headers['x-amz-checksum-crc32'];
          delete headers['x-amz-checksum-crc32c'];
          delete headers['x-amz-checksum-sha1'];
          delete headers['x-amz-checksum-sha256'];
          request.headers = headers;

          return next(args);
        },
      { step: 'build', name: 'removeChecksumHeaders' }
    );
  }

  return client;
}
