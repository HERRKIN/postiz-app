import { PutObjectCommand } from '@aws-sdk/client-s3';
import 'multer';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import { IUploadProvider } from './upload.interface';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';
import {
  createS3Client,
  getS3UploadConfig,
  S3UploadConfig,
} from './s3.config';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fromBuffer } = require('file-type');

const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/tiff',
  'video/mp4',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/ogg',
]);

class S3Storage implements IUploadProvider {
  private _config: S3UploadConfig;
  private _client;

  constructor(config = getS3UploadConfig()) {
    this._config = config;
    this._client = createS3Client(config);
  }

  async uploadSimple(path: string) {
    if (!(await isSafePublicHttpsUrl(path))) {
      throw new Error('Unsafe URL');
    }
    const loadImage = await fetch(path, {
      // @ts-ignore - undici option, not in lib.dom fetch types
      dispatcher: ssrfSafeDispatcher,
    });
    const body = Buffer.from(await loadImage.arrayBuffer());
    const detected = await fromBuffer(body);
    if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
      throw new Error('Unsupported file type.');
    }

    const id = makeId(10);
    const key = `${id}.${detected.ext}`;
    await this._client.send(
      new PutObjectCommand({
        Bucket: this._config.bucket,
        ACL: this._config.acl,
        Key: key,
        Body: body,
        ContentType: detected.mime,
      })
    );

    return `${this._config.publicUrl}/${key}`;
  }

  async uploadFile(file: Express.Multer.File): Promise<any> {
    try {
      const detected = await fromBuffer(file.buffer);
      if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
        throw new Error('Unsupported file type.');
      }

      const id = makeId(10);
      const key = `${id}.${detected.ext}`;
      await this._client.send(
        new PutObjectCommand({
          Bucket: this._config.bucket,
          ACL: this._config.acl,
          Key: key,
          Body: file.buffer,
          ContentType: detected.mime,
        })
      );

      const publicPath = `${this._config.publicUrl}/${key}`;
      return {
        filename: key,
        mimetype: file.mimetype,
        size: file.size,
        buffer: file.buffer,
        originalname: key,
        fieldname: 'file',
        path: publicPath,
        destination: publicPath,
        encoding: '7bit',
        stream: file.buffer as any,
      };
    } catch (err) {
      console.error('Error uploading file to S3 storage:', err);
      throw err;
    }
  }

  async removeFile(filePath: string): Promise<void> {
    return;
  }
}

export { S3Storage };
export default S3Storage;
